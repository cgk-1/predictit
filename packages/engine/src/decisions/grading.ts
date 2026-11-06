/**
 * Continuous self-grading of recorded recommendations (no paper position required).
 *
 * For every persisted CALL/PUT SETUP the grader looks at the market at the decision's horizon and records:
 * underlying return, whether the invalidation level was breached first, and the recommended contract's "would-have"
 * return (bid at the horizon vs the ask at decision time, both sides of costs). Grades are prospective statistics
 * (paper), reported with Wilson intervals; they never rewrite the original record.
 */
import type { DecisionRecord } from "./decide";
import type { ChainSnapshot } from "../types";
import type { PricePoint } from "../features/levels";
import { resalePnl, DEFAULT_COSTS, type CostModel } from "../contracts/payoff";
import { wilson } from "../lean/ensemble";

export interface DecisionGrade {
  decisionId: string;
  family: string;
  direction: "call" | "put";
  decidedAt: number;
  gradedAt: number;
  horizonMinutes: number;
  osi: string | null;
  entryAsk: number | null;
  exitBid: number | null;
  /** highest bid observed between decision and horizon (max favourable excursion), if chain snapshots exist */
  maxBid: number | null;
  wouldHaveRetPct: number | null;
  wouldHavePnlUsd: number | null;
  spotAtDecision: number;
  spotAtHorizon: number;
  underlyingRetPct: number;
  directionHit: boolean;
  invalidated: boolean;
  invalidatedAt: number | null;
  provisional: boolean;
}

export interface GradeInputs {
  record: DecisionRecord;
  /** SPX path from the decision instant to (at least) the horizon */
  path: PricePoint[];
  /** chain snapshots received after the decision (sorted by receivedAt), used for exit bids */
  chains: Array<{ receivedAt: number; chain: ChainSnapshot }>;
  now: number;
  costs?: CostModel;
}

export function gradeDecision(i: GradeInputs): DecisionGrade | null {
  const r = i.record;
  if (r.state !== "CALL SETUP" && r.state !== "PUT SETUP") return null;
  if (!r.primary) return null;
  const horizonEnd = r.asOf + r.primary.horizonMinutes * 60_000;
  if (i.now < horizonEnd) return null;
  const spot0 = r.summary?.contract ? undefined : undefined;
  void spot0;
  const p0 = i.path.find((p) => p.t >= r.asOf) ?? i.path[0];
  const pH = [...i.path].reverse().find((p) => p.t <= horizonEnd + 120_000) ?? null;
  if (!p0 || !pH) return null;
  const direction = r.state === "CALL SETUP" ? "call" : "put";
  const inval = r.primary.invalidationLevel;
  let invalidated = false;
  let invalidatedAt: number | null = null;
  for (const p of i.path) {
    if (p.t < r.asOf || p.t > horizonEnd) continue;
    if ((direction === "call" && p.p <= inval) || (direction === "put" && p.p >= inval)) {
      invalidated = true;
      invalidatedAt = p.t;
      break;
    }
  }
  const contract = r.contracts.find((c) => c.eligible) ?? r.contracts[0] ?? null;
  let exitBid: number | null = null;
  let maxBid: number | null = null;
  if (contract) {
    const exitAt = invalidated && invalidatedAt ? invalidatedAt : horizonEnd;
    const after = i.chains.filter((c) => c.receivedAt >= r.asOf && c.receivedAt <= exitAt + 120_000);
    for (const c of after) {
      const q = c.chain.options.find((o) => o.osi === contract.osi);
      if (q && q.bid > 0) {
        maxBid = Math.max(maxBid ?? 0, q.bid);
        if (c.receivedAt >= exitAt - 120_000) exitBid = q.bid;
      }
    }
    if (exitBid === null && after.length) {
      const lastQ = after[after.length - 1]!.chain.options.find((o) => o.osi === contract.osi);
      if (lastQ && lastQ.bid > 0) exitBid = lastQ.bid;
    }
  }
  const costs = i.costs ?? DEFAULT_COSTS;
  const pnl = contract && exitBid !== null ? resalePnl({ entryPremium: contract.entry, exitPremium: exitBid, qty: 1, costs }).net : null;
  const underlyingRetPct = pH.p / p0.p - 1;
  return {
    decisionId: r.id,
    family: r.primary.family,
    direction,
    decidedAt: r.asOf,
    gradedAt: i.now,
    horizonMinutes: r.primary.horizonMinutes,
    osi: contract?.osi ?? null,
    entryAsk: contract?.entry ?? null,
    exitBid,
    maxBid,
    wouldHaveRetPct: pnl !== null && contract ? pnl / (contract.entry * 100) : null,
    wouldHavePnlUsd: pnl,
    spotAtDecision: p0.p,
    spotAtHorizon: pH.p,
    underlyingRetPct,
    directionHit: direction === "call" ? underlyingRetPct > 0 : underlyingRetPct < 0,
    invalidated,
    invalidatedAt,
    provisional: exitBid === null,
  };
}

export interface GradeSummary {
  n: number;
  directionHitRate: number;
  directionCi: [number, number];
  invalidationRate: number;
  avgWouldHaveRetPct: number | null;
  medianWouldHaveRetPct: number | null;
  byFamily: Record<string, { n: number; hitRate: number; avgRetPct: number | null; invalidationRate: number }>;
  note: string;
}

export function summarizeGrades(grades: DecisionGrade[]): GradeSummary {
  const n = grades.length;
  const hits = grades.filter((g) => g.directionHit).length;
  const w = wilson(hits, n);
  const rets = grades.map((g) => g.wouldHaveRetPct).filter((x): x is number => x !== null);
  const fam: GradeSummary["byFamily"] = {};
  for (const g of grades) {
    const f = (fam[g.family] = fam[g.family] ?? { n: 0, hitRate: 0, avgRetPct: null, invalidationRate: 0 });
    f.n++;
  }
  for (const [k, f] of Object.entries(fam)) {
    const gs = grades.filter((g) => g.family === k);
    f.hitRate = gs.filter((g) => g.directionHit).length / gs.length;
    const rr = gs.map((g) => g.wouldHaveRetPct).filter((x): x is number => x !== null);
    f.avgRetPct = rr.length ? rr.reduce((a, b) => a + b, 0) / rr.length : null;
    f.invalidationRate = gs.filter((g) => g.invalidated).length / gs.length;
  }
  const sorted = [...rets].sort((a, b) => a - b);
  return {
    n,
    directionHitRate: w.p,
    directionCi: [w.lo, w.hi],
    invalidationRate: n ? grades.filter((g) => g.invalidated).length / n : NaN,
    avgWouldHaveRetPct: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null,
    medianWouldHaveRetPct: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null,
    byFamily: fam,
    note: n < 50 ? `Only ${n} graded recommendations; treat every number here as noise until there are hundreds.` : "Prospective paper grades (would-have returns at the ask/bid with costs); not out-of-sample validation.",
  };
}

/** Bounded per-family trust from grades: used only to order candidates of equal lifecycle, never to blend signals. */
export function familyTrust(summary: GradeSummary, minN = 30): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, f] of Object.entries(summary.byFamily)) {
    if (f.n < minN) {
      out[k] = 1;
      continue;
    }
    const ret = f.avgRetPct ?? 0;
    out[k] = Math.max(0.5, Math.min(1.5, 1 + ret));
  }
  return out;
}
