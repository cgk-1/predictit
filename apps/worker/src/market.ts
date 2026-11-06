/**
 * MarketSession Durable Object — the single source of truth for live state.
 *
 *  - Alarm-chained poll loop (5–15 s during the session, 5 min outside) fetching Schwab (LIVE) when connected,
 *    otherwise Cboe delayed JSON (DELAYED). Nothing is fabricated: if no feed works, mode = NONE.
 *  - Every normalized snapshot is stored (gzip BLOB) with receivedAt/observedAt so replay is strictly as-of.
 *  - The engine runs on every tick; DecisionRecords are appended to an insert-only ledger.
 *  - Positions, settings, Schwab tokens and the "what changed" feed live here too.
 *  - Nightly archive of the day's snapshots to R2 (JSONL.gz) and pruning of old rows.
 */
import { DurableObject } from "cloudflare:workers";
import {
  buildContext,
  decide,
  diffDecisions,
  shouldPersist,
  DEFAULT_SETTINGS,
  DEFAULT_CLOSING_SETTINGS,
  sessionClock,
  etDate,
  etParts,
  markPosition,
  newPaperPosition,
  closePosition,
  observeBid,
  realizedPnl,
  frameAt,
  performance as perfReport,
  parseOptionSymbol,
  seriesSpec,
  underlyingOf,
  type MarketFrame,
  type ChainSnapshot,
  type BarSeries,
  type IndexQuote,
  type DecisionRecord,
  type EngineSettings,
  type EngineContext,
  type ChangeEvent,
  type PaperPosition,
  type StoredSnapshot,
  type Bar1m,
  type ScheduledEvent,
  type ClosingSettings,
  type ReplayTrade,
} from "@predictit/engine";
import {
  CBOE_URLS,
  parseCboeChain,
  parseCboeIntraday,
  fetchCboeJson,
  schwabApi,
  parseSchwabQuote,
  parseSchwabChain,
  parseSchwabHistory,
  refreshTokens,
  exchangeAuthCode,
  extractCodeFromRedirect,
  buildAuthorizeUrl,
  SchwabHttpError,
  type SchwabTokens,
  type CboeChainRaw,
  type CboeIntradayRaw,
} from "@predictit/adapters";
import type { Env } from "./env";

export interface AppSettings {
  engine: EngineSettings;
  closing: ClosingSettings;
  events: ScheduledEvent[];
  maxOpenRiskUsd: number;
  pollSec: { live: number; delayed: number; idle: number };
  retentionDays: number;
  archiveCboe: boolean;
}

export interface FeedHealth {
  source: "schwab" | "cboe-delayed";
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  consecutiveErrors: number;
}

export interface SchwabStatus {
  configured: boolean;
  connected: boolean;
  accessExpiresAt: number | null;
  refreshExpiresAt: number | null;
  lastRefreshAt: number | null;
  lastError: string | null;
}

interface Tick {
  at: number;
  durationMs: number;
  mode: string;
}

const SNAP_KINDS = ["spxChain", "spyChain", "spxBars", "spyBars", "spxQuote", "spyQuote", "esQuote"] as const;

async function gzip(text: string): Promise<ArrayBuffer> {
  const cs = new CompressionStream("gzip");
  const w = cs.writable.getWriter();
  void w.write(new TextEncoder().encode(text));
  void w.close();
  return new Response(cs.readable).arrayBuffer();
}

async function gunzip(buf: ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream("gzip");
  const w = ds.writable.getWriter();
  void w.write(new Uint8Array(buf));
  void w.close();
  return new Response(ds.readable).text();
}

function defaultSettings(env: Env): AppSettings {
  return {
    engine: { ...DEFAULT_SETTINGS, feesPerContract: 0.7 },
    closing: DEFAULT_CLOSING_SETTINGS,
    events: [],
    maxOpenRiskUsd: 3000,
    pollSec: { live: 5, delayed: 60, idle: 300 },
    retentionDays: 7,
    archiveCboe: env.ARCHIVE_CBOE === "true",
  };
}

export class MarketSession extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;
  private settings: AppSettings | null = null;
  private tokens: SchwabTokens | null | undefined = undefined;
  private latest: Partial<Record<(typeof SNAP_KINDS)[number], { receivedAt: number; payload: ChainSnapshot | BarSeries | IndexQuote }>> = {};
  private lastDecision: DecisionRecord | null = null;
  private lastCtx: EngineContext | null = null;
  private changes: ChangeEvent[] = [];
  private feeds: Record<string, FeedHealth> = {
    schwab: { source: "schwab", lastOkAt: null, lastErrorAt: null, lastError: null, lastLatencyMs: null, consecutiveErrors: 0 },
    "cboe-delayed": { source: "cboe-delayed", lastOkAt: null, lastErrorAt: null, lastError: null, lastLatencyMs: null, consecutiveErrors: 0 },
  };
  private ticks: Tick[] = [];
  private liveBars: Map<string, Bar1m[]> = new Map();
  private lastChainFetch: Record<string, number> = {};
  private lastHistoryFetch = 0;
  private schwabLastError: string | null = null;
  private schwabLastRefreshAt: number | null = null;
  private running = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.initSchema();
      await this.loadState();
    });
  }

  // ---------- schema ----------
  private initSchema() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at INTEGER NOT NULL,
      observed_at INTEGER NOT NULL,
      date TEXT NOT NULL,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      mode TEXT NOT NULL,
      body BLOB NOT NULL
    )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS snapshots_date_recv ON snapshots(date, received_at)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      as_of INTEGER NOT NULL,
      date TEXT NOT NULL,
      state TEXT NOT NULL,
      mode TEXT NOT NULL,
      body TEXT NOT NULL
    )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS decisions_date ON decisions(date, as_of)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS positions (id TEXT PRIMARY KEY, date TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS archive_log (date TEXT PRIMARY KEY, archived_at INTEGER NOT NULL, rows INTEGER NOT NULL, bytes INTEGER NOT NULL)`);
  }

  private async loadState() {
    this.settings = (await this.ctx.storage.get<AppSettings>("settings")) ?? null;
    this.tokens = (await this.ctx.storage.get<SchwabTokens>("schwabTokens")) ?? null;
    const today = etDate(Date.now());
    const rows = this.sql.exec<{ at: number; kind: string; text: string }>(`SELECT at, kind, text FROM changes WHERE date = ? ORDER BY id DESC LIMIT 100`, today).toArray();
    this.changes = rows.reverse().map((r) => ({ at: r.at, kind: r.kind as ChangeEvent["kind"], text: r.text }));
    const dec = this.sql.exec<{ body: string }>(`SELECT body FROM decisions WHERE date = ? ORDER BY as_of DESC LIMIT 1`, today).toArray()[0];
    if (dec) this.lastDecision = JSON.parse(dec.body);
    // reload latest snapshots of today so a restart does not lose context
    for (const kind of SNAP_KINDS) {
      const r = this.sql.exec<{ received_at: number; body: ArrayBuffer }>(`SELECT received_at, body FROM snapshots WHERE date = ? AND kind = ? ORDER BY received_at DESC LIMIT 1`, today, kind).toArray()[0];
      if (r) this.latest[kind] = { receivedAt: r.received_at, payload: JSON.parse(await gunzip(r.body)) };
    }
  }

  getSettings(): AppSettings {
    return this.settings ?? defaultSettings(this.env);
  }

  async putSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = { ...this.getSettings(), ...patch, engine: { ...this.getSettings().engine, ...(patch.engine ?? {}) }, closing: { ...this.getSettings().closing, ...(patch.closing ?? {}) } };
    this.settings = next;
    await this.ctx.storage.put("settings", next);
    return next;
  }

  // ---------- Schwab ----------
  schwabStatus(): SchwabStatus {
    const t = this.tokens ?? null;
    const now = Date.now();
    return {
      configured: !!(this.env.SCHWAB_CLIENT_ID && this.env.SCHWAB_CLIENT_SECRET),
      connected: !!t && t.refreshExpiresAt > now,
      accessExpiresAt: t?.accessExpiresAt ?? null,
      refreshExpiresAt: t?.refreshExpiresAt ?? null,
      lastRefreshAt: this.schwabLastRefreshAt,
      lastError: this.schwabLastError,
    };
  }

  schwabAuthUrl(): string {
    if (!this.env.SCHWAB_CLIENT_ID) throw new Error("SCHWAB_CLIENT_ID not configured");
    return buildAuthorizeUrl(this.env.SCHWAB_CLIENT_ID, this.env.SCHWAB_REDIRECT_URI);
  }

  async schwabCallback(redirectedUrl: string): Promise<SchwabStatus> {
    if (!this.env.SCHWAB_CLIENT_ID || !this.env.SCHWAB_CLIENT_SECRET) throw new Error("Schwab client credentials not configured");
    const code = extractCodeFromRedirect(redirectedUrl);
    const t = await exchangeAuthCode(code, this.env.SCHWAB_CLIENT_ID, this.env.SCHWAB_CLIENT_SECRET, this.env.SCHWAB_REDIRECT_URI);
    this.tokens = t;
    this.schwabLastError = null;
    this.schwabLastRefreshAt = Date.now();
    await this.ctx.storage.put("schwabTokens", t);
    await this.ensureAlarm(true);
    return this.schwabStatus();
  }

  async schwabDisconnect(): Promise<void> {
    this.tokens = null;
    await this.ctx.storage.delete("schwabTokens");
  }

  private async accessToken(): Promise<string | null> {
    const t = this.tokens;
    if (!t) return null;
    const now = Date.now();
    if (t.refreshExpiresAt <= now) {
      this.schwabLastError = "Refresh token expired (7-day limit): reconnect Schwab in Settings.";
      return null;
    }
    if (t.accessExpiresAt > now + 15_000) return t.access_token;
    try {
      const nt = await refreshTokens(t, this.env.SCHWAB_CLIENT_ID!, this.env.SCHWAB_CLIENT_SECRET!);
      this.tokens = nt;
      this.schwabLastRefreshAt = now;
      this.schwabLastError = null;
      await this.ctx.storage.put("schwabTokens", nt);
      return nt.access_token;
    } catch (e) {
      this.schwabLastError = `refresh failed: ${(e as Error).message}`;
      return null;
    }
  }

  // ---------- alarm loop ----------
  async ensureAlarm(immediate = false): Promise<void> {
    const cur = await this.ctx.storage.getAlarm();
    if (immediate || cur === null) await this.ctx.storage.setAlarm(Date.now() + (immediate ? 50 : 1000));
  }

  private pollIntervalMs(now: number): number {
    const s = this.getSettings();
    const clock = sessionClock(now);
    const p = etParts(now);
    const inWindow = clock.session.isTradingDay && p.minuteOfDay >= 8 * 60 && p.minuteOfDay <= clock.session.spxOptionsCloseMin + 20;
    if (!inWindow) return s.pollSec.idle * 1000;
    const live = this.schwabStatus().connected;
    let ms = (live ? s.pollSec.live : s.pollSec.delayed) * 1000;
    if (live && clock.inClosingWindow) ms = Math.min(ms, 3000);
    return ms;
  }

  override async alarm(): Promise<void> {
    const start = Date.now();
    try {
      await this.tick();
    } catch (e) {
      this.recordChange({ at: Date.now(), kind: "data", text: `Tick error: ${(e as Error).message}` });
    } finally {
      const next = Date.now() + this.pollIntervalMs(Date.now());
      await this.ctx.storage.setAlarm(next);
      this.ticks.push({ at: start, durationMs: Date.now() - start, mode: this.lastCtx?.mode ?? "NONE" });
      if (this.ticks.length > 120) this.ticks.shift();
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      const clock = sessionClock(now);
      const p = etParts(now);
      const active = clock.session.isTradingDay && p.minuteOfDay >= 8 * 60 && p.minuteOfDay <= clock.session.spxOptionsCloseMin + 20;
      if (active) {
        const token = await this.accessToken();
        if (token) await this.pollSchwab(token, now, clock);
        else await this.pollCboe(now);
      } else {
        await this.maybeArchiveAndPrune(now);
      }
      await this.evaluate(now);
    } finally {
      this.running = false;
    }
  }

  private async pollSchwab(token: string, now: number, clock: ReturnType<typeof sessionClock>): Promise<void> {
    const f = this.feeds.schwab!;
    const t0 = Date.now();
    try {
      const o = { accessToken: token };
      // quotes every tick
      const q = await schwabApi.quotes(["$SPX", "SPY"], o);
      const spx = q.raw["$SPX"] ? parseSchwabQuote("$SPX", q.raw["$SPX"], q.receivedAt) : null;
      const spy = q.raw["SPY"] ? parseSchwabQuote("SPY", q.raw["SPY"], q.receivedAt) : null;
      if (spx) {
        await this.storeSnapshot("spxQuote", spx, spx.quoteTime, q.receivedAt, "schwab", "LIVE", true);
        this.appendLiveBar("SPX", spx);
      }
      if (spy) {
        await this.storeSnapshot("spyQuote", spy, spy.quoteTime, q.receivedAt, "schwab", "LIVE", true);
        this.appendLiveBar("SPY", spy);
      }
      // SPX chain every 10 s (3 s in the closing window), SPY chain every 30 s
      const chainEvery = clock.inClosingWindow ? 3000 : 10_000;
      if (now - (this.lastChainFetch["spx"] ?? 0) >= chainEvery) {
        const today = etDate(now);
        const to = new Date(now + 8 * 86400000).toISOString().slice(0, 10);
        const c = await schwabApi.chain("$SPX", { strikeCount: 60, fromDate: today, toDate: to }, o);
        const chain = parseSchwabChain(c.raw, c.receivedAt);
        if (chain.options.length) await this.storeSnapshot("spxChain", chain, chain.stamp.observedAt, c.receivedAt, "schwab", "LIVE", true);
        this.lastChainFetch["spx"] = now;
      }
      if (now - (this.lastChainFetch["spy"] ?? 0) >= 30_000) {
        const today = etDate(now);
        const to = new Date(now + 5 * 86400000).toISOString().slice(0, 10);
        const c = await schwabApi.chain("SPY", { strikeCount: 30, fromDate: today, toDate: to }, o);
        const chain = parseSchwabChain(c.raw, c.receivedAt);
        if (chain.options.length) await this.storeSnapshot("spyChain", chain, chain.stamp.observedAt, c.receivedAt, "schwab", "LIVE", true);
        this.lastChainFetch["spy"] = now;
      }
      // minute history backfill every 5 min (and on first tick) to seed bars
      if (now - this.lastHistoryFetch >= 5 * 60_000) {
        for (const sym of ["$SPX", "SPY"] as const) {
          const h = await schwabApi.priceHistory(sym, { periodType: "day", period: 2, frequencyType: "minute", frequency: 1, needExtendedHoursData: false }, o);
          const bars = parseSchwabHistory(h.raw, h.receivedAt);
          const key = sym === "$SPX" ? "SPX" : "SPY";
          this.mergeBars(key, bars.bars);
          await this.storeSnapshot(key === "SPX" ? "spxBars" : "spyBars", { ...bars, bars: this.liveBars.get(key) ?? bars.bars }, bars.stamp.observedAt, h.receivedAt, "schwab", "LIVE", true);
        }
        this.lastHistoryFetch = now;
      } else {
        // publish live bars built from quotes
        for (const key of ["SPX", "SPY"] as const) {
          const bars = this.liveBars.get(key);
          if (bars?.length) await this.storeSnapshot(key === "SPX" ? "spxBars" : "spyBars", { symbol: key, bars, stamp: { source: "schwab", mode: "LIVE", observedAt: now, receivedAt: now } }, now, now, "schwab", "LIVE", false);
        }
      }
      f.lastOkAt = Date.now();
      f.lastLatencyMs = Date.now() - t0;
      f.consecutiveErrors = 0;
      f.lastError = null;
    } catch (e) {
      f.lastErrorAt = Date.now();
      f.lastError = e instanceof SchwabHttpError ? `HTTP ${e.status}` : (e as Error).message;
      f.consecutiveErrors++;
      if (e instanceof SchwabHttpError && e.status === 401) this.schwabLastError = "401 from Schwab: token rejected (reconnect).";
      // fall back to Cboe for this tick so the terminal keeps a (delayed) picture
      await this.pollCboe(now);
    }
  }

  private appendLiveBar(symbol: "SPX" | "SPY", q: IndexQuote) {
    const bars = this.liveBars.get(symbol) ?? [];
    const minute = Math.floor(q.quoteTime / 60_000) * 60_000;
    const last = bars[bars.length - 1];
    if (last && last.t === minute) {
      last.h = Math.max(last.h, q.last);
      last.l = Math.min(last.l, q.last);
      last.c = q.last;
      if (symbol === "SPY" && q.volume !== null) last.v = q.volume; // cumulative day volume; differenced at read time if needed
    } else if (!last || minute > last.t) {
      bars.push({ t: minute, o: q.last, h: q.last, l: q.last, c: q.last, v: symbol === "SPY" ? q.volume : null });
    }
    if (bars.length > 2000) bars.splice(0, bars.length - 2000);
    this.liveBars.set(symbol, bars);
  }

  private mergeBars(symbol: "SPX" | "SPY", hist: Bar1m[]) {
    const cur = this.liveBars.get(symbol) ?? [];
    const map = new Map<number, Bar1m>();
    for (const b of hist) map.set(b.t, b);
    for (const b of cur) if (!map.has(b.t) || b.t >= (hist[hist.length - 1]?.t ?? 0)) map.set(b.t, b);
    this.liveBars.set(symbol, [...map.values()].sort((a, b) => a.t - b.t));
  }

  private async pollCboe(now: number): Promise<void> {
    const f = this.feeds["cboe-delayed"]!;
    const t0 = Date.now();
    const s = this.getSettings();
    try {
      const chain = await fetchCboeJson<CboeChainRaw>(CBOE_URLS.spxChain);
      const parsed = parseCboeChain(chain.raw, chain.receivedAt, { maxDays: 95, strikePct: 0.1, today: etDate(now) });
      await this.storeSnapshot("spxChain", parsed, parsed.stamp.observedAt, chain.receivedAt, "cboe-delayed", "DELAYED", s.archiveCboe);
      const intraday = await fetchCboeJson<CboeIntradayRaw>(CBOE_URLS.spxIntraday);
      const bars = parseCboeIntraday(intraday.raw, intraday.receivedAt);
      await this.storeSnapshot("spxBars", bars, bars.stamp.observedAt, intraday.receivedAt, "cboe-delayed", "DELAYED", s.archiveCboe);
      // delayed "quote" = the chain's spot, stamped at its observed time
      const q: IndexQuote = { symbol: "SPX", last: parsed.spot, quoteTime: parsed.spotTime, volume: null, stamp: parsed.stamp };
      await this.storeSnapshot("spxQuote", q, q.quoteTime, chain.receivedAt, "cboe-delayed", "DELAYED", false);
      f.lastOkAt = Date.now();
      f.lastLatencyMs = Date.now() - t0;
      f.consecutiveErrors = 0;
      f.lastError = null;
    } catch (e) {
      f.lastErrorAt = Date.now();
      f.lastError = (e as Error).message;
      f.consecutiveErrors++;
    }
  }

  private async storeSnapshot(kind: (typeof SNAP_KINDS)[number], payload: ChainSnapshot | BarSeries | IndexQuote, observedAt: number, receivedAt: number, source: string, mode: string, persist: boolean) {
    this.latest[kind] = { receivedAt, payload };
    if (!persist) return;
    const body = await gzip(JSON.stringify(payload));
    this.sql.exec(`INSERT INTO snapshots (received_at, observed_at, date, kind, source, mode, body) VALUES (?,?,?,?,?,?,?)`, receivedAt, observedAt, etDate(receivedAt), kind, source, mode, body);
  }

  private currentFrame(now: number): MarketFrame {
    const f: MarketFrame = { asOf: now, events: this.getSettings().events };
    const g = <T,>(k: (typeof SNAP_KINDS)[number]) => this.latest[k]?.payload as T | undefined;
    f.spxChain = g<ChainSnapshot>("spxChain");
    f.spyChain = g<ChainSnapshot>("spyChain");
    f.spxBars = g<BarSeries>("spxBars");
    f.spyBars = g<BarSeries>("spyBars");
    f.spx = g<IndexQuote>("spxQuote");
    f.spy = g<IndexQuote>("spyQuote");
    f.es = g<IndexQuote>("esQuote");
    // prior-day levels from bars of the previous session, if present
    const bars = f.spxBars?.bars ?? [];
    const today = etDate(now);
    const prev = bars.filter((b) => etDate(b.t) < today);
    if (prev.length) {
      const d = etDate(prev[prev.length - 1]!.t);
      const pd = prev.filter((b) => etDate(b.t) === d);
      f.priorDay = { date: d, high: Math.max(...pd.map((b) => b.h)), low: Math.min(...pd.map((b) => b.l)), close: pd[pd.length - 1]!.c };
    } else {
      const chain = f.spxChain as unknown as { prevClose?: number } | undefined;
      void chain;
    }
    return f;
  }

  private async evaluate(now: number): Promise<void> {
    const frame = this.currentFrame(now);
    const positions = this.openPositions();
    const settings = this.getSettings().engine;
    const ctx = buildContext(frame, settings, positions);
    const realizedToday = this.realizedToday(ctx.today);
    const rec = decide({ ctx, positions, previous: this.lastDecision, realizedToday });
    // position bookkeeping: update high bids and persist
    for (const p of positions) {
      const m = rec.positions.find((x) => x.id === p.id);
      const upd = observeBid(p, m?.bid ?? null);
      if (upd !== p) this.savePosition(upd);
    }
    const events = diffDecisions(this.lastDecision, rec, this.lastCtx, ctx);
    for (const e of events) this.recordChange(e);
    if (shouldPersist(this.lastDecision, rec)) {
      this.sql.exec(`INSERT OR IGNORE INTO decisions (id, version, as_of, date, state, mode, body) VALUES (?,?,?,?,?,?,?)`, rec.id, rec.version, rec.asOf, rec.date, rec.state, rec.mode, JSON.stringify(rec));
      this.lastDecision = rec;
    }
    this.lastCtx = ctx;
    this.lastEval = { rec, ctx, at: now };
  }

  private lastEval: { rec: DecisionRecord; ctx: EngineContext; at: number } | null = null;

  private recordChange(e: ChangeEvent) {
    this.changes.push(e);
    if (this.changes.length > 200) this.changes.shift();
    this.sql.exec(`INSERT INTO changes (at, date, kind, text) VALUES (?,?,?,?)`, e.at, etDate(e.at), e.kind, e.text);
  }

  // ---------- positions ----------
  openPositions(): PaperPosition[] {
    return this.sql.exec<{ body: string }>(`SELECT body FROM positions WHERE status = 'open'`).toArray().map((r) => JSON.parse(r.body) as PaperPosition);
  }

  allPositions(date?: string): PaperPosition[] {
    const rows = date ? this.sql.exec<{ body: string }>(`SELECT body FROM positions WHERE date = ? ORDER BY id`, date).toArray() : this.sql.exec<{ body: string }>(`SELECT body FROM positions ORDER BY id DESC LIMIT 500`).toArray();
    return rows.map((r) => JSON.parse(r.body) as PaperPosition);
  }

  private savePosition(p: PaperPosition) {
    this.sql.exec(`INSERT OR REPLACE INTO positions (id, date, status, body) VALUES (?,?,?,?)`, p.id, etDate(p.entryAt), p.status, JSON.stringify(p));
  }

  realizedToday(date: string): number {
    let s = 0;
    for (const p of this.allPositions(date)) {
      const r = realizedPnl(p, { commissionPerContract: this.getSettings().engine.commissionPerContract, feesPerContract: this.getSettings().engine.feesPerContract });
      if (r !== null) s += r;
    }
    return s;
  }

  async openPosition(input: { osi: string; qty: number; entryPremium: number; entryAt?: number; note?: string; invalidationLevel?: number | null; horizonMinutes?: number | null; profitTargetPremium?: number | null; trail?: { activateAt: number; trailPts: number } | null; mode?: "paper" | "manual"; decisionId?: string | null; strategyId?: string | null }): Promise<PaperPosition> {
    const parsed = parseOptionSymbol(input.osi);
    const now = Date.now();
    const entryAt = input.entryAt ?? now;
    const s = this.getSettings();
    const open = this.openPositions();
    const openRisk = open.reduce((a, p) => a + p.entryPremium * 100 * p.qty, 0);
    if (input.entryPremium * 100 > s.engine.maxPremiumPerContract) throw new Error(`Premium $${(input.entryPremium * 100).toFixed(0)} exceeds per-contract budget $${s.engine.maxPremiumPerContract}`);
    if (openRisk + input.entryPremium * 100 * input.qty > s.maxOpenRiskUsd) throw new Error(`Open risk would exceed $${s.maxOpenRiskUsd}`);
    if (this.realizedToday(etDate(now)) <= -s.engine.dailyLossLimit) throw new Error(`Daily loss limit $${s.engine.dailyLossLimit} reached`);
    const spot = (this.latest.spxQuote?.payload as IndexQuote | undefined)?.last ?? null;
    const p = newPaperPosition({
      osi: parsed.osi,
      root: parsed.root,
      expiry: parsed.expiry,
      right: parsed.right,
      strike: parsed.strike,
      qty: input.qty,
      entryPremium: input.entryPremium,
      entryAt,
      entrySpot: spot,
      strategyId: input.strategyId ?? null,
      decisionId: input.decisionId ?? null,
      invalidationLevel: input.invalidationLevel ?? null,
      horizonEndsAt: input.horizonMinutes ? entryAt + input.horizonMinutes * 60_000 : null,
      profitTargetPremium: input.profitTargetPremium ?? null,
      trail: input.trail ?? null,
      note: input.note ?? "",
      mode: input.mode ?? "paper",
    });
    void seriesSpec(parsed.root);
    void underlyingOf(parsed.root);
    this.savePosition(p);
    this.recordChange({ at: now, kind: "position", text: `Opened ${p.mode} position ${p.osi.trim()} ×${p.qty} @ ${p.entryPremium.toFixed(2)}` });
    return p;
  }

  async closePositionById(id: string, premium: number, reason: string): Promise<PaperPosition> {
    const p = this.allPositions().find((x) => x.id === id);
    if (!p) throw new Error("position not found");
    const spot = (this.latest.spxQuote?.payload as IndexQuote | undefined)?.last ?? null;
    const closed = closePosition(p, Date.now(), premium, reason, spot);
    this.savePosition(closed);
    this.recordChange({ at: Date.now(), kind: "position", text: `Closed ${closed.osi.trim()} @ ${premium.toFixed(2)} (${reason}); P&L ${(realizedPnl(closed) ?? 0).toFixed(0)} USD` });
    return closed;
  }

  // ---------- read API ----------
  state() {
    const now = Date.now();
    const ev = this.lastEval;
    const frame = this.currentFrame(now);
    const spxChain = frame.spxChain;
    const ctx = ev?.ctx;
    const rec = ev?.rec ?? null;
    const positions = this.openPositions();
    const marks = positions.map((p) => markPosition(p, spxChain ?? null, frame.spx?.last ?? null, now));
    return {
      serverTime: now,
      clock: sessionClock(now),
      mode: ctx?.mode ?? "NONE",
      feeds: this.feeds,
      schwab: this.schwabStatus(),
      lastTick: this.ticks[this.ticks.length - 1] ?? null,
      tickStats: { n: this.ticks.length, avgMs: this.ticks.length ? Math.round(this.ticks.reduce((a, t) => a + t.durationMs, 0) / this.ticks.length) : null },
      spx: frame.spx ?? null,
      spy: frame.spy ?? null,
      decision: rec,
      decisionAgeMs: rec ? now - rec.asOf : null,
      regime: ctx?.regime ?? null,
      levels: ctx?.levels ?? [],
      bars: ctx?.spxBars ?? null,
      chainFeatures: ctx?.spxChain ?? null,
      gex: ctx?.gex ? { ...ctx.gex, byStrike: ctx.gex.byStrike.filter((r) => Math.abs(r.strike / ctx.gex!.spot - 1) <= 0.05) } : null,
      closing: rec?.closing ?? null,
      positions: positions.map((p) => ({ position: p, mark: marks.find((m) => m.id === p.id) ?? null })),
      realizedToday: this.realizedToday(etDate(now)),
      changes: this.changes.slice(-60),
      settings: this.getSettings(),
      notes: ctx?.notes ?? [],
      evaluatedAt: ev?.at ?? null,
    };
  }

  bars(symbol: "SPX" | "SPY"): BarSeries | null {
    const b = this.latest[symbol === "SPX" ? "spxBars" : "spyBars"]?.payload as BarSeries | undefined;
    return b ?? null;
  }

  chainSlice(pct = 0.03, maxDays = 10): ChainSnapshot | null {
    const c = this.latest.spxChain?.payload as ChainSnapshot | undefined;
    if (!c) return null;
    const today = etDate(Date.now());
    const lim = Date.parse(today) + maxDays * 86400000;
    return { ...c, options: c.options.filter((o) => Math.abs(o.strike / c.spot - 1) <= pct && Date.parse(o.expiry) <= lim) };
  }

  decisions(date: string): DecisionRecord[] {
    return this.sql.exec<{ body: string }>(`SELECT body FROM decisions WHERE date = ? ORDER BY as_of`, date).toArray().map((r) => JSON.parse(r.body));
  }

  changesFor(date: string): ChangeEvent[] {
    return this.sql.exec<{ at: number; kind: string; text: string }>(`SELECT at, kind, text FROM changes WHERE date = ? ORDER BY id`, date).toArray().map((r) => ({ at: r.at, kind: r.kind as ChangeEvent["kind"], text: r.text }));
  }

  dates(): Array<{ date: string; snapshots: number; decisions: number; archived: boolean }> {
    const snaps = this.sql.exec<{ date: string; n: number }>(`SELECT date, COUNT(*) AS n FROM snapshots GROUP BY date`).toArray();
    const decs = this.sql.exec<{ date: string; n: number }>(`SELECT date, COUNT(*) AS n FROM decisions GROUP BY date`).toArray();
    const arch = new Set(this.sql.exec<{ date: string }>(`SELECT date FROM archive_log`).toArray().map((r) => r.date));
    const all = new Set([...snaps.map((s) => s.date), ...decs.map((d) => d.date), ...arch]);
    return [...all].sort().map((date) => ({ date, snapshots: snaps.find((s) => s.date === date)?.n ?? 0, decisions: decs.find((d) => d.date === date)?.n ?? 0, archived: arch.has(date) }));
  }

  /** Reconstruct the as-of frame and decision at `at` from stored snapshots (no hindsight). */
  async replayAt(date: string, at: number): Promise<{ decision: DecisionRecord; ctx: Pick<EngineContext, "regime" | "levels" | "spxBars" | "spxChain" | "mode" | "staleness"> & { gex: EngineContext["gex"] }; frameSummary: { spx: number | null; spotTime: number | null; chainObservedAt: number | null } }> {
    const snaps = await this.loadSnapshots(date, at);
    const frame = frameAt(snaps, at, { events: this.getSettings().events });
    const ctx = buildContext(frame, this.getSettings().engine, []);
    const rec = decide({ ctx, positions: [], previous: null, realizedToday: 0 });
    return {
      decision: rec,
      ctx: { regime: ctx.regime, levels: ctx.levels, spxBars: ctx.spxBars, spxChain: ctx.spxChain, mode: ctx.mode, staleness: ctx.staleness, gex: ctx.gex ? { ...ctx.gex, byStrike: ctx.gex.byStrike.filter((r) => Math.abs(r.strike / ctx.gex!.spot - 1) <= 0.05) } : null },
      frameSummary: { spx: frame.spx?.last ?? null, spotTime: frame.spx?.quoteTime ?? null, chainObservedAt: frame.spxChain?.stamp.observedAt ?? null },
    };
  }

  private async loadSnapshots(date: string, upTo: number): Promise<StoredSnapshot[]> {
    const rows = this.sql.exec<{ received_at: number; kind: string; body: ArrayBuffer }>(`SELECT received_at, kind, body FROM snapshots WHERE date = ? AND received_at <= ? ORDER BY received_at`, date, upTo).toArray();
    const out: StoredSnapshot[] = [];
    // keep memory bounded: only the last 40 chain snapshots before `upTo` matter for as-of (latest wins)
    const chains = rows.filter((r) => r.kind.endsWith("Chain"));
    const keepChains = new Set(chains.slice(-40).map((r) => r.received_at + ":" + r.kind));
    for (const r of rows) {
      if (r.kind.endsWith("Chain") && !keepChains.has(r.received_at + ":" + r.kind)) continue;
      out.push({ receivedAt: r.received_at, kind: r.kind as StoredSnapshot["kind"], payload: JSON.parse(await gunzip(r.body)) });
    }
    return out;
  }

  performance(): { trades: ReplayTrade[]; report: ReturnType<typeof perfReport>; ledger: { decisions: number; byState: Record<string, number> } } {
    const closed = this.allPositions().filter((p) => p.status === "closed");
    const trades: ReplayTrade[] = closed.map((p) => {
      const pnl = realizedPnl(p) ?? 0;
      const risk = p.entryPremium * 100 * p.qty;
      return {
        id: p.id,
        date: etDate(p.entryAt),
        family: p.strategyId ?? "manual",
        direction: p.right === "C" ? "call" : "put",
        osi: p.osi,
        entryAt: p.entryAt,
        entrySpot: p.entrySpot ?? NaN,
        entryPremium: p.entryPremium,
        exitAt: p.exit?.at ?? NaN,
        exitPremium: p.exit?.premium ?? NaN,
        exitReason: p.exit?.reason ?? "",
        pnlUsd: pnl,
        retPct: risk > 0 ? pnl / risk : NaN,
        phase: sessionClock(p.entryAt).phase,
        regime: "n/a",
        fillFailed: false,
      };
    });
    const byState: Record<string, number> = {};
    for (const r of this.sql.exec<{ state: string; n: number }>(`SELECT state, COUNT(*) AS n FROM decisions GROUP BY state`).toArray()) byState[r.state] = r.n;
    const decisions = Object.values(byState).reduce((a, b) => a + b, 0);
    return { trades, report: perfReport(trades), ledger: { decisions, byState } };
  }

  // ---------- archive & prune ----------
  private async maybeArchiveAndPrune(now: number): Promise<void> {
    const s = this.getSettings();
    const today = etDate(now);
    const dates = this.sql.exec<{ date: string }>(`SELECT DISTINCT date FROM snapshots WHERE date < ? ORDER BY date`, today).toArray().map((r) => r.date);
    for (const d of dates) {
      const already = this.sql.exec<{ date: string }>(`SELECT date FROM archive_log WHERE date = ?`, d).toArray().length > 0;
      if (!already) {
        let rows = 0;
        let bytes = 0;
        for (const kind of SNAP_KINDS) {
          const r = this.sql.exec<{ received_at: number; observed_at: number; source: string; mode: string; body: ArrayBuffer }>(`SELECT received_at, observed_at, source, mode, body FROM snapshots WHERE date = ? AND kind = ? ORDER BY received_at`, d, kind).toArray();
          if (!r.length) continue;
          const lines: string[] = [];
          for (const row of r) lines.push(JSON.stringify({ receivedAt: row.received_at, observedAt: row.observed_at, source: row.source, mode: row.mode, kind, payload: JSON.parse(await gunzip(row.body)) }));
          const gz = await gzip(lines.join("\n"));
          await this.env.ARCHIVE.put(`snapshots/${d}/${kind}.jsonl.gz`, gz, { httpMetadata: { contentType: "application/gzip" } });
          rows += r.length;
          bytes += gz.byteLength;
        }
        const decs = this.decisions(d);
        if (decs.length) await this.env.ARCHIVE.put(`decisions/${d}.json`, JSON.stringify(decs), { httpMetadata: { contentType: "application/json" } });
        this.sql.exec(`INSERT INTO archive_log (date, archived_at, rows, bytes) VALUES (?,?,?,?)`, d, now, rows, bytes);
        this.recordChange({ at: now, kind: "data", text: `Archived ${d}: ${rows} snapshots (${(bytes / 1e6).toFixed(1)} MB) to R2.` });
      }
      const cutoff = new Date(now - s.retentionDays * 86400000).toISOString().slice(0, 10);
      if (d < cutoff) this.sql.exec(`DELETE FROM snapshots WHERE date = ?`, d);
    }
  }

  health() {
    return { ok: true, time: Date.now(), feeds: this.feeds, schwab: this.schwabStatus(), lastTick: this.ticks[this.ticks.length - 1] ?? null, latest: Object.fromEntries(Object.entries(this.latest).map(([k, v]) => [k, v?.receivedAt ?? null])) };
  }
}
