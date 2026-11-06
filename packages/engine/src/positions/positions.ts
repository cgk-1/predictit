/**
 * Paper / manual positions. Marked at the executable bid (what you could sell for), never at last trade or mid.
 * Exit checks are conditions to ATTEMPT an exit; fills are not guaranteed.
 */
import type { ChainSnapshot, OptionQuote, Right, OptionRoot } from "../types";
import { intrinsic, resalePnl, settlementPnl, DEFAULT_COSTS, type CostModel } from "../contracts/payoff";
import { expiryInstantMs } from "../pricing/tte";

export interface PaperPosition {
  id: string;
  osi: string;
  root: OptionRoot;
  expiry: string;
  right: Right;
  strike: number;
  qty: number;
  entryPremium: number;
  entryAt: number;
  entrySpot: number | null;
  strategyId: string | null;
  decisionId: string | null;
  invalidationLevel: number | null;
  horizonEndsAt: number | null;
  profitTargetPremium: number | null;
  /** trailing stop: exit when bid falls below (highBidSeen − trailPts) once highBidSeen ≥ activateAt */
  trail: { activateAt: number; trailPts: number } | null;
  highBidSeen: number;
  status: "open" | "closed";
  exit: { at: number; premium: number; reason: string; spot: number | null } | null;
  note: string;
  mode: "paper" | "manual";
}

export interface PositionMark {
  id: string;
  bid: number | null;
  ask: number | null;
  quoteAgeMs: number | null;
  markValue: number | null;
  unrealizedUsd: number | null;
  unrealizedPct: number | null;
  intrinsicNow: number | null;
  secondsToExpiry: number;
  alerts: Array<{ level: "info" | "warn" | "action"; text: string }>;
  exitSignal: { reason: string; attemptAt: number | null } | null;
}

export function markPosition(p: PaperPosition, chain: ChainSnapshot | null, spot: number | null, asOf: number, costs: CostModel = DEFAULT_COSTS): PositionMark {
  const q: OptionQuote | undefined = chain?.options.find((o) => o.osi === p.osi);
  const bid = q && q.bid > 0 ? q.bid : null;
  const ask = q && q.ask > 0 ? q.ask : null;
  const quoteAgeMs = q && chain ? Math.max(0, Math.min(asOf - q.quoteTime, asOf - chain.stamp.observedAt)) : null;
  const alerts: PositionMark["alerts"] = [];
  const expMs = expiryInstantMs(p.root, p.expiry);
  const secondsToExpiry = Math.max(0, (expMs - asOf) / 1000);
  const intrinsicNow = spot !== null ? intrinsic(p.right, p.strike, spot) : null;
  let markValue = bid;
  if (markValue === null && secondsToExpiry === 0 && intrinsicNow !== null) markValue = intrinsicNow;
  const pnl = markValue !== null ? resalePnl({ entryPremium: p.entryPremium, exitPremium: markValue, qty: p.qty, costs }) : null;
  if (quoteAgeMs !== null && quoteAgeMs > 30_000) alerts.push({ level: "warn", text: `Quote ${Math.round(quoteAgeMs / 1000)}s old.` });
  if (bid === null && secondsToExpiry > 0) alerts.push({ level: "warn", text: "No bid: position may not be sellable right now." });
  let exitSignal: PositionMark["exitSignal"] = null;
  if (p.invalidationLevel !== null && spot !== null) {
    const breached = p.right === "C" ? spot < p.invalidationLevel : spot > p.invalidationLevel;
    if (breached) exitSignal = { reason: `Invalidation: SPX ${spot.toFixed(1)} beyond ${p.invalidationLevel.toFixed(1)}`, attemptAt: asOf };
  }
  if (!exitSignal && p.horizonEndsAt !== null && asOf >= p.horizonEndsAt) exitSignal = { reason: "Time stop reached", attemptAt: asOf };
  if (!exitSignal && p.profitTargetPremium !== null && bid !== null && bid >= p.profitTargetPremium) exitSignal = { reason: `Profit target ${p.profitTargetPremium.toFixed(2)} reached (bid ${bid.toFixed(2)})`, attemptAt: asOf };
  if (!exitSignal && p.trail && bid !== null && p.highBidSeen >= p.trail.activateAt && bid <= p.highBidSeen - p.trail.trailPts) exitSignal = { reason: `Trailing exit: bid ${bid.toFixed(2)} ≤ high ${p.highBidSeen.toFixed(2)} − ${p.trail.trailPts}`, attemptAt: asOf };
  if (secondsToExpiry > 0 && secondsToExpiry <= 120 && isPmSettled(p)) alerts.push({ level: "action", text: "Under 2 minutes to expiration: decide resale vs settlement now." });
  if (exitSignal) alerts.push({ level: "action", text: `Attempt exit — ${exitSignal.reason}` });
  return {
    id: p.id,
    bid,
    ask,
    quoteAgeMs,
    markValue,
    unrealizedUsd: pnl ? pnl.net : null,
    unrealizedPct: markValue !== null && p.entryPremium > 0 ? (markValue - p.entryPremium) / p.entryPremium : null,
    intrinsicNow,
    secondsToExpiry,
    alerts,
    exitSignal,
  };
}

export function isPmSettled(p: Pick<PaperPosition, "root">): boolean {
  return p.root !== "SPX";
}

export function newPaperPosition(args: Omit<PaperPosition, "id" | "highBidSeen" | "status" | "exit">, idSuffix?: string): PaperPosition {
  return {
    ...args,
    id: `pos_${args.entryAt}_${idSuffix ?? Math.random().toString(36).slice(2, 8)}`,
    highBidSeen: args.entryPremium,
    status: "open",
    exit: null,
  };
}

/** Close by resale at `premium`, or by settlement when reason === "settlement" (then `premium` is the settlement VALUE of the index). */
export function closePosition(p: PaperPosition, at: number, premium: number, reason: string, spot: number | null): PaperPosition {
  return { ...p, status: "closed", exit: { at, premium, reason, spot } };
}

export function realizedPnl(p: PaperPosition, costs: CostModel = DEFAULT_COSTS): number | null {
  if (p.status !== "closed" || !p.exit) return null;
  if (p.exit.reason === "settlement") return settlementPnl({ right: p.right, strike: p.strike, settlement: p.exit.premium, premiumPaid: p.entryPremium, qty: p.qty, costs }).net;
  return resalePnl({ entryPremium: p.entryPremium, exitPremium: p.exit.premium, qty: p.qty, costs }).net;
}

/** Update the running high bid used by trailing exits. */
export function observeBid(p: PaperPosition, bid: number | null): PaperPosition {
  if (bid === null || bid <= p.highBidSeen) return p;
  return { ...p, highBidSeen: bid };
}

export interface Budget {
  maxPremiumPerContract: number;
  maxOpenRiskUsd: number;
  dailyLossLimitUsd: number;
}

export function budgetCheck(open: PaperPosition[], realizedToday: number, candidateAsk: number, qty: number, b: Budget): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (candidateAsk * 100 > b.maxPremiumPerContract) reasons.push(`Premium $${(candidateAsk * 100).toFixed(0)} exceeds per-contract budget $${b.maxPremiumPerContract}.`);
  const openRisk = open.reduce((a, p) => a + p.entryPremium * 100 * p.qty, 0);
  if (openRisk + candidateAsk * 100 * qty > b.maxOpenRiskUsd) reasons.push(`Open risk $${(openRisk + candidateAsk * 100 * qty).toFixed(0)} exceeds limit $${b.maxOpenRiskUsd}.`);
  if (realizedToday <= -b.dailyLossLimitUsd) reasons.push(`Daily loss limit $${b.dailyLossLimitUsd} reached (realized ${realizedToday.toFixed(0)}). No loss-recovery sizing.`);
  return { ok: reasons.length === 0, reasons };
}
