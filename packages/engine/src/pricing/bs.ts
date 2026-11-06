/**
 * Black-Scholes (with continuous dividend yield) for European index options, plus a robust implied-vol solver.
 * SPY options are American but, for short-dated OTM/ATM calls and puts on a low-dividend ETF, early exercise
 * value is negligible; we flag the approximation where used.
 */
import type { Right } from "../types";

export function normCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26 with refinement via erf approximation; accuracy ~1e-7
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp((-x * x) / 2);
}

export interface BsInputs {
  S: number;
  K: number;
  T: number; // years (convention chosen by caller)
  sigma: number; // annualized under the same convention
  r?: number; // continuously compounded risk-free rate
  q?: number; // dividend yield
}

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  /** per year; divide by trading minutes per year for per-minute decay */
  theta: number;
  vega: number; // per 1.00 of sigma
  d1: number;
  d2: number;
}

export function bsPrice(right: Right, i: BsInputs): number {
  return bsGreeks(right, i).price;
}

export function bsGreeks(right: Right, { S, K, T, sigma, r = 0, q = 0 }: BsInputs): Greeks {
  if (T <= 0 || sigma <= 0) {
    const intr = right === "C" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const delta = right === "C" ? (S > K ? 1 : 0) : S < K ? -1 : 0;
    return { price: intr, delta, gamma: 0, theta: 0, vega: 0, d1: S > K ? Infinity : -Infinity, d2: S > K ? Infinity : -Infinity };
  }
  const sq = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / sq;
  const d2 = d1 - sq;
  const eq = Math.exp(-q * T);
  const er = Math.exp(-r * T);
  const pdf = normPdf(d1);
  const gamma = (eq * pdf) / (S * sq);
  const vega = S * eq * pdf * Math.sqrt(T);
  if (right === "C") {
    const price = S * eq * normCdf(d1) - K * er * normCdf(d2);
    const delta = eq * normCdf(d1);
    const theta = (-(S * eq * pdf * sigma) / (2 * Math.sqrt(T))) - r * K * er * normCdf(d2) + q * S * eq * normCdf(d1);
    return { price, delta, gamma, theta, vega, d1, d2 };
  }
  const price = K * er * normCdf(-d2) - S * eq * normCdf(-d1);
  const delta = -eq * normCdf(-d1);
  const theta = (-(S * eq * pdf * sigma) / (2 * Math.sqrt(T))) + r * K * er * normCdf(-d2) - q * S * eq * normCdf(-d1);
  return { price, delta, gamma, theta, vega, d1, d2 };
}

export interface IvResult {
  iv: number | null;
  reason?: "no-time-value" | "below-intrinsic" | "no-convergence" | "bad-input";
  iterations: number;
}

/** Implied vol by bracketing + bisection/secant; returns null with a reason when price has no admissible vol. */
export function impliedVol(right: Right, price: number, i: Omit<BsInputs, "sigma">): IvResult {
  const { S, K, T, r = 0, q = 0 } = i;
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(price >= 0)) return { iv: null, reason: "bad-input", iterations: 0 };
  const intr = right === "C" ? Math.max(S * Math.exp(-q * T) - K * Math.exp(-r * T), 0) : Math.max(K * Math.exp(-r * T) - S * Math.exp(-q * T), 0);
  if (price < intr - 1e-9) return { iv: null, reason: "below-intrinsic", iterations: 0 };
  if (price - intr < 1e-6) return { iv: null, reason: "no-time-value", iterations: 0 };
  let lo = 1e-4;
  let hi = 5;
  const f = (s: number) => bsPrice(right, { S, K, T, sigma: s, r, q }) - price;
  let flo = f(lo);
  let fhi = f(hi);
  if (flo > 0) return { iv: null, reason: "no-convergence", iterations: 0 };
  if (fhi < 0) {
    hi = 20;
    fhi = f(hi);
    if (fhi < 0) return { iv: null, reason: "no-convergence", iterations: 0 };
  }
  let it = 0;
  let mid = 0.2;
  const tol = Math.max(1e-7, price * 1e-7);
  for (; it < 60; it++) {
    mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (Math.abs(fm) < tol || hi - lo < 1e-6) break;
    if (fm > 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return { iv: mid, iterations: it };
}

/** Probability (risk-neutral, lognormal) that S_T > K (call) or < K (put). */
export function probItm(right: Right, { S, K, T, sigma, r = 0, q = 0 }: BsInputs): number {
  if (T <= 0 || sigma <= 0) return right === "C" ? (S > K ? 1 : 0) : S < K ? 1 : 0;
  const d2 = (Math.log(S / K) + (r - q - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return right === "C" ? normCdf(d2) : normCdf(-d2);
}

/** Probability of touching a level before T under driftless lognormal (reflection principle). */
export function probTouch(S: number, level: number, T: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  const x = Math.abs(Math.log(level / S));
  return 2 * (1 - normCdf(x / (sigma * Math.sqrt(T))));
}
