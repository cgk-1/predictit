/**
 * Directional "market lean" ensemble.
 *
 * Many weak indicators each cast a vote in [-1, +1] (0 = no opinion, null = unavailable). The lean is the
 * weight-normalised vote. Weights adapt ONLINE from scored predictions with a bounded multiplicative update
 * (Hedge / exponentiated weights): right → weight up a little, wrong → down a little, clamped to
 * [minMult, maxMult] × the prior weight and slowly decayed back toward the prior. This is "learn from being
 * right or wrong, but not too much". The ensemble is a separate transparent layer: setup families remain
 * distinct, and the lean never by itself produces an entry.
 *
 * Honesty: hit rates are reported with Wilson intervals; a calibrated probability is only exposed once the
 * prospective ledger has enough scored predictions (see `calibratedProbability`).
 */
import type { EngineContext } from "../decisions/context";
import type { CalendarFeatures } from "../features/calendar";
import type { PricePoint } from "../features/levels";

export type IndicatorFamily = "momentum" | "mean-reversion" | "structure" | "positioning" | "cross-market" | "calendar" | "flow";

export interface IndicatorSpec {
  id: string;
  label: string;
  family: IndicatorFamily;
  hypothesis: string;
  /** evidence class: A mechanics, B published, C practitioner, D our in-sample daily study */
  evidence: "A" | "B" | "C" | "D";
  priorWeight: number;
}

export interface IndicatorVote {
  id: string;
  vote: number | null;
  reason: string;
}

export interface EnsembleWeights {
  /** indicator id → current weight */
  w: Record<string, number>;
  /** per-indicator prospective stats */
  stats: Record<string, { n: number; hits: number; brier: number }>;
  /** ensemble-level stats per horizon */
  ensemble: Record<string, { n: number; hits: number; brier: number; flat: number }>;
  updatedAt: number;
  version: number;
}

export interface EnsembleConfig {
  eta: number;
  minMult: number;
  maxMult: number;
  decay: number;
  /** |return| below this (fraction) counts as flat: no update */
  flatThreshold: number;
  horizonsMin: number[];
  /** scored predictions needed before a probability is shown */
  minScoredForProbability: number;
}

export const DEFAULT_ENSEMBLE_CONFIG: EnsembleConfig = { eta: 0.05, minMult: 0.25, maxMult: 3, decay: 0.998, flatThreshold: 0.0002, horizonsMin: [15, 60], minScoredForProbability: 200 };

export const INDICATORS: IndicatorSpec[] = [
  { id: "mom5", label: "5-min momentum", family: "momentum", hypothesis: "Very short-term continuation.", evidence: "C", priorWeight: 0.6 },
  { id: "mom15", label: "15-min momentum", family: "momentum", hypothesis: "Short-term continuation (weak; often reverts).", evidence: "B", priorWeight: 0.8 },
  { id: "mom30", label: "30-min momentum", family: "momentum", hypothesis: "Continuation over the next 15–60 min.", evidence: "C", priorWeight: 0.8 },
  { id: "trend60", label: "60-min trend × efficiency", family: "momentum", hypothesis: "Efficient trends persist.", evidence: "C", priorWeight: 1.0 },
  { id: "accel", label: "Acceleration", family: "momentum", hypothesis: "Speed increasing in the move's direction.", evidence: "C", priorWeight: 0.5 },
  { id: "vwapSide", label: "Side of VWAP/TWAP", family: "structure", hypothesis: "Above the day's average price favours buyers.", evidence: "C", priorWeight: 0.8 },
  { id: "orSide", label: "Opening-range side", family: "structure", hypothesis: "Price outside the opening range continues.", evidence: "C", priorWeight: 0.8 },
  { id: "rangeLoc", label: "Session-range location (fade)", family: "mean-reversion", hypothesis: "Extremes of the session range revert in range regimes.", evidence: "C", priorWeight: 0.6 },
  { id: "priorClose", label: "Above/below prior close", family: "structure", hypothesis: "Holding above the prior close is constructive.", evidence: "C", priorWeight: 0.6 },
  { id: "gapFill", label: "Unfilled gap pull", family: "mean-reversion", hypothesis: "Unfilled gaps attract price back to the prior close.", evidence: "C", priorWeight: 0.6 },
  { id: "expansion", label: "Expansion direction", family: "momentum", hypothesis: "Range expansion continues in its direction.", evidence: "C", priorWeight: 0.6 },
  { id: "gammaMom", label: "Gamma-conditioned momentum", family: "positioning", hypothesis: "Negative dealer gamma → momentum; positive → reversion (Baltussen et al.).", evidence: "B", priorWeight: 1.2 },
  { id: "flipSide", label: "Side of zero-gamma", family: "positioning", hypothesis: "Below the flip is unstable/weak; above is supported.", evidence: "C", priorWeight: 0.6 },
  { id: "walls", label: "Call/put wall proximity", family: "positioning", hypothesis: "Walls act as resistance/support.", evidence: "C", priorWeight: 0.7 },
  { id: "pcVol", label: "0DTE put/call volume (contrarian)", family: "flow", hypothesis: "Heavy put volume is a contrarian positive.", evidence: "C", priorWeight: 0.4 },
  { id: "optVolTilt", label: "Recent call vs put volume tilt", family: "flow", hypothesis: "Call-heavy recent minutes lean up.", evidence: "C", priorWeight: 0.4 },
  { id: "spyConfirm", label: "SPY confirmation", family: "cross-market", hypothesis: "SPY agreeing with SPX strengthens the move.", evidence: "C", priorWeight: 0.8 },
  { id: "dow", label: "Day-of-week prior", family: "calendar", hypothesis: "Monday has leaned positive 2023–2026 (daily, in-sample).", evidence: "D", priorWeight: 0.3 },
  { id: "prevDayRet", label: "Prior-day return (daily reversion)", family: "calendar", hypothesis: "After ±1% days the next day leans the other way (daily, in-sample).", evidence: "D", priorWeight: 0.4 },
  { id: "prevWeek", label: "Prior-week return (weekly reversion)", family: "calendar", hypothesis: "Down weeks are followed by stronger weeks (daily, in-sample).", evidence: "D", priorWeight: 0.3 },
  { id: "prevClose", label: "Prior-day closing strength", family: "calendar", hypothesis: "A strong close carries into the next session.", evidence: "C", priorWeight: 0.3 },
  { id: "intradayMom", label: "Intraday momentum (open→now into last hour)", family: "momentum", hypothesis: "First-hours direction predicts the last hour (Gao et al.).", evidence: "B", priorWeight: 0.8 },
];

export function initialWeights(now: number): EnsembleWeights {
  const w: Record<string, number> = {};
  for (const i of INDICATORS) w[i.id] = i.priorWeight;
  return { w, stats: {}, ensemble: {}, updatedAt: now, version: 1 };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const scaled = (x: number | null | undefined, unit: number) => (x === null || x === undefined || !Number.isFinite(x) ? null : clamp(Math.tanh(x / unit), -1, 1));

export function indicatorVotes(ctx: EngineContext, cal: CalendarFeatures | null): IndicatorVote[] {
  const b = ctx.spxBars;
  const spot = ctx.frame.spx?.last ?? b?.last ?? null;
  const atr = b?.atr14 ?? null;
  const unitRet = spot && atr ? (0.5 * atr) / spot : 0.0005; // one "unit" of return ≈ half an ATR
  const v: IndicatorVote[] = [];
  const push = (id: string, vote: number | null, reason: string) => v.push({ id, vote: vote === null ? null : clamp(vote, -1, 1), reason });
  if (!b || spot === null) {
    for (const i of INDICATORS) push(i.id, null, "no bar data");
    return v;
  }
  push("mom5", scaled(b.ret5, unitRet), `5m ${fmtPct(b.ret5)}`);
  push("mom15", scaled(b.ret15, 2 * unitRet), `15m ${fmtPct(b.ret15)}`);
  push("mom30", scaled(b.ret30, 3 * unitRet), `30m ${fmtPct(b.ret30)}`);
  push("trend60", b.ret60 !== null && b.er60 !== null ? scaled(b.ret60, 4 * unitRet)! * clamp(b.er60 / 0.4, 0, 1) : null, `60m ${fmtPct(b.ret60)} × ER ${b.er60?.toFixed(2) ?? "n/a"}`);
  push("accel", b.accel5 !== null && atr ? scaled(b.accel5, 0.3 * atr) : null, `accel ${b.accel5?.toFixed(2) ?? "n/a"} pts/min²`);
  const avg = b.vwap ?? b.twap;
  push("vwapSide", avg && atr ? scaled(spot - avg, atr) : null, avg ? `spot ${spot.toFixed(1)} vs ${b.vwap ? "VWAP" : "TWAP"} ${avg.toFixed(1)}` : "no average");
  if (b.or30?.complete) {
    const { high, low } = b.or30;
    push("orSide", spot > high ? 0.8 : spot < low ? -0.8 : 0, spot > high ? "above OR30 high" : spot < low ? "below OR30 low" : "inside OR30");
  } else push("orSide", null, "OR30 incomplete");
  if (b.sessHigh !== null && b.sessLow !== null && b.sessHigh > b.sessLow && ctx.regime.trend === "range") {
    const loc = (spot - b.sessLow) / (b.sessHigh - b.sessLow);
    push("rangeLoc", -(loc - 0.5) * 1.6, `range location ${(loc * 100).toFixed(0)}% in range regime`);
  } else push("rangeLoc", 0, ctx.regime.trend === "range" ? "range too small" : `regime ${ctx.regime.trend} (fade off)`);
  const pc = ctx.frame.priorDay?.close ?? cal?.prior?.close ?? null;
  push("priorClose", pc && atr ? scaled(spot - pc, 2 * atr) : null, pc ? `vs prior close ${pc.toFixed(1)}` : "no prior close");
  if (cal?.today.gapPts !== null && cal?.today.gapPts !== undefined && cal.today.gapFilled === false && atr) push("gapFill", -Math.sign(cal.today.gapPts) * clamp(Math.abs(cal.today.gapPts) / (3 * atr), 0.2, 1), `unfilled gap ${cal.today.gapPts.toFixed(1)} pts`);
  else push("gapFill", cal?.today.gapFilled ? 0 : null, cal?.today.gapFilled ? "gap filled" : "gap unknown");
  push("expansion", b.compression15 !== null && b.compression15 >= 1.6 ? Math.sign(b.ret15 ?? 0) * 0.7 : 0, b.compression15 !== null ? `15m range ratio ${b.compression15.toFixed(2)}` : "n/a");
  const gm = ctx.regime.gamma;
  const m15 = scaled(b.ret15, 2 * unitRet);
  push("gammaMom", gm === "unknown" || m15 === null ? null : gm === "negative" ? m15 : gm === "positive" ? -0.5 * m15 : 0, `gamma ${gm}, 15m ${fmtPct(b.ret15)}`);
  const flip = ctx.gex?.flip.level ?? null;
  push("flipSide", flip ? (spot > flip ? 0.3 : -0.3) : null, flip ? `spot ${spot > flip ? "above" : "below"} flip ${flip.toFixed(0)}` : "no flip estimate");
  const cw = ctx.gex?.walls.callWall ?? null;
  const pw = ctx.gex?.walls.putWall ?? null;
  let wallVote: number | null = 0;
  let wallText = "not near a wall";
  if (cw && Math.abs(cw - spot) / spot <= 0.003 && cw >= spot) {
    wallVote = -0.5;
    wallText = `near call wall ${cw}`;
  } else if (pw && Math.abs(pw - spot) / spot <= 0.003 && pw <= spot) {
    wallVote = 0.5;
    wallText = `near put wall ${pw}`;
  } else if (!cw && !pw) wallVote = null;
  push("walls", wallVote, wallText);
  const pcv = ctx.spxChain?.pcVolume0dte ?? null;
  push("pcVol", pcv !== null ? clamp((pcv - 1) * 0.8, -0.6, 0.6) : null, pcv !== null ? `0DTE P/C volume ${pcv.toFixed(2)}` : "n/a");
  const sess = ctx.frame.spxBars ? ctx.frame.spxBars.bars.filter((x) => x.t + 60_000 <= ctx.asOf && x.callsVol !== undefined).slice(-15) : [];
  if (sess.length >= 10) {
    const c = sess.reduce((a, x) => a + (x.callsVol ?? 0), 0);
    const p = sess.reduce((a, x) => a + (x.putsVol ?? 0), 0);
    push("optVolTilt", c + p > 0 ? clamp(((c - p) / (c + p)) * 3, -0.6, 0.6) : 0, `last 15m calls ${c} / puts ${p}`);
  } else push("optVolTilt", null, "no per-minute options volume");
  const s = ctx.spyBars;
  push("spyConfirm", s && s.ret15 !== null && b.ret15 !== null ? (Math.sign(s.ret15) === Math.sign(b.ret15) ? scaled(b.ret15, 2 * unitRet) : 0) : null, s ? `SPY 15m ${fmtPct(s.ret15 ?? null)}` : "no SPY");
  // calendar
  const dow = ctx.clock.now ? new Date(ctx.clock.now) : null;
  void dow;
  const wd = cal?.dayOfWeek ?? null;
  push("dow", wd === null ? null : wd === 1 ? 0.3 : wd === 4 ? -0.1 : 0, cal ? cal.dayName : "n/a");
  const pr = cal?.prior?.ret ?? null;
  push("prevDayRet", pr === null ? null : pr > 0.01 ? -0.3 : pr < -0.01 ? 0.3 : 0, pr === null ? "no prior-day return" : `prior day ${fmtPct(pr)}`);
  const pw2 = cal?.priorWeek?.ret ?? null;
  push("prevWeek", pw2 === null ? null : pw2 < 0 ? 0.25 : 0.05, pw2 === null ? "no prior-week return" : `prior week ${fmtPct(pw2)}`);
  const cl = cal?.prior?.closeLocation ?? null;
  push("prevClose", cl === null ? null : cl > 0.8 ? 0.2 : cl < 0.2 ? -0.2 : 0, cl === null ? "no prior close location" : `prior close location ${(cl * 100).toFixed(0)}%`);
  const open = b.sessOpen;
  if (open && ctx.clock.minutesToClose <= 90 && ctx.clock.minutesToClose > 0) {
    const dayRet = spot / open - 1;
    push("intradayMom", Math.abs(dayRet) >= 0.003 ? Math.sign(dayRet) * 0.6 : 0, `day ${fmtPct(dayRet)} into the last 90m`);
  } else push("intradayMom", 0, "outside last 90 minutes");
  return v;
}

function fmtPct(x: number | null): string {
  return x === null ? "n/a" : `${(x * 100).toFixed(2)}%`;
}

export interface LeanResult {
  asOf: number;
  score: number;
  direction: "UP" | "DOWN" | "NEUTRAL";
  strength: "none" | "weak" | "moderate" | "strong";
  agreement: number;
  available: number;
  votes: Array<IndicatorVote & { weight: number; contribution: number; label: string; family: IndicatorFamily; evidence: IndicatorSpec["evidence"] }>;
  top: string[];
  against: string[];
  validation: "unvalidated" | "prospective";
}

export function computeLean(ctx: EngineContext, cal: CalendarFeatures | null, weights: EnsembleWeights): LeanResult {
  const votes = indicatorVotes(ctx, cal);
  let num = 0;
  let den = 0;
  let avail = 0;
  let agree = 0;
  const rows: LeanResult["votes"] = [];
  for (const vt of votes) {
    const spec = INDICATORS.find((i) => i.id === vt.id)!;
    const w = weights.w[vt.id] ?? spec.priorWeight;
    const contribution = vt.vote === null ? 0 : w * vt.vote;
    if (vt.vote !== null) {
      avail++;
      num += contribution;
      den += w;
    }
    rows.push({ ...vt, weight: w, contribution, label: spec.label, family: spec.family, evidence: spec.evidence });
  }
  const score = den > 0 ? num / den : 0;
  const sign = Math.sign(score);
  for (const r of rows) if (r.vote !== null && r.vote !== 0 && Math.sign(r.vote) === sign) agree++;
  const nonzero = rows.filter((r) => r.vote !== null && r.vote !== 0).length;
  const abs = Math.abs(score);
  const strength: LeanResult["strength"] = abs < 0.12 ? "none" : abs < 0.3 ? "weak" : abs < 0.5 ? "moderate" : "strong";
  const sorted = [...rows].filter((r) => r.vote !== null && r.vote !== 0).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const n = Object.values(weights.ensemble).reduce((a, e) => a + e.n, 0);
  return {
    asOf: ctx.asOf,
    score,
    direction: strength === "none" ? "NEUTRAL" : score > 0 ? "UP" : "DOWN",
    strength,
    agreement: nonzero ? agree / nonzero : 0,
    available: avail,
    votes: rows,
    top: sorted.filter((r) => Math.sign(r.contribution) === sign).slice(0, 4).map((r) => `${r.label}: ${r.reason}`),
    against: sorted.filter((r) => Math.sign(r.contribution) === -sign).slice(0, 3).map((r) => `${r.label}: ${r.reason}`),
    validation: n >= 30 ? "prospective" : "unvalidated",
  };
}

// ---------- prediction ledger & online weight updates ----------

export interface PendingPrediction {
  id: string;
  at: number;
  horizonMin: number;
  dueAt: number;
  spotAt: number;
  score: number;
  votes: Record<string, number>;
}

export interface ScoredPrediction extends PendingPrediction {
  scoredAt: number;
  spotThen: number;
  ret: number;
  outcome: "up" | "down" | "flat";
  hit: boolean | null;
}

export function makePredictions(lean: LeanResult, spot: number, cfg: EnsembleConfig = DEFAULT_ENSEMBLE_CONFIG): PendingPrediction[] {
  const votes: Record<string, number> = {};
  for (const r of lean.votes) if (r.vote !== null && r.vote !== 0) votes[r.id] = r.vote;
  return cfg.horizonsMin.map((h) => ({ id: `${lean.asOf}:${h}`, at: lean.asOf, horizonMin: h, dueAt: lean.asOf + h * 60_000, spotAt: spot, score: lean.score, votes }));
}

function priceAtOrAfter(path: PricePoint[], t: number, toleranceMs: number): number | null {
  for (const p of path) if (p.t >= t && p.t <= t + toleranceMs) return p.p;
  return null;
}

/** Score due predictions against the price path and update weights (bounded). Pure: returns new objects. */
export function scorePredictions(pending: PendingPrediction[], path: PricePoint[], now: number, weights: EnsembleWeights, cfg: EnsembleConfig = DEFAULT_ENSEMBLE_CONFIG): { weights: EnsembleWeights; scored: ScoredPrediction[]; pending: PendingPrediction[] } {
  const w: Record<string, number> = { ...weights.w };
  const stats = { ...weights.stats };
  const ens = { ...weights.ensemble };
  const scored: ScoredPrediction[] = [];
  const still: PendingPrediction[] = [];
  for (const p of pending) {
    if (now < p.dueAt) {
      still.push(p);
      continue;
    }
    const px = priceAtOrAfter(path, p.dueAt, 120_000);
    if (px === null) {
      if (now - p.dueAt < 10 * 60_000) still.push(p); // wait for data a little longer
      continue; // otherwise drop silently (data gap)
    }
    const ret = px / p.spotAt - 1;
    const outcome: ScoredPrediction["outcome"] = Math.abs(ret) < cfg.flatThreshold ? "flat" : ret > 0 ? "up" : "down";
    const y = outcome === "up" ? 1 : outcome === "down" ? -1 : 0;
    const key = `${p.horizonMin}m`;
    const e = ens[key] ?? { n: 0, hits: 0, brier: 0, flat: 0 };
    let hit: boolean | null = null;
    if (y !== 0) {
      const prob = 0.5 + 0.5 * Math.max(-1, Math.min(1, p.score)); // squash to a pseudo-probability for Brier
      const yb = y > 0 ? 1 : 0;
      e.n++;
      hit = Math.sign(p.score) === y && Math.abs(p.score) >= 0.12;
      if (hit) e.hits++;
      e.brier += (prob - yb) ** 2;
      for (const [id, v] of Object.entries(p.votes)) {
        const spec = INDICATORS.find((i) => i.id === id);
        if (!spec) continue;
        const loss = (1 - v * y) / 2; // 0 = fully right, 1 = fully wrong
        const cur = w[id] ?? spec.priorWeight;
        let next = cur * Math.exp(-cfg.eta * (loss - 0.5) * 2);
        next = spec.priorWeight + (next - spec.priorWeight) * cfg.decay;
        w[id] = Math.max(cfg.minMult * spec.priorWeight, Math.min(cfg.maxMult * spec.priorWeight, next));
        const st = stats[id] ?? { n: 0, hits: 0, brier: 0 };
        st.n++;
        if (Math.sign(v) === y) st.hits++;
        st.brier += (0.5 + 0.5 * v - yb) ** 2;
        stats[id] = st;
      }
    } else e.flat++;
    ens[key] = e;
    scored.push({ ...p, scoredAt: now, spotThen: px, ret, outcome, hit });
  }
  return { weights: { w, stats, ensemble: ens, updatedAt: now, version: weights.version + 1 }, scored, pending: still };
}

export function wilson(hits: number, n: number, z = 1.96): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: NaN, lo: NaN, hi: NaN };
  const p = hits / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: c - h, hi: c + h };
}

export interface LeanStats {
  horizons: Record<string, { n: number; hitRate: number; ci: [number, number]; brier: number; flat: number; baselineBrier: 0.25 }>;
  indicators: Array<{ id: string; label: string; weight: number; prior: number; n: number; hitRate: number | null }>;
  calibratedProbabilityAvailable: boolean;
  note: string;
}

export function leanStats(weights: EnsembleWeights, cfg: EnsembleConfig = DEFAULT_ENSEMBLE_CONFIG): LeanStats {
  const horizons: LeanStats["horizons"] = {};
  let total = 0;
  for (const [k, e] of Object.entries(weights.ensemble)) {
    const wi = wilson(e.hits, e.n);
    horizons[k] = { n: e.n, hitRate: wi.p, ci: [wi.lo, wi.hi], brier: e.n ? e.brier / e.n : NaN, flat: e.flat, baselineBrier: 0.25 };
    total += e.n;
  }
  const indicators = INDICATORS.map((i) => {
    const st = weights.stats[i.id];
    return { id: i.id, label: i.label, weight: weights.w[i.id] ?? i.priorWeight, prior: i.priorWeight, n: st?.n ?? 0, hitRate: st && st.n ? st.hits / st.n : null };
  });
  const ok = total >= cfg.minScoredForProbability;
  return { horizons, indicators, calibratedProbabilityAvailable: ok, note: ok ? "Hit rates are prospective (paper), not out-of-sample validated strategies." : `Calibrated probabilities withheld until ≥${cfg.minScoredForProbability} scored predictions (currently ${total}).` };
}

/** Pseudo-probability from the lean score, ONLY for display when the ledger supports it. */
export function calibratedProbability(score: number, stats: LeanStats): number | null {
  if (!stats.calibratedProbabilityAvailable) return null;
  return 0.5 + 0.5 * Math.max(-1, Math.min(1, score));
}
