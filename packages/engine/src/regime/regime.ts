/**
 * Continuously updated market-state assessment. Labels use only information available at asOf
 * (no finished-session statistics, no future bars). Each label states the evidence it was derived from.
 */
import type { DataQualityNote, ScheduledEvent } from "../types";
import type { BarFeatures } from "../features/bars";
import type { ChainFeatures } from "../features/chain";
import type { GexSummary } from "../gex/gex";
import { gexRegimeLabel } from "../gex/gex";
import type { SessionClock } from "../time/session";

export type TrendLabel = "trend-up" | "trend-down" | "range" | "unknown";
export type StructureLabel = "breakout-up" | "breakout-down" | "failed-breakout-up" | "failed-breakout-down" | "inside-range" | "unknown";
export type VolLabel = "compression" | "expansion" | "normal" | "unknown";
export type LiquidityLabel = "good" | "fair" | "poor" | "unknown";
export type Confidence = "high" | "medium" | "low";

export interface RegimeAssessment {
  asOf: number;
  trend: TrendLabel;
  structure: StructureLabel;
  volatility: VolLabel;
  rvOverIv: number | null;
  liquidity: LiquidityLabel;
  participation: "unknown" | "broad" | "narrow";
  gamma: "positive" | "negative" | "near-flip" | "unknown";
  eventRisk: { level: "none" | "low" | "medium" | "high"; next: ScheduledEvent | null; minutesUntil: number | null };
  dataConfidence: Confidence;
  evidence: string[];
  notes: DataQualityNote[];
}

export interface RegimeInputs {
  clock: SessionClock;
  spxBars: BarFeatures | null;
  spyBars: BarFeatures | null;
  spxChain: ChainFeatures | null;
  gex: GexSummary | null;
  events: ScheduledEvent[];
  staleness: { spxMs: number | null; chainMs: number | null; barsMs: number | null };
  mode: "LIVE" | "DELAYED" | "REPLAY" | "NONE";
}

export function assessRegime(i: RegimeInputs): RegimeAssessment {
  const ev: string[] = [];
  const notes: DataQualityNote[] = [];
  const asOf = i.clock.now;
  const b = i.spxBars;
  // trend vs range: efficiency ratio + 60m return
  let trend: TrendLabel = "unknown";
  if (b && b.er60 !== null && b.ret60 !== null) {
    if (b.er60 >= 0.3 && Math.abs(b.ret60) >= 0.002) {
      trend = b.ret60 > 0 ? "trend-up" : "trend-down";
      ev.push(`60m efficiency ratio ${b.er60.toFixed(2)} with ${(b.ret60 * 100).toFixed(2)}% move → ${trend}.`);
    } else {
      trend = "range";
      ev.push(`60m efficiency ratio ${b.er60.toFixed(2)} and ${(b.ret60 * 100).toFixed(2)}% net move → range.`);
    }
  } else if (b && b.nBars > 0 && b.nBars < 61) {
    ev.push(`Only ${b.nBars} completed bars this session; trend label needs 61.`);
  }
  // structure relative to the opening range (30m) and session extremes
  let structure: StructureLabel = "unknown";
  if (b && b.or30 && b.or30.complete && b.last !== null && b.sessHigh !== null && b.sessLow !== null) {
    const { high, low } = b.or30;
    if (b.last > high) structure = "breakout-up";
    else if (b.last < low) structure = "breakout-down";
    else if (b.sessHigh > high && b.last <= high) structure = "failed-breakout-up";
    else if (b.sessLow < low && b.last >= low) structure = "failed-breakout-down";
    else structure = "inside-range";
    ev.push(`Price ${b.last.toFixed(1)} vs 30m opening range ${low.toFixed(1)}–${high.toFixed(1)} → ${structure}.`);
  }
  // volatility: compression ratio and RV vs IV
  let volatility: VolLabel = "unknown";
  if (b && b.compression15 !== null) {
    volatility = b.compression15 <= 0.55 ? "compression" : b.compression15 >= 1.6 ? "expansion" : "normal";
    ev.push(`Last 15m range is ${b.compression15.toFixed(2)}× the session's median 15m range → ${volatility}.`);
  }
  const rvOverIv = b?.rv30 && i.spxChain?.front?.atmIv ? b.rv30 / i.spxChain.front.atmIv : null;
  if (rvOverIv !== null) ev.push(`30m realized vol ${(b!.rv30! * 100).toFixed(1)}% vs 0DTE ATM IV ${(i.spxChain!.front!.atmIv! * 100).toFixed(1)}% (ratio ${rvOverIv.toFixed(2)}).`);
  // liquidity from front-expiry ATM spread
  let liquidity: LiquidityLabel = "unknown";
  const lq = i.spxChain?.liquidity;
  if (lq && lq.atmSpreadPct !== null) {
    liquidity = lq.atmSpreadPct <= 0.02 ? "good" : lq.atmSpreadPct <= 0.06 ? "fair" : "poor";
    ev.push(`ATM spread ${(lq.atmSpreadPct * 100).toFixed(1)}% of mid (${lq.atmSpread?.toFixed(2)}), sizes ${lq.atmBidSize}×${lq.atmAskSize} → liquidity ${liquidity}.`);
  }
  // participation: breadth not available from current feeds
  let participation: RegimeAssessment["participation"] = "unknown";
  if (i.spyBars && i.spyBars.vwap !== null && i.spxBars?.ret15 !== null && i.spyBars.ret15 !== null && i.spxBars) {
    const agree = Math.sign(i.spyBars.ret15) === Math.sign(i.spxBars.ret15 ?? 0);
    ev.push(`SPY 15m return ${(i.spyBars.ret15 * 100).toFixed(2)}% ${agree ? "confirms" : "diverges from"} SPX.`);
  }
  notes.push({ level: "info", message: "Breadth/sector participation is not available from the connected feeds; participation is labelled unknown." });
  // gamma
  let gamma: RegimeAssessment["gamma"] = "unknown";
  if (i.gex) {
    const g = gexRegimeLabel(i.gex);
    gamma = g.label;
    ev.push(g.text);
  }
  // events
  const upcoming = i.events.filter((e) => e.at >= asOf).sort((a, b) => a.at - b.at);
  const next = upcoming[0] ?? null;
  const minutesUntil = next ? (next.at - asOf) / 60000 : null;
  let level: RegimeAssessment["eventRisk"]["level"] = "none";
  if (next && minutesUntil !== null) {
    if (next.severity === "high" && minutesUntil <= 30) level = "high";
    else if (minutesUntil <= 15) level = next.severity === "low" ? "low" : "medium";
    else if (next.severity === "high" && minutesUntil <= 120) level = "medium";
    else level = "low";
    ev.push(`Next event: ${next.label} in ${minutesUntil.toFixed(0)} min (${next.severity}).`);
  }
  // data confidence
  let dataConfidence: Confidence = "high";
  const stale = (ms: number | null, limit: number) => ms !== null && ms > limit;
  if (i.mode === "NONE") dataConfidence = "low";
  else if (i.mode === "DELAYED") {
    dataConfidence = "medium";
    notes.push({ level: "warn", message: "Operating on DELAYED data (15 min). Levels and quotes are stale by construction; do not execute on them." });
  }
  if (stale(i.staleness.spxMs, 20_000) || stale(i.staleness.chainMs, 90_000)) {
    dataConfidence = dataConfidence === "high" ? "medium" : "low";
    notes.push({ level: "warn", message: `Stale inputs: SPX ${fmtMs(i.staleness.spxMs)}, chain ${fmtMs(i.staleness.chainMs)}.` });
  }
  if (stale(i.staleness.spxMs, 120_000) || stale(i.staleness.chainMs, 600_000)) {
    dataConfidence = "low";
    notes.push({ level: "block", message: "Inputs are too stale to support a new entry." });
  }
  return { asOf, trend, structure, volatility, rvOverIv, liquidity, participation, gamma, eventRisk: { level, next, minutesUntil }, dataConfidence, evidence: ev, notes };
}

function fmtMs(ms: number | null): string {
  if (ms === null) return "n/a";
  return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`;
}
