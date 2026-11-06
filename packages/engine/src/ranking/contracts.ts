/**
 * Contract selection: for a direction, horizon and scenario, rank eligible calls/puts by execution economics.
 * Entry is assumed at the ASK (achievable), exit at the model value minus half the current spread. Nothing here
 * assumes midpoint fills. Returns a small ranked list with explicit tradeoffs.
 */
import type { ChainSnapshot, DataQualityNote, Direction, OptionQuote } from "../types";
import { bsGreeks, impliedVol } from "../pricing/bs";
import { expiryInstantMs, yearsToExpiry, TRADING_MINUTES_PER_YEAR } from "../pricing/tte";
import { isPmExpiringToday } from "../contracts/series";
import { breakevenWithCosts, DEFAULT_COSTS, type CostModel } from "../contracts/payoff";

export interface RankingInputs {
  chain: ChainSnapshot;
  asOf: number;
  today: string;
  direction: Direction;
  horizonMinutes: number;
  /** scenario underlying levels at the horizon */
  targetLevel: number | null;
  invalidationLevel: number;
  preferredExpiry: "0DTE" | "1-3DTE" | "weekly";
  minutesToClose: number;
  limits: { maxSpreadPct: number; maxQuoteAgeMs: number; minQuoteSize: number; maxPremiumPerContract: number };
  costs?: CostModel;
  r?: number;
  q?: number;
  /** multiply SPX-point levels by this to express them in the chain's underlying (SPY ≈ spot ratio); default 1 */
  levelScale?: number;
}

export interface RankedContract {
  instrument: "SPX" | "SPY";
  withinBudget: boolean;
  osi: string;
  root: OptionQuote["root"];
  expiry: string;
  right: OptionQuote["right"];
  strike: number;
  is0dte: boolean;
  bid: number;
  ask: number;
  spread: number;
  spreadPct: number;
  bidSize: number;
  askSize: number;
  quoteAgeMs: number;
  entry: number;
  /** USD risk per contract at entry (premium × 100) */
  riskUsd: number;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  /** per-minute theta in premium points at current spot */
  thetaPerMin: number | null;
  breakevenAtExpiry: number;
  /** modelled exit premium and return in each scenario at the horizon */
  atTarget: { exit: number; ret: number } | null;
  atFlat: { exit: number; ret: number };
  atInvalidation: { exit: number; ret: number };
  rewardRisk: number | null;
  /** win rate needed for zero expectancy given target/invalidation payoffs (model) */
  breakevenWinRate: number | null;
  eligible: boolean;
  reasons: string[];
  tradeoff: string;
}

export interface RankingResult {
  direction: Direction;
  asOf: number;
  ranked: RankedContract[];
  rejected: number;
  notes: DataQualityNote[];
  assumptions: string[];
}

export function rankContracts(i: RankingInputs): RankingResult {
  const right = i.direction === "call" ? "C" : "P";
  const S = i.chain.spot;
  const scale = i.levelScale ?? 1;
  const targetLevel = i.targetLevel !== null ? i.targetLevel * scale : null;
  const invalidationLevel = i.invalidationLevel * scale;
  const r = i.r ?? 0.04;
  const q = i.q ?? 0.012;
  const costs = i.costs ?? DEFAULT_COSTS;
  const notes: DataQualityNote[] = [];
  const out: RankedContract[] = [];
  let rejected = 0;
  const expiries = [...new Set(i.chain.options.filter((o) => o.right === right && o.expiry >= i.today).map((o) => o.expiry))].sort();
  const allowed = new Set<string>();
  // expiry classes
  if (expiries[0] === i.today && i.minutesToClose > i.horizonMinutes + 5) allowed.add(i.today);
  const later = expiries.filter((e) => e > i.today);
  if (i.preferredExpiry !== "0DTE" || allowed.size === 0) for (const e of later.slice(0, 3)) allowed.add(e);
  else for (const e of later.slice(0, 1)) allowed.add(e); // always show one alternative beyond 0DTE
  const H = i.horizonMinutes / TRADING_MINUTES_PER_YEAR;
  const tCache = new Map<string, number>();
  for (const o of i.chain.options) {
    if (o.right !== right || !allowed.has(o.expiry)) continue;
    // prefer PM-settled when both roots exist for a date
    if (o.root === "SPX" && i.chain.options.some((x) => x.root === "SPXW" && x.expiry === o.expiry)) continue;
    const key = `${o.root}|${o.expiry}`;
    let T = tCache.get(key);
    if (T === undefined) {
      T = yearsToExpiry(i.asOf, expiryInstantMs(o.root, o.expiry), "trading");
      tCache.set(key, T);
    }
    if (T <= 0) continue;
    const reasons: string[] = [];
    const mid = o.bid > 0 && o.ask > 0 ? (o.bid + o.ask) / 2 : null;
    const spread = o.ask - o.bid;
    const spreadPct = mid ? spread / mid : Infinity;
    const quoteAgeMs = i.asOf - o.quoteTime;
    const entry = o.ask;
    if (!(o.ask > 0.05)) {
      rejected++;
      continue;
    }
    const ivRes = mid ? impliedVol(right, mid, { S, K: o.strike, T, r, q }) : { iv: null };
    const iv = ivRes.iv;
    const g = iv ? bsGreeks(right, { S, K: o.strike, T, sigma: iv, r, q }) : null;
    const delta = g ? g.delta : null;
    const absDelta = delta !== null ? Math.abs(delta) : null;
    if (absDelta !== null && (absDelta < 0.12 || absDelta > 0.75)) {
      rejected++;
      continue; // outside the tradable delta band
    }
    if (absDelta === null) {
      rejected++;
      continue;
    }
    if (spreadPct > i.limits.maxSpreadPct) reasons.push(`spread ${(spreadPct * 100).toFixed(1)}% > ${(i.limits.maxSpreadPct * 100).toFixed(0)}%`);
    if (quoteAgeMs > i.limits.maxQuoteAgeMs) reasons.push(`quote age ${Math.round(quoteAgeMs / 1000)}s`);
    if (o.askSize < i.limits.minQuoteSize) reasons.push(`ask size ${o.askSize}`);
    if (entry * 100 > i.limits.maxPremiumPerContract) reasons.push(`premium $${(entry * 100).toFixed(0)} > budget`);
    const T2 = Math.max(0, T - H);
    const exitAt = (S2: number): number => {
      if (!iv) return 0;
      const model = T2 > 0 ? bsGreeks(right, { S: S2, K: o.strike, T: T2, sigma: iv, r, q }).price : Math.max(0, right === "C" ? S2 - o.strike : o.strike - S2);
      return Math.max(0, model - spread / 2);
    };
    const retOf = (exit: number) => (exit - entry) / entry - (2 * (costs.commissionPerContract + costs.feesPerContract)) / (entry * 100);
    const atTarget = targetLevel !== null ? { exit: exitAt(targetLevel), ret: retOf(exitAt(targetLevel)) } : null;
    const atFlat = { exit: exitAt(S), ret: retOf(exitAt(S)) };
    const atInval = { exit: exitAt(invalidationLevel), ret: retOf(exitAt(invalidationLevel)) };
    const gain = atTarget ? atTarget.ret : null;
    const loss = -atInval.ret;
    const rewardRisk = gain !== null && loss > 0 ? gain / loss : null;
    const breakevenWinRate = gain !== null && gain > 0 && loss > 0 ? loss / (gain + loss) : null;
    const thetaPerMin = g ? g.theta / TRADING_MINUTES_PER_YEAR : null;
    const is0dte = isPmExpiringToday(o.root, o.expiry, i.today);
    out.push({
      instrument: i.chain.underlying === "SPY" ? "SPY" : "SPX",
      withinBudget: entry * 100 <= i.limits.maxPremiumPerContract,
      osi: o.osi,
      root: o.root,
      expiry: o.expiry,
      right,
      strike: o.strike,
      is0dte,
      bid: o.bid,
      ask: o.ask,
      spread,
      spreadPct,
      bidSize: o.bidSize,
      askSize: o.askSize,
      quoteAgeMs,
      entry,
      riskUsd: entry * 100,
      iv,
      delta,
      gamma: g ? g.gamma : null,
      thetaPerMin,
      breakevenAtExpiry: breakevenWithCosts(right, o.strike, entry, costs),
      atTarget,
      atFlat,
      atInvalidation: atInval,
      rewardRisk,
      breakevenWinRate,
      eligible: reasons.length === 0,
      reasons,
      tradeoff: tradeoffText(absDelta, is0dte, thetaPerMin, entry, i.horizonMinutes),
    });
  }
  // rank: eligible first; then by reward/risk (if target) else by least theta bleed per horizon relative to premium
  // rank: eligible first; then reward/risk when a target exists; then proximity to a 0.45 delta (gamma per dollar
  // without the all-or-nothing profile of far OTM or the capital of deep ITM); then tighter spread
  out.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.withinBudget !== b.withinBudget) return a.withinBudget ? -1 : 1;
    const ra = a.rewardRisk ?? -Infinity;
    const rb = b.rewardRisk ?? -Infinity;
    if (ra !== rb) return rb - ra;
    const da = Math.abs(Math.abs(a.delta ?? 0) - 0.45);
    const db = Math.abs(Math.abs(b.delta ?? 0) - 0.45);
    if (Math.abs(da - db) > 0.03) return da - db;
    return a.spreadPct - b.spreadPct;
  });
  if (!out.length) notes.push({ level: "warn", message: `No ${i.chain.underlying} contracts in the tradable delta band (0.12–0.75) with a live ask.` });
  else if (!out.some((c) => c.withinBudget)) notes.push({ level: "warn", message: `No ${i.chain.underlying} contract within the $${i.limits.maxPremiumPerContract} budget in the delta band.` });
  return {
    direction: i.direction,
    asOf: i.asOf,
    ranked: out.slice(0, 6),
    rejected,
    notes,
    assumptions: [
      "Entry at the current ask; exit at Black-Scholes value (same IV) minus half the current spread; both sides of costs.",
      "Scenario returns are model outputs under the stated target/invalidation levels — not calibrated probabilities.",
      "SPY contracts are American; early-exercise value ignored (negligible for short-dated OTM/ATM).",
    ],
  };
}

function tradeoffText(absDelta: number, is0dte: boolean, thetaPerMin: number | null, entry: number, H: number): string {
  const decay = thetaPerMin !== null ? Math.abs(thetaPerMin) * H : null;
  const decayPct = decay !== null && entry > 0 ? (decay / entry) * 100 : null;
  const d = absDelta >= 0.55 ? "ITM/high delta: moves nearly point-for-point, less leverage, lower all-or-nothing risk" : absDelta >= 0.35 ? "near-ATM: best gamma per dollar, high theta" : "OTM/low delta: cheap and convex, most likely to expire worthless";
  return `${d}; ${is0dte ? "0DTE" : "later expiry"}${decayPct !== null ? `, ~${decayPct.toFixed(0)}% of premium decays over ${H} min if flat` : ""}.`;
}

/** Rank across several chains (e.g. SPX and SPY) and merge: eligible → within budget → reward/risk → delta → spread. */
export function rankAcrossChains(base: Omit<RankingInputs, "chain" | "levelScale">, chains: Array<{ chain: ChainSnapshot; levelScale: number }>): RankingResult {
  const parts = chains.map((c) => rankContracts({ ...base, chain: c.chain, levelScale: c.levelScale }));
  const all = parts.flatMap((p) => p.ranked);
  all.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.withinBudget !== b.withinBudget) return a.withinBudget ? -1 : 1;
    const ra = a.rewardRisk ?? -Infinity;
    const rb = b.rewardRisk ?? -Infinity;
    if (ra !== rb) return rb - ra;
    const da = Math.abs(Math.abs(a.delta ?? 0) - 0.45);
    const db = Math.abs(Math.abs(b.delta ?? 0) - 0.45);
    if (Math.abs(da - db) > 0.03) return da - db;
    return a.spreadPct - b.spreadPct;
  });
  return {
    direction: base.direction,
    asOf: base.asOf,
    ranked: all.slice(0, 8),
    rejected: parts.reduce((a, p) => a + p.rejected, 0),
    notes: parts.flatMap((p) => p.notes),
    assumptions: [...new Set(parts.flatMap((p) => p.assumptions)), "SPY levels are SPX levels scaled by the current SPY/SPX ratio."],
  };
}
