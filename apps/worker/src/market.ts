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
  initialWeights,
  reconcileWeights,
  makePredictions,
  gradeDecision,
  summarizeGrades,
  gradeClosingDecision,
  learnerFromGrades,
  applyClosingLearning,
  closingLearnerSummary,
  tickFeatures,
  type DecisionGrade,
  type ClosingGrade,
  type ClosingLearnerState,
  type Instrument,
  scorePredictions,
  leanStats,
  DEFAULT_ENSEMBLE_CONFIG,
  type EnsembleWeights,
  type PendingPrediction,
  type ScoredPrediction,
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
import { fmtEtTime, prevTradingDay } from "@predictit/engine";

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
  credentialSource: "env" | "settings" | null;
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

const SNAP_KINDS = ["spxChain", "spyChain", "spxChainBroad", "spyChainBroad", "spxBars", "spyBars", "spxQuote", "spyQuote", "esQuote", "tickQuote", "vixQuote", "tickBars", "indexBars"] as const;
const EXTRA_INDICES: Array<{ schwab: string; key: string }> = [
  { schwab: "$NDX", key: "NDX" },
  { schwab: "$RUT", key: "RUT" },
  { schwab: "$DJI", key: "DJI" },
  { schwab: "QQQ", key: "QQQ" },
  { schwab: "IWM", key: "IWM" },
  { schwab: "RSP", key: "RSP" },
];

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
    retentionDays: 3,
    archiveCboe: env.ARCHIVE_CBOE === "true",
  };
}

export class MarketSession extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;
  private settings: AppSettings | null = null;
  private tokens: SchwabTokens | null | undefined = undefined;
  private latest: Partial<Record<(typeof SNAP_KINDS)[number], { receivedAt: number; payload: ChainSnapshot | BarSeries | IndexQuote }>> = {};
  private lastDecisionBy: Record<Instrument, DecisionRecord | null> = { SPX: null, SPY: null };
  private lastCtxBy: Record<Instrument, EngineContext | null> = { SPX: null, SPY: null };
  private lastEvalBy: Record<Instrument, { rec: DecisionRecord; ctx: EngineContext; at: number } | null> = { SPX: null, SPY: null };
  private get lastDecision(): DecisionRecord | null {
    return this.lastDecisionBy.SPX;
  }
  private get lastCtx(): EngineContext | null {
    return this.lastCtxBy.SPX;
  }
  private get lastEval() {
    return this.lastEvalBy.SPX;
  }
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
  private weights: EnsembleWeights | null = null;
  private closingLearner: ClosingLearnerState | null = null;
  private quoteDiag: { keys: string[]; errors: unknown; at: number; sample: Record<string, string[] | null> } | null = null;
  private lastGradeSweep = 0;
  private pending: PendingPrediction[] = [];
  private lastPredictionMinute = 0;
  private storedCreds: { clientId: string; clientSecret: string } | null = null;
  /** Discord webhook URL (write-only; never returned to clients). */
  private discordWebhook: string | null = null;
  private alertKeys: Record<Instrument, string> = { SPX: "", SPY: "" };
  private alertLastSentAt: number | null = null;
  private alertLastError: string | null = null;

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
    this.sql.exec(`CREATE TABLE IF NOT EXISTS predictions (id TEXT PRIMARY KEY, at INTEGER NOT NULL, date TEXT NOT NULL, horizon_min INTEGER NOT NULL, score REAL NOT NULL, outcome TEXT, hit INTEGER, ret REAL, body TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS grades (decision_id TEXT PRIMARY KEY, date TEXT NOT NULL, graded_at INTEGER NOT NULL, family TEXT NOT NULL, hit INTEGER, ret REAL, body TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS closing_grades (decision_id TEXT NOT NULL, official INTEGER NOT NULL, date TEXT NOT NULL, graded_at INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (decision_id, official))`);
  }

  private async loadState() {
    this.settings = (await this.ctx.storage.get<AppSettings>("settings")) ?? null;
    this.tokens = (await this.ctx.storage.get<SchwabTokens>("schwabTokens")) ?? null;
    this.closingLearner = (await this.ctx.storage.get<ClosingLearnerState>("closingLearner")) ?? null;
    const storedWeights = (await this.ctx.storage.get<EnsembleWeights>("ensembleWeights")) ?? null;
    this.weights = storedWeights ? reconcileWeights(storedWeights) : null;
    this.pending = (await this.ctx.storage.get<PendingPrediction[]>("pendingPredictions")) ?? [];
    this.storedCreds = (await this.ctx.storage.get<{ clientId: string; clientSecret: string }>("schwabCreds")) ?? null;
    this.discordWebhook = (await this.ctx.storage.get<string>("discordWebhook")) ?? null;
    this.alertKeys = (await this.ctx.storage.get<Record<Instrument, string>>("alertKeys")) ?? { SPX: "", SPY: "" };
    const ops = await this.ctx.storage.get<{ ticks: Tick[]; feeds: Record<string, FeedHealth>; lastChainFetch: Record<string, number>; lastHistoryFetch: number; lastPredictionMinute: number }>("ops");
    if (ops) {
      this.ticks = ops.ticks ?? [];
      this.feeds = { ...this.feeds, ...(ops.feeds ?? {}) };
      this.lastChainFetch = ops.lastChainFetch ?? {};
      this.lastHistoryFetch = ops.lastHistoryFetch ?? 0;
      this.lastPredictionMinute = ops.lastPredictionMinute ?? 0;
    }
    const today = etDate(Date.now());
    const rows = this.sql.exec<{ at: number; kind: string; text: string }>(`SELECT at, kind, text FROM changes WHERE date = ? ORDER BY id DESC LIMIT 100`, today).toArray();
    this.changes = rows.reverse().map((r) => ({ at: r.at, kind: r.kind as ChangeEvent["kind"], text: r.text }));
    for (const inst of ["SPX", "SPY"] as const) {
      const dec = this.sql.exec<{ body: string }>(`SELECT body FROM decisions WHERE date = ? AND id LIKE ? ORDER BY as_of DESC LIMIT 1`, today, `dec_${inst}_%`).toArray()[0];
      if (dec) this.lastDecisionBy[inst] = JSON.parse(dec.body);
    }
    // reload latest snapshots of today so a restart does not lose context
    for (const kind of SNAP_KINDS) {
      const r = this.sql.exec<{ received_at: number; body: ArrayBuffer }>(`SELECT received_at, body FROM snapshots WHERE date = ? AND kind = ? ORDER BY received_at DESC LIMIT 1`, today, kind).toArray()[0];
      if (r) this.latest[kind] = { receivedAt: r.received_at, payload: JSON.parse(await gunzip(r.body)) };
    }
    const ib = this.latest["indexBars"]?.payload as unknown as Record<string, { bars: Bar1m[] }> | undefined;
    if (ib) for (const [k, v] of Object.entries(ib)) this.indexBars.set(k, [...v.bars]);
    // rebuild live bar buffers from the latest stored series so quote-built bars continue after a restart
    for (const [kind, sym] of [["spxBars", "SPX"], ["spyBars", "SPY"]] as const) {
      const b = this.latest[kind]?.payload as BarSeries | undefined;
      if (b?.bars.length && (b.stamp.source === "schwab")) this.liveBars.set(sym, [...b.bars]);
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
  private creds(): { clientId: string; clientSecret: string } | null {
    if (this.env.SCHWAB_CLIENT_ID && this.env.SCHWAB_CLIENT_SECRET) return { clientId: this.env.SCHWAB_CLIENT_ID, clientSecret: this.env.SCHWAB_CLIENT_SECRET };
    return this.storedCreds;
  }

  /** Write-only: credentials entered in Settings are stored in Durable Object storage and never returned. */
  async setSchwabCredentials(clientId: string, clientSecret: string): Promise<SchwabStatus> {
    const id = clientId.trim();
    const sec = clientSecret.trim();
    if (id.length < 8 || sec.length < 8) throw new Error("client id/secret look too short");
    this.storedCreds = { clientId: id, clientSecret: sec };
    await this.ctx.storage.put("schwabCreds", this.storedCreds);
    this.schwabLastError = null;
    return this.schwabStatus();
  }

  // ---------- alerts ----------
  alertsStatus(): { discord: boolean; lastSentAt: number | null; lastError: string | null } {
    return { discord: !!this.discordWebhook, lastSentAt: this.alertLastSentAt, lastError: this.alertLastError };
  }

  /** Write-only. An empty string clears the webhook. Only Discord webhook URLs are accepted. */
  async setDiscordWebhook(url: string): Promise<ReturnType<MarketSession["alertsStatus"]>> {
    const u = url.trim();
    if (u === "") {
      this.discordWebhook = null;
      await this.ctx.storage.delete("discordWebhook");
      this.alertLastError = null;
      return this.alertsStatus();
    }
    if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u)) throw new Error("not a Discord webhook URL");
    this.discordWebhook = u;
    await this.ctx.storage.put("discordWebhook", u);
    this.alertLastError = null;
    this.ctx.waitUntil(this.postDiscord("predictit alerts connected. One line per setup change (SPX and SPY)."));
    return this.alertsStatus();
  }

  private async postDiscord(content: string): Promise<void> {
    if (!this.discordWebhook) return;
    try {
      const res = await fetch(this.discordWebhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: content.slice(0, 1900), username: "predictit", allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok && res.status !== 204) throw new Error(`discord ${res.status}`);
      this.alertLastSentAt = Date.now();
      this.alertLastError = null;
    } catch (e) {
      this.alertLastError = (e as Error).message;
    }
  }

  /** One terse line per setup change. Keyed on action+contract so repeated ticks do not re-send; WAIT<->PASS flips are not alerted. */
  private async maybeAlert(inst: Instrument, rec: DecisionRecord): Promise<void> {
    if (!this.discordWebhook) return;
    const sm = rec.summary;
    if (!sm) return;
    const active = sm.action === "BUY CALL" || sm.action === "BUY PUT" || sm.action === "MANAGE";
    const key = active ? `${sm.action}|${sm.contract?.osi ?? ""}` : "";
    const prev = this.alertKeys[inst] ?? "";
    if (key === prev) return;
    this.alertKeys[inst] = key;
    await this.ctx.storage.put("alertKeys", this.alertKeys);
    const t = fmtEtTime(rec.asOf);
    let line: string;
    if (active) {
      const c = sm.contract;
      const parts = [
        `${inst} · ${sm.action}`,
        c ? `${c.label} ask ${c.ask.toFixed(2)} (risk $${Math.round(c.riskUsd)})` : null,
        sm.expectedMove.toCloseSigmaPts !== null ? `1σ→close ±${sm.expectedMove.toCloseSigmaPts.toFixed(inst === "SPY" ? 2 : 0)}` : null,
        sm.whenToSell[0] ?? null,
        rec.mode,
        `${t} ET`,
      ];
      line = parts.filter(Boolean).join(" · ");
    } else {
      line = `${inst} · setup off → ${sm.action} · ${rec.mode} · ${t} ET`;
    }
    this.ctx.waitUntil(this.postDiscord(line));
  }

  schwabStatus(): SchwabStatus {
    const t = this.tokens ?? null;
    const now = Date.now();
    return {
      configured: !!this.creds(),
      credentialSource: this.env.SCHWAB_CLIENT_ID && this.env.SCHWAB_CLIENT_SECRET ? "env" : this.storedCreds ? "settings" : null,
      connected: !!t && t.refreshExpiresAt > now,
      accessExpiresAt: t?.accessExpiresAt ?? null,
      refreshExpiresAt: t?.refreshExpiresAt ?? null,
      lastRefreshAt: this.schwabLastRefreshAt,
      lastError: this.schwabLastError,
    };
  }

  schwabAuthUrl(): string {
    const c = this.creds();
    if (!c) throw new Error("Schwab client credentials not configured (set them in Settings)");
    return buildAuthorizeUrl(c.clientId, this.env.SCHWAB_REDIRECT_URI);
  }

  async schwabCallback(redirectedUrl: string): Promise<SchwabStatus> {
    const c = this.creds();
    if (!c) throw new Error("Schwab client credentials not configured");
    const code = extractCodeFromRedirect(redirectedUrl);
    const t = await exchangeAuthCode(code, c.clientId, c.clientSecret, this.env.SCHWAB_REDIRECT_URI);
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
      const c = this.creds();
      if (!c) throw new Error("credentials missing");
      const nt = await refreshTokens(t, c.clientId, c.clientSecret);
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
      // the object may be evicted between alarms: keep operational state in storage
      await this.ctx.storage.put("ops", { ticks: this.ticks.slice(-30), feeds: this.feeds, lastChainFetch: this.lastChainFetch, lastHistoryFetch: this.lastHistoryFetch, lastPredictionMinute: this.lastPredictionMinute });
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
      // stamp the decision after the fetches so every input it used was received at or before asOf (replay reproduces it)
      await this.evaluate(Date.now());
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
      const q = await schwabApi.quotes(["$SPX", "SPY", "$TICK", "$VIX", ...EXTRA_INDICES.map((x) => x.schwab)], o);
      // diagnostics: which symbols came back and any per-symbol errors (Schwab reports unknown symbols under "errors")
      this.quoteDiag = { keys: Object.keys(q.raw), errors: (q.raw as any).errors ?? null, at: q.receivedAt, sample: Object.fromEntries(["$TICK", "$VIX"].map((k) => [k, q.raw[k] ? Object.keys(q.raw[k]) : null])) };
      const spx = q.raw["$SPX"] ? parseSchwabQuote("$SPX", q.raw["$SPX"], q.receivedAt) : null;
      const spy = q.raw["SPY"] ? parseSchwabQuote("SPY", q.raw["SPY"], q.receivedAt) : null;
      const tick = q.raw["$TICK"] ? { ...parseSchwabQuote("$TICK", q.raw["$TICK"], q.receivedAt), symbol: "TICK" as const } : null;
      const vix = q.raw["$VIX"] ? { ...parseSchwabQuote("$VIX", q.raw["$VIX"], q.receivedAt), symbol: "VIX" as const } : null;
      if (tick && Number.isFinite(tick.last)) {
        await this.storeSnapshot("tickQuote", tick, tick.quoteTime, q.receivedAt, "schwab", "LIVE", true);
        this.appendLiveBar("TICK", tick);
        const tb = this.liveBars.get("TICK");
        if (tb?.length) await this.storeSnapshot("tickBars", { symbol: "TICK", bars: tb, stamp: { source: "schwab", mode: "LIVE", observedAt: now, receivedAt: now } }, now, now, "schwab", "LIVE", true);
      }
      if (vix && Number.isFinite(vix.last)) {
        await this.storeSnapshot("vixQuote", vix, vix.quoteTime, q.receivedAt, "schwab", "LIVE", true);
        this.appendIndexBar("VIX", vix.last, vix.quoteTime);
      }
      for (const x of EXTRA_INDICES) {
        const e = q.raw[x.schwab];
        if (!e) continue;
        const iq = parseSchwabQuote(x.schwab, e, q.receivedAt);
        if (Number.isFinite(iq.last)) this.appendIndexBar(x.key, iq.last, iq.quoteTime);
      }
      if (this.indexBars.size) {
        const payload: Record<string, { bars: Bar1m[]; last?: number }> = {};
        for (const [k, v] of this.indexBars) payload[k] = { bars: v, last: v[v.length - 1]?.c };
        await this.storeSnapshot("indexBars", payload as unknown as BarSeries, now, now, "schwab", "LIVE", true);
      }
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
      if (now - (this.lastChainFetch["spy"] ?? 0) >= (clock.inClosingWindow ? 5000 : 10_000)) {
        const today = etDate(now);
        const to = new Date(now + 5 * 86400000).toISOString().slice(0, 10);
        const c = await schwabApi.chain("SPY", { strikeCount: 30, fromDate: today, toDate: to }, o);
        const chain = parseSchwabChain(c.raw, c.receivedAt);
        if (chain.options.length) await this.storeSnapshot("spyChain", chain, chain.stamp.observedAt, c.receivedAt, "schwab", "LIVE", true);
        this.lastChainFetch["spy"] = now;
      }
      // broad chains for GEX (±~6% / 45 days) every 5 minutes; execution keeps using the near chains above
      if (now - (this.lastChainFetch["broad"] ?? 0) >= 5 * 60_000) {
        const today = etDate(now);
        const to = new Date(now + 45 * 86400000).toISOString().slice(0, 10);
        const cs = await schwabApi.chain("$SPX", { strikeCount: 120, fromDate: today, toDate: to }, o);
        const bs = parseSchwabChain(cs.raw, cs.receivedAt);
        if (bs.options.length) await this.storeSnapshot("spxChainBroad", bs, bs.stamp.observedAt, cs.receivedAt, "schwab", "LIVE", false);
        const cy = await schwabApi.chain("SPY", { strikeCount: 80, fromDate: today, toDate: to }, o);
        const by = parseSchwabChain(cy.raw, cy.receivedAt);
        if (by.options.length) await this.storeSnapshot("spyChainBroad", by, by.stamp.observedAt, cy.receivedAt, "schwab", "LIVE", false);
        this.lastChainFetch["broad"] = now;
      }
      // minute history backfill every 5 min (and on first tick) to seed bars
      if (now - this.lastHistoryFetch >= 5 * 60_000) {
        for (const sym of ["$SPX", "SPY"] as const) {
          // explicit start/end so the current session's minutes are included (a bare `period` returns completed days only)
          const h = await schwabApi.priceHistory(sym, { periodType: "day", frequencyType: "minute", frequency: 1, startDate: now - 10 * 86400_000, endDate: now, needExtendedHoursData: false }, o);
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

  private indexBars: Map<string, Bar1m[]> = new Map();

  private appendIndexBar(key: string, last: number, t: number) {
    const bars = this.indexBars.get(key) ?? [];
    const minute = Math.floor(t / 60_000) * 60_000;
    const prev = bars[bars.length - 1];
    if (prev && prev.t === minute) {
      prev.h = Math.max(prev.h, last);
      prev.l = Math.min(prev.l, last);
      prev.c = last;
    } else if (!prev || minute > prev.t) bars.push({ t: minute, o: last, h: last, l: last, c: last, v: null });
    if (bars.length > 1200) bars.splice(0, bars.length - 1200);
    this.indexBars.set(key, bars);
  }

  private appendLiveBar(symbol: "SPX" | "SPY" | "TICK", q: IndexQuote) {
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
    if (bars.length > 4200) bars.splice(0, bars.length - 4200); // ≈10 sessions of 1-minute bars
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
    try {
      const chain = await fetchCboeJson<CboeChainRaw>(CBOE_URLS.spxChain);
      const parsed = parseCboeChain(chain.raw, chain.receivedAt, { maxDays: 95, strikePct: 0.1, today: etDate(now) });
      await this.storeSnapshot("spxChain", parsed, parsed.stamp.observedAt, chain.receivedAt, "cboe-delayed", "DELAYED", true);
      const intraday = await fetchCboeJson<CboeIntradayRaw>(CBOE_URLS.spxIntraday);
      const bars = parseCboeIntraday(intraday.raw, intraday.receivedAt);
      await this.storeSnapshot("spxBars", bars, bars.stamp.observedAt, intraday.receivedAt, "cboe-delayed", "DELAYED", true);
      try {
        const spyI = await fetchCboeJson<CboeIntradayRaw>(CBOE_URLS.spyIntraday);
        const spyBars = parseCboeIntraday(spyI.raw, spyI.receivedAt);
        if (spyBars.bars.length) {
          await this.storeSnapshot("spyBars", spyBars, spyBars.stamp.observedAt, spyI.receivedAt, "cboe-delayed", "DELAYED", true);
          const lastBar = spyBars.bars[spyBars.bars.length - 1]!;
          const sq: IndexQuote = { symbol: "SPY", last: lastBar.c, quoteTime: lastBar.t + 60_000, volume: lastBar.v, stamp: spyBars.stamp };
          await this.storeSnapshot("spyQuote", sq, sq.quoteTime, spyI.receivedAt, "cboe-delayed", "DELAYED", false);
        }
      } catch {
        /* SPY intraday is optional */
      }
      // delayed "quote" = the chain's spot, stamped at its observed time
      const q: IndexQuote = { symbol: "SPX", last: parsed.spot, quoteTime: parsed.spotTime, volume: null, stamp: parsed.stamp };
      await this.storeSnapshot("spxQuote", q, q.quoteTime, chain.receivedAt, "cboe-delayed", "DELAYED", true);
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

  private lastPersisted: Record<string, number> = {};

  private async storeSnapshot(kind: (typeof SNAP_KINDS)[number], payload: ChainSnapshot | BarSeries | IndexQuote, observedAt: number, receivedAt: number, source: string, mode: string, persist: boolean) {
    this.latest[kind] = { receivedAt, payload };
    if (!persist) return;
    // bound storage growth: chains/bars at most every 30 s (every tick inside the closing window), quotes every 5 s
    const clock = sessionClock(receivedAt);
    const minGap = clock.inClosingWindow ? 0 : kind.endsWith("Bars") ? 60_000 : kind.endsWith("Chain") ? 30_000 : 5_000;
    if (receivedAt - (this.lastPersisted[kind] ?? 0) < minGap) return;
    this.lastPersisted[kind] = receivedAt;
    // Persist a replay-sized slice of chains (near-money, near-term); the broad chain stays in memory for GEX.
    let toStore: unknown = payload;
    if (kind.endsWith("Chain")) {
      const c = payload as ChainSnapshot;
      const lim = Date.parse(etDate(observedAt)) + 14 * 86400000;
      toStore = { ...c, options: c.options.filter((o) => Math.abs(o.strike / c.spot - 1) <= 0.05 && Date.parse(o.expiry) <= lim) };
    }
    const body = await gzip(JSON.stringify(toStore));
    this.sql.exec(`INSERT INTO snapshots (received_at, observed_at, date, kind, source, mode, body) VALUES (?,?,?,?,?,?,?)`, receivedAt, observedAt, etDate(receivedAt), kind, source, mode, body);
  }

  private currentFrame(now: number): MarketFrame {
    const f: MarketFrame = { asOf: now, events: this.getSettings().events };
    const g = <T,>(k: (typeof SNAP_KINDS)[number]) => this.latest[k]?.payload as T | undefined;
    f.spxChain = g<ChainSnapshot>("spxChain");
    f.spyChain = g<ChainSnapshot>("spyChain");
    f.spxChainBroad = g<ChainSnapshot>("spxChainBroad");
    f.spyChainBroad = g<ChainSnapshot>("spyChainBroad");
    f.spxBars = g<BarSeries>("spxBars");
    f.spyBars = g<BarSeries>("spyBars");
    f.spx = g<IndexQuote>("spxQuote");
    f.spy = g<IndexQuote>("spyQuote");
    f.es = g<IndexQuote>("esQuote");
    f.tick = g<IndexQuote>("tickQuote");
    f.vix = g<IndexQuote>("vixQuote");
    f.tickBars = g<BarSeries>("tickBars");
    const ib = this.latest["indexBars"]?.payload as unknown as Record<string, { bars: Bar1m[]; last?: number }> | undefined;
    if (ib) f.indices = ib;
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
    const learnedClosing = applyClosingLearning(this.getSettings().closing, this.closingLearner);
    let weights = this.weights ?? initialWeights(now);
    let weightsChanged = !this.weights;
    const minute = Math.floor(now / 60_000);
    let madePredictions = false;
    let spxRec: DecisionRecord | null = null;
    for (const inst of ["SPX", "SPY"] as const) {
      const ctx = buildContext(frame, settings, positions, inst);
      if (inst === "SPY" && !ctx.quote && !ctx.rawBars.length) {
        this.lastEvalBy.SPY = null;
        continue;
      }
      // score this instrument's due predictions against its own price path, then decide with the updated weights
      const mine = this.pending.filter((p) => (p.instrument ?? "SPX") === inst);
      const others = this.pending.filter((p) => (p.instrument ?? "SPX") !== inst);
      const scoredRes = scorePredictions(mine, ctx.path, now, weights, DEFAULT_ENSEMBLE_CONFIG);
      if (scoredRes.scored.length || scoredRes.pending.length !== mine.length) {
        for (const sp of scoredRes.scored) this.sql.exec(`INSERT OR REPLACE INTO predictions (id, at, date, horizon_min, score, outcome, hit, ret, body) VALUES (?,?,?,?,?,?,?,?,?)`, sp.id, sp.at, etDate(sp.at), sp.horizonMin, sp.score, sp.outcome, sp.hit === null ? null : sp.hit ? 1 : 0, sp.ret, JSON.stringify(sp));
        this.pending = [...others, ...scoredRes.pending];
        await this.ctx.storage.put("pendingPredictions", this.pending);
      }
      if (scoredRes.scored.length) {
        weights = scoredRes.weights;
        weightsChanged = true;
      }
      const realizedToday = this.realizedToday(ctx.today);
      const rec = decide({ ctx, positions, previous: this.lastDecisionBy[inst], realizedToday, weights, closingSettings: learnedClosing });
      if (inst === "SPX") spxRec = rec;
      // one prediction set per minute per instrument during the regular session
      if (ctx.clock.isRegularSession && minute % 5 === 0 && minute !== this.lastPredictionMinute && ctx.quote && ctx.mode !== "NONE") {
        const preds = makePredictions(rec.lean, ctx.quote.last, DEFAULT_ENSEMBLE_CONFIG, inst).filter((p) => p.dueAt <= ctx.clock.session.closeMs + 60_000);
        this.pending.push(...preds);
        madePredictions = true;
        for (const p of preds) this.sql.exec(`INSERT OR IGNORE INTO predictions (id, at, date, horizon_min, score, outcome, hit, ret, body) VALUES (?,?,?,?,?,?,?,?,?)`, p.id, p.at, etDate(p.at), p.horizonMin, p.score, null, null, null, JSON.stringify(p));
      }
      const events = diffDecisions(this.lastDecisionBy[inst], rec, this.lastCtxBy[inst], ctx);
      for (const e of events) this.recordChange(inst === "SPX" ? e : { ...e, text: e.text.replace(/^(\d\d:\d\d(?::\d\d)?) /, "$1 SPY · ") });
      if (shouldPersist(this.lastDecisionBy[inst], rec)) {
        this.sql.exec(`INSERT OR IGNORE INTO decisions (id, version, as_of, date, state, mode, body) VALUES (?,?,?,?,?,?,?)`, rec.id, rec.version, rec.asOf, rec.date, rec.state, rec.mode, JSON.stringify(rec));
        this.lastDecisionBy[inst] = rec;
      }
      await this.maybeAlert(inst, rec);
      this.lastCtxBy[inst] = ctx;
      this.lastEvalBy[inst] = { rec, ctx, at: now };
    }
    if (madePredictions) {
      this.lastPredictionMinute = minute;
      await this.ctx.storage.put("pendingPredictions", this.pending);
    }
    if (weightsChanged) {
      this.weights = weights;
      await this.ctx.storage.put("ensembleWeights", this.weights);
    }
    // position bookkeeping: update high bids and persist (marks use each position's own chain)
    if (spxRec) {
      for (const p of positions) {
        const m = spxRec.positions.find((x) => x.id === p.id);
        const upd = observeBid(p, m?.bid ?? null);
        if (upd !== p) this.savePosition(upd);
      }
    }
    // continuous self-grading of past recommendations (every 60 s)
    if (now - this.lastGradeSweep >= 60_000) {
      this.lastGradeSweep = now;
      try {
        await this.gradeSweep(now, etDate(now));
      } catch (e) {
        this.recordChange({ at: now, kind: "data", text: `Grading sweep failed: ${(e as Error).message}` });
      }
    }
  }

  private gradesCache: { at: number; value: ReturnType<typeof summarizeGrades> } | null = null;

  private gradesSummaryCached(now: number) {
    if (this.gradesCache && now - this.gradesCache.at < 30_000) return this.gradesCache.value;
    const grades = this.sql.exec<{ body: string }>(`SELECT body FROM grades WHERE hit IS NOT NULL ORDER BY graded_at DESC LIMIT 500`).toArray().map((r) => JSON.parse(r.body) as DecisionGrade);
    const value = summarizeGrades(grades);
    this.gradesCache = { at: now, value };
    return value;
  }

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

  // ---------- self-grading ----------
  private async gradeSweep(now: number, today: string): Promise<void> {
    const costs = { commissionPerContract: this.getSettings().engine.commissionPerContract, feesPerContract: this.getSettings().engine.feesPerContract };
    // 1) intraday recommendations whose horizon has passed and that are not graded yet
    const due = this.sql
      .exec<{ id: string; body: string }>(`SELECT id, body FROM decisions WHERE date = ? AND state IN ('CALL SETUP','PUT SETUP') AND id NOT IN (SELECT decision_id FROM grades) ORDER BY as_of`, today)
      .toArray()
      .map((r) => JSON.parse(r.body) as DecisionRecord)
      .filter((r) => r.primary && now >= r.asOf + r.primary.horizonMinutes * 60_000);
    for (const inst of ["SPX", "SPY"] as const) {
      const mine = due.filter((r) => (r.instrument ?? "SPX") === inst);
      if (!mine.length) continue;
      const first = Math.min(...mine.map((r) => r.asOf));
      const qk = inst === "SPX" ? "spxQuote" : "spyQuote";
      const ck = inst === "SPX" ? "spxChain" : "spyChain";
      const quotes = this.sql.exec<{ received_at: number; body: ArrayBuffer }>(`SELECT received_at, body FROM snapshots WHERE date = ? AND kind = ? AND received_at >= ? ORDER BY received_at`, today, qk, first - 60_000).toArray();
      const path = [];
      for (const r of quotes) {
        const q = JSON.parse(await gunzip(r.body)) as IndexQuote;
        path.push({ t: q.quoteTime, p: q.last });
      }
      const chainRows = this.sql.exec<{ received_at: number; body: ArrayBuffer }>(`SELECT received_at, body FROM snapshots WHERE date = ? AND kind = ? AND received_at >= ? ORDER BY received_at`, today, ck, first - 60_000).toArray();
      const chains = [];
      for (const r of chainRows) chains.push({ receivedAt: r.received_at, chain: JSON.parse(await gunzip(r.body)) as ChainSnapshot });
      let lastKey = "";
      let lastAt = 0;
      for (const r of mine) {
        // episode dedup: one grade per (family, direction, primary id) unless ≥ 5 minutes apart
        const key = `${r.primary?.family}:${r.primary?.direction}:${r.primary?.id}`;
        if (key === lastKey && r.asOf - lastAt < 5 * 60_000) {
          this.sql.exec(`INSERT OR IGNORE INTO grades (decision_id, date, graded_at, family, hit, ret, body) VALUES (?,?,?,?,?,?,?)`, r.id, today, now, r.primary?.family ?? "", null, null, JSON.stringify({ skipped: "duplicate-episode", of: lastKey }));
          continue;
        }
        const g = gradeDecision({ record: r, path, chains, now, costs, slippagePts: 0.05, latencyMs: 2000 });
        if (!g) continue;
        lastKey = key;
        lastAt = r.asOf;
        this.sql.exec(`INSERT OR REPLACE INTO grades (decision_id, date, graded_at, family, hit, ret, body) VALUES (?,?,?,?,?,?,?)`, g.decisionId, today, g.gradedAt, g.family, g.directionHit ? 1 : 0, g.wouldHaveRetPct, JSON.stringify(g));
        this.recordChange({ at: now, kind: "position", text: `Graded ${inst} ${g.family} ${g.direction} from ${fmtEtTime(g.decidedAt)}: underlying ${(g.underlyingRetPct * 100).toFixed(2)}%, would-have ${g.wouldHaveRetPct === null ? "n/a" : (g.wouldHaveRetPct * 100).toFixed(0) + "%"}${g.invalidated ? " (invalidated)" : ""}.` });
      }
    }
    // 2) closing-window recommendations: provisional at the close (last SPX print), official once the next session's
    //    chain reports prev_day_close (= official S&P 500 close used for SPXW PM settlement)
    const clock = sessionClock(now);
    const closeMs = clock.session.closeMs;
    const dates = [today, ...(clock.session.isTradingDay ? [prevTradingDay(today)] : [])];
    for (const d of dates) {
      const isToday = d === today;
      if (isToday && now < closeMs + 30_000) continue;
      const settleOfficial = !isToday ? this.officialCloseFor(d) : null;
      const official = settleOfficial !== null;
      if (!isToday && !official) continue;
      const recs = this.sql
        .exec<{ id: string; body: string }>(`SELECT id, body FROM decisions WHERE date = ? AND id NOT IN (SELECT decision_id FROM closing_grades WHERE official = ?) ORDER BY as_of`, d, official ? 1 : 0)
        .toArray()
        .map((r) => JSON.parse(r.body) as DecisionRecord)
        .filter((r) => r.closing && r.closing.subWindow !== "pre" && r.closing.subWindow !== "closed");
      if (!recs.length) continue;
      const lastTick = await this.lastSpxAtOrAfter(d, closeMs - (isToday ? 0 : 0));
      const settlement = official ? settleOfficial! : lastTick;
      if (settlement === null) continue;
      for (const r of recs) {
        const g = gradeClosingDecision(r.id, r.closing!, settlement, official, lastTick, costs);
        this.sql.exec(`INSERT OR REPLACE INTO closing_grades (decision_id, official, date, graded_at, body) VALUES (?,?,?,?,?)`, r.id, official ? 1 : 0, d, now, JSON.stringify(g));
        // learn from each session once: fold the official grade when available, otherwise the provisional one is folded
        // the next day only if no official arrives (handled by the official pass replacing it)
      }
      // one record per session, official preferred: rebuild the learner from the ledger
      const all = this.sql.exec<{ body: string }>(`SELECT body FROM closing_grades ORDER BY graded_at`).toArray().map((x) => JSON.parse(x.body) as ClosingGrade);
      this.closingLearner = learnerFromGrades(all, this.getSettings().closing, (ms) => etDate(ms), (ms) => etParts(ms).minuteOfDay);
      await this.ctx.storage.put("closingLearner", this.closingLearner);
      this.recordChange({ at: now, kind: "closing", text: `Graded ${recs.length} closing-window record(s) for ${d} against ${official ? "the official close" : "the last SPX print (provisional)"} ${settlement.toFixed(2)}.` });
    }
  }

  /**
   * The official prior-session close: from the Schwab $SPX quote's closePrice (prevClose) on the next session, or the
   * Cboe chain's prev_day_close. Null until the next session has started.
   */
  private officialCloseFor(date: string): number | null {
    const q = this.latest.spxQuote?.payload as IndexQuote | undefined;
    if (q?.prevClose && prevTradingDay(etDate(q.quoteTime)) === date) return q.prevClose;
    const c = this.latest.spxChain?.payload as ChainSnapshot | undefined;
    if (c?.prevClose && prevTradingDay(etDate(c.stamp.observedAt)) === date) return c.prevClose;
    return null;
  }

  /** The last SPX print at or before the close (the 15:59:59 print), not the first post-close print. */
  private async lastSpxAtOrAfter(date: string, t: number): Promise<number | null> {
    const r = this.sql.exec<{ body: ArrayBuffer }>(`SELECT body FROM snapshots WHERE date = ? AND kind = 'spxQuote' AND observed_at <= ? ORDER BY observed_at DESC LIMIT 1`, date, t).toArray()[0];
    if (!r) return null;
    const q = JSON.parse(await gunzip(r.body)) as IndexQuote;
    return q.last;
  }

  grades(): { grades: DecisionGrade[]; summary: ReturnType<typeof summarizeGrades>; closing: { grades: ClosingGrade[]; learner: ReturnType<typeof closingLearnerSummary> } } {
    const grades = this.sql.exec<{ body: string }>(`SELECT body FROM grades WHERE hit IS NOT NULL ORDER BY graded_at DESC LIMIT 500`).toArray().map((r) => JSON.parse(r.body) as DecisionGrade);
    const cg = this.sql.exec<{ body: string }>(`SELECT body FROM closing_grades ORDER BY graded_at DESC LIMIT 300`).toArray().map((r) => JSON.parse(r.body) as ClosingGrade);
    return { grades, summary: summarizeGrades(grades), closing: { grades: cg, learner: closingLearnerSummary(this.closingLearner, this.getSettings().closing) } };
  }

  // ---------- read API ----------
  private packInstrument(inst: Instrument, now: number) {
    const ev = this.lastEvalBy[inst];
    const ctx = ev?.ctx;
    const rec = ev?.rec ?? null;
    return {
      instrument: inst,
      mode: ctx?.mode ?? "NONE",
      quote: ctx?.quote ?? null,
      decision: rec,
      decisionAgeMs: rec ? now - rec.asOf : null,
      regime: ctx?.regime ?? null,
      levels: ctx?.levels ?? [],
      bars: ctx?.bars ?? null,
      chainFeatures: ctx?.chain ?? null,
      // compact GEX summary only (no per-strike rows): the Gamma view fetches /api/gex for the detail
      gex: ctx?.gex ? { ...ctx.gex, byStrike: [], flip: { ...ctx.gex.flip, profile: [], profile0dte: [] } } : null,
      closing: rec?.closing ?? null,
      mtf: ctx?.mtf ?? null,
      cross: ctx?.cross ?? null,
      notes: ctx?.notes ?? [],
      evaluatedAt: ev?.at ?? null,
    };
  }

  async state() {
    const now = Date.now();
    // after a restart/redeploy the in-memory evaluation is gone: rebuild it from the reloaded snapshots on demand
    if (!this.lastEvalBy.SPX && Object.keys(this.latest).length && !this.running) {
      try {
        await this.evaluate(now);
      } catch (e) {
        this.recordChange({ at: now, kind: "data", text: `On-demand evaluation failed: ${(e as Error).message}` });
      }
    }
    const frame = this.currentFrame(now);
    const positions = this.openPositions();
    const marks = positions.map((p) => markPosition(p, (p.root === "SPY" ? frame.spyChain : frame.spxChain) ?? null, (p.root === "SPY" ? frame.spy?.last : frame.spx?.last) ?? null, now));
    const spx = this.packInstrument("SPX", now);
    const spy = this.packInstrument("SPY", now);
    const indices: Record<string, { last: number | null; ret15: number | null }> = {};
    for (const [k, v] of this.indexBars) {
      const done = v.filter((b) => b.t + 60_000 <= now);
      const last = done[done.length - 1]?.c ?? null;
      const prev = done.length > 15 ? done[done.length - 16]!.c : null;
      indices[k] = { last, ret15: last !== null && prev ? last / prev - 1 : null };
    }
    return {
      serverTime: now,
      clock: sessionClock(now),
      mode: spx.mode,
      feeds: this.feeds,
      schwab: this.schwabStatus(),
      lastTick: this.ticks[this.ticks.length - 1] ?? null,
      tickStats: { n: this.ticks.length, avgMs: this.ticks.length ? Math.round(this.ticks.reduce((a, t) => a + t.durationMs, 0) / this.ticks.length) : null },
      spx: frame.spx ?? null,
      spy: frame.spy ?? null,
      tick: frame.tick ?? null,
      vix: frame.vix ?? null,
      tickFeatures: spx.decision ? this.lastEvalBy.SPX!.ctx.tick : tickFeatures(frame.tickBars?.bars, frame.tick, now),
      grades: this.gradesSummaryCached(now),
      indices,
      // SPX fields at the top level for compatibility; per-instrument packs below
      decision: spx.decision,
      decisionAgeMs: spx.decisionAgeMs,
      regime: spx.regime,
      levels: spx.levels,
      bars: spx.bars,
      chainFeatures: spx.chainFeatures,
      gex: spx.gex,
      closing: spx.closing,
      instruments: { SPX: spx, SPY: spy },
      positions: positions.map((p) => ({ position: p, mark: marks.find((m) => m.id === p.id) ?? null })),
      realizedToday: this.realizedToday(etDate(now)),
      changes: this.changes.slice(-60),
      settings: this.getSettings(),
      notes: spx.notes,
      evaluatedAt: spx.evaluatedAt,
    };
  }

  gexDetail(inst: Instrument) {
    const ctx = this.lastEvalBy[inst]?.ctx;
    if (!ctx?.gex) return null;
    return { ...ctx.gex, byStrike: ctx.gex.byStrike.filter((r) => Math.abs(r.strike / ctx.gex!.spot - 1) <= 0.06) };
  }

  lean(): { stats: ReturnType<typeof leanStats>; weights: EnsembleWeights; pending: number; recent: ScoredPrediction[]; config: typeof DEFAULT_ENSEMBLE_CONFIG } {
    const w = this.weights ?? initialWeights(Date.now());
    const recent = this.sql.exec<{ body: string }>(`SELECT body FROM predictions WHERE outcome IS NOT NULL ORDER BY at DESC LIMIT 100`).toArray().map((r) => JSON.parse(r.body) as ScoredPrediction);
    return { stats: leanStats(w), weights: w, pending: this.pending.length, recent, config: DEFAULT_ENSEMBLE_CONFIG };
  }

  bars(symbol: "SPX" | "SPY"): BarSeries | null {
    const b = this.latest[symbol === "SPX" ? "spxBars" : "spyBars"]?.payload as BarSeries | undefined;
    return b ?? null;
  }

  /** Bars as they were known at `at` on `date` (for the Replay chart): latest stored series received at or before `at`, trimmed to completed bars. */
  async barsAt(symbol: "SPX" | "SPY", date: string, at: number): Promise<BarSeries | null> {
    const kind = symbol === "SPX" ? "spxBars" : "spyBars";
    const r = this.sql.exec<{ body: ArrayBuffer }>(`SELECT body FROM snapshots WHERE date = ? AND kind = ? AND received_at <= ? ORDER BY received_at DESC LIMIT 1`, date, kind, at).toArray()[0];
    if (!r) return null;
    const b = JSON.parse(await gunzip(r.body)) as BarSeries;
    return { ...b, bars: b.bars.filter((x) => x.t + 60_000 <= at) };
  }

  /** Full export of a day's ledger: decisions, changes, positions, scored predictions. */
  exportDay(date: string): { date: string; decisions: DecisionRecord[]; changes: ChangeEvent[]; positions: PaperPosition[]; predictions: unknown[] } {
    return {
      date,
      decisions: this.decisions(date),
      changes: this.changesFor(date),
      positions: this.allPositions(date),
      predictions: this.sql.exec<{ body: string }>(`SELECT body FROM predictions WHERE date = ? ORDER BY at`, date).toArray().map((r) => JSON.parse(r.body)),
    };
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
  async replayAt(date: string, at: number, instrument: Instrument = "SPX"): Promise<{ decision: DecisionRecord; ctx: { regime: EngineContext["regime"]; levels: EngineContext["levels"]; spxBars: EngineContext["bars"]; spxChain: EngineContext["chain"]; mode: EngineContext["mode"]; staleness: EngineContext["staleness"]; gex: EngineContext["gex"] }; frameSummary: { spx: number | null; spotTime: number | null; chainObservedAt: number | null } }> {
    const snaps = await this.loadSnapshots(date, at);
    const frame = frameAt(snaps, at, { events: this.getSettings().events });
    const ctx = buildContext(frame, this.getSettings().engine, [], instrument);
    const rec = decide({ ctx, positions: [], previous: null, realizedToday: 0 });
    return {
      decision: rec,
      ctx: { regime: ctx.regime, levels: ctx.levels, spxBars: ctx.bars, spxChain: ctx.chain, mode: ctx.mode, staleness: ctx.staleness, gex: ctx.gex ? { ...ctx.gex, byStrike: ctx.gex.byStrike.filter((r) => Math.abs(r.strike / ctx.gex!.spot - 1) <= 0.05) } : null },
      frameSummary: { spx: ctx.quote?.last ?? null, spotTime: ctx.quote?.quoteTime ?? null, chainObservedAt: ctx.chainSnapshot?.stamp.observedAt ?? null },
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
  /** Force-archive one date to R2 (operational endpoint; re-archiving overwrites the objects). Does not prune. */
  async archiveDate(date: string): Promise<{ date: string; rows: number; bytes: number }> {
    const r = await this.archiveOne(date, Date.now());
    return { date, ...r };
  }

  private async archiveOne(d: string, now: number): Promise<{ rows: number; bytes: number }> {
    const s = this.getSettings();
    let rows = 0;
    let bytes = 0;
    for (const kind of SNAP_KINDS) {
      const r = this.sql.exec<{ received_at: number; observed_at: number; source: string; mode: string; body: ArrayBuffer }>(`SELECT received_at, observed_at, source, mode, body FROM snapshots WHERE date = ? AND kind = ? ORDER BY received_at`, d, kind).toArray().filter((row) => s.archiveCboe || row.source !== "cboe-delayed");
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
    const preds = this.sql.exec<{ body: string }>(`SELECT body FROM predictions WHERE date = ? ORDER BY at`, d).toArray().map((r) => r.body);
    if (preds.length) await this.env.ARCHIVE.put(`predictions/${d}.jsonl`, preds.join("\n"), { httpMetadata: { contentType: "application/jsonl" } });
    this.sql.exec(`INSERT OR REPLACE INTO archive_log (date, archived_at, rows, bytes) VALUES (?,?,?,?)`, d, now, rows, bytes);
    this.recordChange({ at: now, kind: "data", text: `Archived ${d}: ${rows} snapshots (${(bytes / 1e6).toFixed(1)} MB), ${decs.length} decisions to R2.` });
    return { rows, bytes };
  }

  private async maybeArchiveAndPrune(now: number): Promise<void> {
    const s = this.getSettings();
    const today = etDate(now);
    const dates = this.sql.exec<{ date: string }>(`SELECT DISTINCT date FROM snapshots WHERE date < ? ORDER BY date`, today).toArray().map((r) => r.date);
    for (const d of dates) {
      const already = this.sql.exec<{ date: string }>(`SELECT date FROM archive_log WHERE date = ?`, d).toArray().length > 0;
      if (!already) await this.archiveOne(d, now);
      const cutoff = new Date(now - s.retentionDays * 86400000).toISOString().slice(0, 10);
      if (d < cutoff) this.sql.exec(`DELETE FROM snapshots WHERE date = ?`, d);
    }
  }

  health() {
    return { ok: true, time: Date.now(), feeds: this.feeds, schwab: this.schwabStatus(), lastTick: this.ticks[this.ticks.length - 1] ?? null, latest: Object.fromEntries(Object.entries(this.latest).map(([k, v]) => [k, v?.receivedAt ?? null])), quoteDiag: this.quoteDiag };
  }
}
