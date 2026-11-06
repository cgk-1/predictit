import type { Right } from "../types";
import { MULTIPLIER } from "./series";

export interface CostModel {
  /** Broker commission per contract per side (USD). */
  commissionPerContract: number;
  /** Exchange + regulatory + clearing fees per contract per side (USD). */
  feesPerContract: number;
  /** Index-option specific exchange fee passthrough per contract per side, if any. */
  indexFeePerContract?: number;
}

export const DEFAULT_COSTS: CostModel = { commissionPerContract: 0.65, feesPerContract: 0.1, indexFeePerContract: 0 };

export function intrinsic(right: Right, strike: number, settlement: number): number {
  return right === "C" ? Math.max(settlement - strike, 0) : Math.max(strike - settlement, 0);
}

export function perSideCost(costs: CostModel): number {
  return costs.commissionPerContract + costs.feesPerContract + (costs.indexFeePerContract ?? 0);
}

/**
 * Net P&L of holding a long option through cash settlement (SPXW) or expiration (SPY, ignoring assignment).
 * Only the opening side pays commission; cash settlement itself has no commission (fees may apply at some brokers;
 * pass them through `settlementFeePerContract`).
 */
export function settlementPnl(args: {
  right: Right;
  strike: number;
  settlement: number;
  premiumPaid: number;
  qty: number;
  costs?: CostModel;
  settlementFeePerContract?: number;
  multiplier?: number;
}): { intrinsic: number; gross: number; costs: number; net: number } {
  const mult = args.multiplier ?? MULTIPLIER;
  const costs = args.costs ?? DEFAULT_COSTS;
  const intr = intrinsic(args.right, args.strike, args.settlement);
  const gross = mult * (intr - args.premiumPaid) * args.qty;
  const c = perSideCost(costs) * args.qty + (args.settlementFeePerContract ?? 0) * args.qty;
  return { intrinsic: intr, gross, costs: c, net: gross - c };
}

/** Net P&L of buying then selling (two sides of costs). */
export function resalePnl(args: {
  entryPremium: number;
  exitPremium: number;
  qty: number;
  costs?: CostModel;
  multiplier?: number;
}): { gross: number; costs: number; net: number } {
  const mult = args.multiplier ?? MULTIPLIER;
  const costs = args.costs ?? DEFAULT_COSTS;
  const gross = mult * (args.exitPremium - args.entryPremium) * args.qty;
  const c = 2 * perSideCost(costs) * args.qty;
  return { gross, costs: c, net: gross - c };
}

/** Underlying level at which settlement P&L is zero (before costs). */
export function breakeven(right: Right, strike: number, premium: number): number {
  return right === "C" ? strike + premium : strike - premium;
}

/** Breakeven including one side of costs expressed in index points. */
export function breakevenWithCosts(right: Right, strike: number, premium: number, costs: CostModel = DEFAULT_COSTS, multiplier = MULTIPLIER): number {
  const costPts = perSideCost(costs) / multiplier;
  return breakeven(right, strike, premium + costPts);
}

/** Return multiple on premium for a settlement outcome (e.g. 2.0 = +200%). */
export function settlementReturn(right: Right, strike: number, settlement: number, premiumPaid: number): number {
  if (premiumPaid <= 0) return NaN;
  return (intrinsic(right, strike, settlement) - premiumPaid) / premiumPaid;
}
