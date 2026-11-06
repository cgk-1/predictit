export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
export function round(x: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
/** Max drawdown of a cumulative P&L path. */
export function maxDrawdown(cum: number[]): number {
  let peak = -Infinity;
  let dd = 0;
  for (const v of cum) {
    peak = Math.max(peak, v);
    dd = Math.max(dd, peak - v);
  }
  return dd;
}
export function longestLosingStreak(pnls: number[]): number {
  let best = 0;
  let cur = 0;
  for (const p of pnls) {
    cur = p < 0 ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}
