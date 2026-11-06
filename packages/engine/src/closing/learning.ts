/**
 * Closing-window self-grading and bounded parameter learning.
 *
 * At settlement each closing-window record (15:50–16:00) is graded: did the strike pattern resolve in the biased
 * direction, what did the recommended contract settle to vs its ask, how large was the realized remaining move
 * relative to the σ the module used, how much of the recent speed persisted. The learner then nudges the module's
 * parameters within hard bounds:
 *   - seasonalityMultiplier: so that predicted σ matches realized (RMS of z-scores → 1), clamp [1, 3]
 *   - driftPersistence: toward the regression of realized move on assumed drift, clamp [0, 1]
 *   - settlementNoisePts: RMS of (official close − last tick), clamp [0.5, 5]; updated only with official closes
 *   - patternTrust[pattern]: bounded [0.5, 1.5] multiplier on the required edge, from pattern hit rates
 * Grades are provisional until the official close is known; both versions are kept.
 */
import type { ClosingAssessment, ClosingSettings } from "./strikeFlip";
import { intrinsic, perSideCost, type CostModel } from "../contracts/payoff";
import { wilson } from "../lean/ensemble";

export interface ClosingGrade {
  decisionId: string;
  decidedAt: number;
  subWindow: string;
  spotAtDecision: number;
  settlement: number;
  official: boolean;
  lastTick: number | null;
  recommendation: { state: string; strike: number | null; right: "C" | "P" | null; ask: number | null; mode: string | null; pattern: string | null };
  /** P&L per contract if held to settlement (null when no recommendation) */
  settlePnlUsd: number | null;
  settleRetPct: number | null;
  biasHit: boolean | null;
  /** realized remaining move / σ used */
  z: number;
  realizedMovePts: number;
  sigmaUsedPts: number;
  driftAssumedPts: number;
  patternOutcomes: Array<{ strike: number; pattern: string; bias: "call" | "put" | null; hit: boolean | null }>;
}

export function gradeClosingDecision(decisionId: string, a: ClosingAssessment, settlement: number, official: boolean, lastTick: number | null, costs: CostModel): ClosingGrade {
  const r = a.recommendation;
  const c = r.contract;
  let settlePnlUsd: number | null = null;
  let settleRetPct: number | null = null;
  let biasHit: boolean | null = null;
  if (c) {
    const intr = intrinsic(c.right, c.strike, settlement);
    settlePnlUsd = 100 * (intr - c.ask) - perSideCost(costs);
    settleRetPct = settlePnlUsd / (c.ask * 100);
    biasHit = c.right === "C" ? settlement > c.strike : settlement < c.strike;
  }
  const realizedMovePts = settlement - a.spot;
  const z = a.remaining.sigmaUsedPts > 0 ? realizedMovePts / a.remaining.sigmaUsedPts : 0;
  const patternOutcomes = a.ladder
    .filter((s) => s.pattern !== "none")
    .map((s) => ({ strike: s.strike, pattern: s.pattern, bias: s.bias, hit: s.bias ? (s.bias === "call" ? settlement > s.strike : settlement < s.strike) : null }));
  const pat = r.strike !== null ? a.ladder.find((s) => s.strike === r.strike || (c && Math.abs(s.strike - c.strike) <= 5 && s.bias))?.pattern ?? null : null;
  return {
    decisionId,
    decidedAt: a.asOf,
    subWindow: a.subWindow,
    spotAtDecision: a.spot,
    settlement,
    official,
    lastTick,
    recommendation: { state: r.state, strike: c?.strike ?? null, right: c?.right ?? null, ask: c?.ask ?? null, mode: r.mode, pattern: pat },
    settlePnlUsd,
    settleRetPct,
    biasHit,
    z,
    realizedMovePts,
    sigmaUsedPts: a.remaining.sigmaUsedPts,
    driftAssumedPts: a.remaining.driftPts,
    patternOutcomes,
  };
}

export interface ClosingLearnerState {
  n: number;
  /** running sums for σ calibration (z² mean) and drift regression */
  sumZ2: number;
  sumDriftXY: number;
  sumDriftXX: number;
  /** official settlement-vs-last-tick gaps (pts) */
  gapSq: number;
  gapN: number;
  patterns: Record<string, { n: number; hits: number }>;
  subWindows: Record<string, { n: number; pnl: number; hits: number }>;
  learned: { seasonalityMultiplier: number | null; driftPersistence: number | null; settlementNoisePts: number | null; patternTrust: Record<string, number> };
  updatedAt: number;
}

export function initialClosingLearner(now: number): ClosingLearnerState {
  return { n: 0, sumZ2: 0, sumDriftXY: 0, sumDriftXX: 0, gapSq: 0, gapN: 0, patterns: {}, subWindows: {}, learned: { seasonalityMultiplier: null, driftPersistence: null, settlementNoisePts: null, patternTrust: {} }, updatedAt: now };
}

export interface ClosingLearnConfig {
  /** minimum graded sessions before learned parameters apply */
  minN: number;
  /** step toward the measured value per update (0–1) */
  step: number;
  bounds: { seasonality: [number, number]; drift: [number, number]; noise: [number, number]; trust: [number, number] };
}

export const DEFAULT_CLOSING_LEARN: ClosingLearnConfig = { minN: 10, step: 0.2, bounds: { seasonality: [1, 3], drift: [0, 1], noise: [0.5, 5], trust: [0.5, 1.5] } };

/** Fold one grade into the learner (pure). Only one grade per decision should be folded; prefer the official one. */
export function updateClosingLearner(st: ClosingLearnerState, g: ClosingGrade, base: ClosingSettings, cfg: ClosingLearnConfig = DEFAULT_CLOSING_LEARN): ClosingLearnerState {
  const s: ClosingLearnerState = { ...st, patterns: { ...st.patterns }, subWindows: { ...st.subWindows }, learned: { ...st.learned, patternTrust: { ...st.learned.patternTrust } } };
  s.n++;
  s.sumZ2 += g.z * g.z;
  // realized move regressed on assumed drift (through the origin): slope ≈ how much of the assumed drift materialised
  s.sumDriftXY += g.driftAssumedPts * g.realizedMovePts;
  s.sumDriftXX += g.driftAssumedPts * g.driftAssumedPts;
  if (g.official && g.lastTick !== null) {
    s.gapSq += (g.settlement - g.lastTick) ** 2;
    s.gapN++;
  }
  for (const p of g.patternOutcomes) {
    if (p.hit === null) continue;
    const e = (s.patterns[p.pattern] = s.patterns[p.pattern] ?? { n: 0, hits: 0 });
    e.n++;
    if (p.hit) e.hits++;
  }
  const sw = (s.subWindows[g.subWindow] = s.subWindows[g.subWindow] ?? { n: 0, pnl: 0, hits: 0 });
  if (g.settlePnlUsd !== null) {
    sw.n++;
    sw.pnl += g.settlePnlUsd;
    if (g.biasHit) sw.hits++;
  }
  // learned parameters (bounded, stepwise)
  const clamp = (x: number, [lo, hi]: [number, number]) => Math.max(lo, Math.min(hi, x));
  if (s.n >= cfg.minN) {
    const rmsZ = Math.sqrt(s.sumZ2 / s.n); // ≈1 when σ is calibrated
    const targetSeason = clamp(base.seasonalityMultiplier * rmsZ, cfg.bounds.seasonality);
    const curSeason = s.learned.seasonalityMultiplier ?? base.seasonalityMultiplier;
    s.learned.seasonalityMultiplier = clamp(curSeason + cfg.step * (targetSeason - curSeason), cfg.bounds.seasonality);
    if (s.sumDriftXX > 0) {
      const slope = s.sumDriftXY / s.sumDriftXX; // 1 = assumed drift fully realised
      const targetDrift = clamp(base.driftPersistence * slope, cfg.bounds.drift);
      const curDrift = s.learned.driftPersistence ?? base.driftPersistence;
      s.learned.driftPersistence = clamp(curDrift + cfg.step * (targetDrift - curDrift), cfg.bounds.drift);
    }
  }
  if (s.gapN >= 5) {
    const rmsGap = Math.sqrt(s.gapSq / s.gapN);
    const cur = s.learned.settlementNoisePts ?? base.settlementNoisePts;
    s.learned.settlementNoisePts = clamp(cur + cfg.step * (clamp(rmsGap, cfg.bounds.noise) - cur), cfg.bounds.noise);
  }
  for (const [pat, e] of Object.entries(s.patterns)) {
    if (e.n < 20) continue; // need a real sample before trusting or distrusting a pattern
    const w = wilson(e.hits, e.n);
    // trust = 1 at 50% hit rate; scaled by how far the lower/upper bound sits from 50%
    const trust = w.lo > 0.5 ? 1 + (w.lo - 0.5) : w.hi < 0.5 ? 1 - (0.5 - w.hi) : 1;
    s.learned.patternTrust[pat] = clamp(trust, cfg.bounds.trust);
  }
  s.updatedAt = g.decidedAt;
  return s;
}

/** Closing settings with learned parameters applied (bounded by construction). */
export function applyClosingLearning(base: ClosingSettings, st: ClosingLearnerState | null): ClosingSettings & { learnedFrom: number } {
  if (!st) return { ...base, learnedFrom: 0 };
  return {
    ...base,
    seasonalityMultiplier: st.learned.seasonalityMultiplier ?? base.seasonalityMultiplier,
    driftPersistence: st.learned.driftPersistence ?? base.driftPersistence,
    settlementNoisePts: st.learned.settlementNoisePts ?? base.settlementNoisePts,
    patternTrust: st.learned.patternTrust,
    learnedFrom: st.n,
  };
}

export function closingLearnerSummary(st: ClosingLearnerState | null, base: ClosingSettings) {
  const s = st ?? initialClosingLearner(0);
  const applied = applyClosingLearning(base, st);
  return {
    gradedSessions: s.n,
    officialGaps: s.gapN,
    rmsZ: s.n ? Math.sqrt(s.sumZ2 / s.n) : null,
    driftSlope: s.sumDriftXX > 0 ? s.sumDriftXY / s.sumDriftXX : null,
    rmsSettlementGapPts: s.gapN ? Math.sqrt(s.gapSq / s.gapN) : null,
    patterns: Object.fromEntries(Object.entries(s.patterns).map(([k, e]) => [k, { n: e.n, hitRate: e.n ? e.hits / e.n : null, ci: e.n ? [wilson(e.hits, e.n).lo, wilson(e.hits, e.n).hi] : null, trust: s.learned.patternTrust[k] ?? 1 }])),
    subWindows: Object.fromEntries(Object.entries(s.subWindows).map(([k, e]) => [k, { n: e.n, avgPnlUsd: e.n ? e.pnl / e.n : null, hitRate: e.n ? e.hits / e.n : null }])),
    parameters: { seasonalityMultiplier: applied.seasonalityMultiplier, driftPersistence: applied.driftPersistence, settlementNoisePts: applied.settlementNoisePts, base: { seasonalityMultiplier: base.seasonalityMultiplier, driftPersistence: base.driftPersistence, settlementNoisePts: base.settlementNoisePts } },
    note: s.n < DEFAULT_CLOSING_LEARN.minN ? `Learned parameters apply after ${DEFAULT_CLOSING_LEARN.minN} graded sessions (currently ${s.n}); pattern trust after 20 outcomes per pattern.` : "Parameters adapt within hard bounds from graded sessions; grades are prospective, not validation.",
  };
}
