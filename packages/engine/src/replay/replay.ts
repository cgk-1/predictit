/**
 * Event-driven replay and evaluation. Frames are rebuilt strictly from snapshots received at or before each
 * decision instant; nothing from later snapshots (later bars, later OI, final settlement) is visible to the
 * engine. Paper fills are simulated against the quotes in the frame with explicit cost/slippage/fill rules.
 */
import type { ChainSnapshot, BarSeries, IndexQuote, MarketFrame, ScheduledEvent } from "../types";
import { buildContext, DEFAULT_SETTINGS, type EngineSettings } from "../decisions/context";
import { decide, type DecisionRecord } from "../decisions/decide";
import { closePosition, markPosition, newPaperPosition, observeBid, realizedPnl, type PaperPosition } from "../positions/positions";
import { intrinsic, DEFAULT_COSTS, type CostModel } from "../contracts/payoff";
import { expiryInstantMs } from "../pricing/tte";
import { mean, median, maxDrawdown, longestLosingStreak, quantile } from "../util/stats";

/** A snapshot as stored by the collector/DO: the receipt time is the only thing that orders events. */
export interface StoredSnapshot {
  receivedAt: number;
  kind: "spxChain" | "spyChain" | "spxBars" | "spyBars" | "spxQuote" | "spyQuote" | "esQuote";
  payload: ChainSnapshot | BarSeries | IndexQuote;
}

export interface ReplayOptions {
  /** decision cadence in ms (e.g. 60_000 for minute-by-minute, 10_000 inside the closing window) */
  stepMs: number;
  closingStepMs?: number;
  settings?: EngineSettings;
  costs?: CostModel;
  /** slippage in premium points added to entries and subtracted from exits */
  slippagePts: number;
  /** fail the fill when the quoted size is below qty */
  requireSize: boolean;
  /** latency in ms between decision and fill (fill uses the first snapshot after asOf + latency) */
  latencyMs: number;
  qty: number;
  events?: ScheduledEvent[];
  priorDay?: MarketFrame["priorDay"];
  /** restrict to a strategy family or the closing module; undefined = engine's own choice */
  only?: "closing" | string;
}

export interface ReplayTrade {
  id: string;
  date: string;
  family: string;
  direction: "call" | "put";
  osi: string;
  entryAt: number;
  entrySpot: number;
  entryPremium: number;
  exitAt: number;
  exitPremium: number;
  exitReason: string;
  pnlUsd: number;
  retPct: number;
  phase: string;
  regime: string;
  fillFailed: boolean;
}

export interface ReplayResult {
  dates: string[];
  decisions: number;
  byState: Record<string, number>;
  trades: ReplayTrade[];
  fillFailures: number;
  records: DecisionRecord[];
}

/** Build the as-of frame from snapshots received <= asOf, using the latest of each kind. */
export function frameAt(snaps: StoredSnapshot[], asOf: number, extra?: { events?: ScheduledEvent[]; priorDay?: MarketFrame["priorDay"] }): MarketFrame {
  const f: MarketFrame = { asOf, events: extra?.events, priorDay: extra?.priorDay };
  for (const s of snaps) {
    if (s.receivedAt > asOf) break; // snaps must be sorted by receivedAt
    switch (s.kind) {
      case "spxChain":
        f.spxChain = s.payload as ChainSnapshot;
        break;
      case "spyChain":
        f.spyChain = s.payload as ChainSnapshot;
        break;
      case "spxBars":
        f.spxBars = s.payload as BarSeries;
        break;
      case "spyBars":
        f.spyBars = s.payload as BarSeries;
        break;
      case "spxQuote":
        f.spx = s.payload as IndexQuote;
        break;
      case "spyQuote":
        f.spy = s.payload as IndexQuote;
        break;
      case "esQuote":
        f.es = s.payload as IndexQuote;
        break;
    }
  }
  // derive an SPX quote from the latest completed bar when no quote feed exists (delayed-collector days)
  if (!f.spx && f.spxBars) {
    const bars = f.spxBars.bars.filter((b) => b.t + 60_000 <= asOf);
    const last = bars[bars.length - 1];
    if (last) f.spx = { symbol: "SPX", last: last.c, quoteTime: last.t + 60_000, volume: null, stamp: { ...f.spxBars.stamp, observedAt: last.t + 60_000 } };
  }
  return f;
}

function firstChainAfter(snaps: StoredSnapshot[], t: number): ChainSnapshot | null {
  for (const s of snaps) if (s.kind === "spxChain" && s.receivedAt >= t) return s.payload as ChainSnapshot;
  return null;
}

export function runReplay(snaps: StoredSnapshot[], opts: ReplayOptions): ReplayResult {
  const sorted = [...snaps].sort((a, b) => a.receivedAt - b.receivedAt);
  const settings = opts.settings ?? DEFAULT_SETTINGS;
  const costs = opts.costs ?? DEFAULT_COSTS;
  const t0 = sorted[0]?.receivedAt ?? 0;
  const tEnd = sorted[sorted.length - 1]?.receivedAt ?? 0;
  const records: DecisionRecord[] = [];
  const trades: ReplayTrade[] = [];
  const byState: Record<string, number> = {};
  let positions: PaperPosition[] = [];
  let prev: DecisionRecord | null = null;
  let fillFailures = 0;
  let realizedToday = 0;
  let lastDate = "";
  let t = t0;
  while (t <= tEnd) {
    const frame = frameAt(sorted, t, { events: opts.events, priorDay: opts.priorDay });
    const ctx = buildContext(frame, settings, positions);
    if (ctx.today !== lastDate) {
      realizedToday = 0;
      lastDate = ctx.today;
    }
    const inClosing = ctx.clock.inClosingWindow;
    // manage open positions first
    const stillOpen: PaperPosition[] = [];
    for (let p of positions) {
      if (p.status !== "open") continue;
      const m = markPosition(p, frame.spxChain ?? null, frame.spx?.last ?? null, t, costs);
      p = observeBid(p, m.bid);
      const expMs = expiryInstantMs(p.root, p.expiry);
      if (t >= expMs) {
        // settle at the last SPX value available at/after expiry (replay has no official settlement feed: flagged)
        const settle = frame.spx?.last ?? p.entrySpot ?? 0;
        const closed = closePosition(p, expMs, settle, "settlement", settle);
        const pnl = realizedPnl(closed, costs) ?? 0;
        trades.push(tradeFrom(closed, pnl, ctx, "settlement (last SPX value; not official)", false));
        realizedToday += pnl;
        continue;
      }
      if (m.exitSignal) {
        // fill at the first chain after latency, at bid minus slippage
        const fillChain = firstChainAfter(sorted, t + opts.latencyMs);
        const q = fillChain?.options.find((o) => o.osi === p.osi);
        if (q && q.bid > 0 && (!opts.requireSize || q.bidSize >= p.qty)) {
          const px = Math.max(0, q.bid - opts.slippagePts);
          const closed = closePosition(p, t + opts.latencyMs, px, m.exitSignal.reason, frame.spx?.last ?? null);
          const pnl = realizedPnl(closed, costs) ?? 0;
          trades.push(tradeFrom(closed, pnl, ctx, m.exitSignal.reason, false));
          realizedToday += pnl;
          continue;
        }
        fillFailures++;
      }
      stillOpen.push(p);
    }
    positions = stillOpen;
    const rec = decide({ ctx: buildContext(frame, settings, positions), positions, previous: prev, realizedToday });
    byState[rec.state] = (byState[rec.state] ?? 0) + 1;
    records.push(rec);
    prev = rec;
    // open a paper position on CALL/PUT SETUP with no open position
    if ((rec.state === "CALL SETUP" || rec.state === "PUT SETUP") && !positions.length) {
      const useClosing = !!(rec.closing && inClosing && rec.closing.recommendation.contract);
      const pick = useClosing ? rec.closing!.recommendation.contract! : rec.contracts.find((c) => c.eligible) ?? null;
      const family = useClosing ? "strike-flip" : rec.primary?.family ?? "unknown";
      if (pick && (!opts.only || opts.only === family || (opts.only === "closing" && useClosing))) {
        const fillChain = firstChainAfter(sorted, t + opts.latencyMs);
        const q = fillChain?.options.find((o) => o.osi === pick.osi);
        if (q && q.ask > 0 && (!opts.requireSize || q.askSize >= opts.qty)) {
          const px = q.ask + opts.slippagePts;
          const horizon = useClosing ? null : rec.primary!.horizonMinutes;
          const inval = useClosing ? (pick.right === "C" ? pick.strike : pick.strike) : rec.primary!.invalidationLevel;
          positions.push(
            newPaperPosition(
              {
                osi: q.osi,
                root: q.root,
                expiry: q.expiry,
                right: q.right,
                strike: q.strike,
                qty: opts.qty,
                entryPremium: px,
                entryAt: t + opts.latencyMs,
                entrySpot: frame.spx?.last ?? null,
                strategyId: family,
                decisionId: rec.id,
                invalidationLevel: inval,
                horizonEndsAt: horizon ? t + opts.latencyMs + horizon * 60_000 : null,
                profitTargetPremium: null,
                trail: null,
                note: "",
                mode: "paper",
              },
              `${records.length}`,
            ),
          );
        } else fillFailures++;
      }
    }
    t += inClosing && opts.closingStepMs ? opts.closingStepMs : opts.stepMs;
  }
  return { dates: [...new Set(records.map((r) => r.date))], decisions: records.length, byState, trades, fillFailures, records };
}

function tradeFrom(p: PaperPosition, pnl: number, ctx: ReturnType<typeof buildContext>, reason: string, fillFailed: boolean): ReplayTrade {
  const risk = p.entryPremium * 100 * p.qty;
  return {
    id: p.id,
    date: ctx.today,
    family: p.strategyId ?? "unknown",
    direction: p.right === "C" ? "call" : "put",
    osi: p.osi,
    entryAt: p.entryAt,
    entrySpot: p.entrySpot ?? NaN,
    entryPremium: p.entryPremium,
    exitAt: p.exit?.at ?? NaN,
    exitPremium: p.exit?.reason === "settlement" ? intrinsic(p.right, p.strike, p.exit.premium) : p.exit?.premium ?? NaN,
    exitReason: reason,
    pnlUsd: pnl,
    retPct: risk > 0 ? pnl / risk : NaN,
    phase: ctx.clock.phase,
    regime: `${ctx.regime.trend}/${ctx.regime.gamma}`,
    fillFailed,
  };
}

export interface PerformanceReport {
  n: number;
  netExpectancyUsd: number;
  medianRetPct: number;
  winRate: number;
  payoffRatio: number;
  fullLossRate: number;
  maxDrawdownUsd: number;
  longestLosingStreak: number;
  topWinnerShare: number;
  p10RetPct: number;
  p90RetPct: number;
  totalUsd: number;
  byFamily: Record<string, { n: number; totalUsd: number; winRate: number }>;
  byPhase: Record<string, { n: number; totalUsd: number }>;
  byRegime: Record<string, { n: number; totalUsd: number }>;
}

export function performance(trades: ReplayTrade[]): PerformanceReport {
  const pnl = trades.map((t) => t.pnlUsd);
  const rets = trades.map((t) => t.retPct).filter((x) => Number.isFinite(x));
  const wins = pnl.filter((x) => x > 0);
  const losses = pnl.filter((x) => x <= 0);
  const cum: number[] = [];
  let c = 0;
  for (const x of pnl) {
    c += x;
    cum.push(c);
  }
  const total = c;
  const top = wins.length ? Math.max(...wins) : 0;
  const group = (key: (t: ReplayTrade) => string) => {
    const g: Record<string, { n: number; totalUsd: number; wins: number }> = {};
    for (const t of trades) {
      const k = key(t);
      g[k] = g[k] ?? { n: 0, totalUsd: 0, wins: 0 };
      g[k].n++;
      g[k].totalUsd += t.pnlUsd;
      if (t.pnlUsd > 0) g[k].wins++;
    }
    return g;
  };
  const fam = group((t) => t.family);
  return {
    n: trades.length,
    netExpectancyUsd: trades.length ? mean(pnl) : NaN,
    medianRetPct: rets.length ? median(rets) : NaN,
    winRate: trades.length ? wins.length / trades.length : NaN,
    payoffRatio: wins.length && losses.length ? mean(wins) / Math.abs(mean(losses)) : NaN,
    fullLossRate: trades.length ? trades.filter((t) => t.retPct <= -0.95).length / trades.length : NaN,
    maxDrawdownUsd: maxDrawdown(cum),
    longestLosingStreak: longestLosingStreak(pnl),
    topWinnerShare: total > 0 ? top / total : NaN,
    p10RetPct: rets.length ? quantile(rets, 0.1) : NaN,
    p90RetPct: rets.length ? quantile(rets, 0.9) : NaN,
    totalUsd: total,
    byFamily: Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, { n: v.n, totalUsd: v.totalUsd, winRate: v.n ? v.wins / v.n : NaN }])),
    byPhase: Object.fromEntries(Object.entries(group((t) => t.phase)).map(([k, v]) => [k, { n: v.n, totalUsd: v.totalUsd }])),
    byRegime: Object.fromEntries(Object.entries(group((t) => t.regime)).map(([k, v]) => [k, { n: v.n, totalUsd: v.totalUsd }])),
  };
}
