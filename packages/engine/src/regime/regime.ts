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
import type { TickFeatures } from "../features/tick";
import type { MtfSummary } from "../features/mtf";
import type { CrossFeatures } from "../features/cross";

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
  participation: "unknown" | "broad" | "narrow" | "divergent" | "exhaustion";
  gamma: "positive" | "negative" | "near-flip" | "unknown";
  /** cross-timeframe alignment (5/10/30-minute trends) */
  timeframes: MtfSummary["alignment"]["label"];
  eventRisk: { level: "none" | "low" | "medium" | "high"; next: ScheduledEvent | null; minutesUntil: number | null };
  dataConfidence: Confidence;
  evidence: string[];
  notes: DataQualityNote[];
}

export interface RegimeInputs {
  clock: SessionClock;
  bars: BarFeatures | null;
  companionBars: BarFeatures | null;
  companionName: string;
  chain: ChainFeatures | null;
  gex: GexSummary | null;
  events: ScheduledEvent[];
  staleness: { quoteMs: number | null; chainMs: number | null; barsMs: number | null };
  mode: "LIVE" | "DELAYED" | "REPLAY" | "NONE";
  tick?: TickFeatures;
  mtf?: MtfSummary | null;
  cross?: CrossFeatures;
}

export function assessRegime(i: RegimeInputs): RegimeAssessment {
  const ev: string[] = [];
  const notes: DataQualityNote[] = [];
  const asOf = i.clock.now;
  const b = i.bars;
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
  // multi-timeframe corroboration of the trend label
  const mtfLabel = i.mtf?.alignment.label ?? "n/a";
  if (i.mtf && mtfLabel !== "n/a") {
    ev.push(`Timeframes: ${i.mtf.frames.map((f) => `${f.tf}m ${f.trend}`).join(", ")} → ${i.mtf.alignment.text}`);
    if (trend === "range" && (mtfLabel === "aligned-up" || mtfLabel === "aligned-down")) ev.push("Note: 60-minute efficiency says range while higher timeframes are aligned; treat as a slow trend.");
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
  const rvOverIv = b?.rv30 && i.chain?.front?.atmIv ? b.rv30 / i.chain.front.atmIv : null;
  if (rvOverIv !== null) ev.push(`30m realized vol ${(b!.rv30! * 100).toFixed(1)}% vs 0DTE ATM IV ${(i.chain!.front!.atmIv! * 100).toFixed(1)}% (ratio ${rvOverIv.toFixed(2)}).`);
  // liquidity from front-expiry ATM spread
  let liquidity: LiquidityLabel = "unknown";
  const lq = i.chain?.liquidity;
  if (lq && lq.atmSpreadPct !== null) {
    liquidity = lq.atmSpreadPct <= 0.02 ? "good" : lq.atmSpreadPct <= 0.06 ? "fair" : "poor";
    ev.push(`ATM spread ${(lq.atmSpreadPct * 100).toFixed(1)}% of mid (${lq.atmSpread?.toFixed(2)}), sizes ${lq.atmBidSize}×${lq.atmAskSize} → liquidity ${liquidity}.`);
  }
  // participation: NYSE TICK when live; otherwise unknown (SPY agreement is only a sanity check)
  let participation: RegimeAssessment["participation"] = "unknown";
  if (i.companionBars && i.companionBars.ret15 !== null && b?.ret15 !== null && b) {
    const agree = Math.sign(i.companionBars.ret15) === Math.sign(b.ret15 ?? 0);
    ev.push(`${i.companionName} 15m return ${(i.companionBars.ret15 * 100).toFixed(2)}% ${agree ? "agrees in sign" : "diverges in sign"} (sign only; no level arithmetic across instruments).`);
  }
  if (i.cross && i.cross.label !== "n/a") {
    ev.push(i.cross.text);
    if (participation === "unknown") participation = i.cross.label === "broad-confirm" ? "broad" : i.cross.label === "divergent" ? "divergent" : "narrow";
  }
  const tk = i.tick;
  if (tk && tk.label !== "n/a") {
    const r15 = b?.ret15 ?? 0;
    if (tk.label === "exhaustion-high" || tk.label === "exhaustion-low") participation = "exhaustion";
    else if ((tk.label === "broad-up" && r15 >= 0) || (tk.label === "broad-down" && r15 <= 0)) participation = "broad";
    else if ((tk.label === "broad-up" && r15 < 0) || (tk.label === "broad-down" && r15 > 0) || (tk.label === "mixed" && Math.abs(r15) >= 0.002)) participation = Math.abs(r15) >= 0.002 && tk.label === "mixed" ? "narrow" : "divergent";
    else participation = "narrow";
    ev.push(`${tk.text} → participation ${participation}.`);
  } else notes.push({ level: "info", message: "NYSE TICK (breadth) needs the Schwab live feed; participation is labelled unknown." });
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
  if (stale(i.staleness.quoteMs, 20_000) || stale(i.staleness.chainMs, 90_000)) {
    dataConfidence = dataConfidence === "high" ? "medium" : "low";
    notes.push({ level: "warn", message: `Stale inputs: quote ${fmtMs(i.staleness.quoteMs)}, chain ${fmtMs(i.staleness.chainMs)}.` });
  }
  if (stale(i.staleness.quoteMs, 120_000) || stale(i.staleness.chainMs, 600_000)) {
    dataConfidence = "low";
    notes.push({ level: "block", message: "Inputs are too stale to support a new entry." });
  }
  return { asOf, trend, structure, volatility, rvOverIv, liquidity, participation, gamma, timeframes: mtfLabel, eventRisk: { level, next, minutesUntil }, dataConfidence, evidence: ev, notes };
}

function fmtMs(ms: number | null): string {
  if (ms === null) return "n/a";
  return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`;
}
