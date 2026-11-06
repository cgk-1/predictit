/**
 * Features derived from 1-minute bars. All functions take `asOf` and use only bars that COMPLETED at or before
 * asOf (bar end = t + 60 s). This is the primary leakage guard for replay: a partially formed bar is never used.
 */
import type { Bar1m } from "../types";
import { etParts } from "../time/et";
import { median, stdev } from "../util/stats";

export const TRADING_MIN_PER_YEAR = 252 * 390;

export function completedBars(bars: Bar1m[], asOf: number): Bar1m[] {
  return bars.filter((b) => b.t + 60_000 <= asOf);
}

export function sessionBars(bars: Bar1m[], date: string): Bar1m[] {
  return bars.filter((b) => etParts(b.t).date === date);
}

export function ret(bars: Bar1m[], k: number): number | null {
  if (bars.length <= k) return null;
  const a = bars[bars.length - 1 - k]!.c;
  const b = bars[bars.length - 1]!.c;
  return a > 0 ? b / a - 1 : null;
}

/** Annualized realized vol (trading-time) from close-to-close log returns of the last n bars. */
export function realizedVol(bars: Bar1m[], n: number): number | null {
  if (bars.length < n + 1) return null;
  const rs: number[] = [];
  for (let i = bars.length - n; i < bars.length; i++) rs.push(Math.log(bars[i]!.c / bars[i - 1]!.c));
  const s = stdev(rs);
  return Number.isFinite(s) ? s * Math.sqrt(TRADING_MIN_PER_YEAR) : null;
}

/** Parkinson estimator using high/low of the last n bars (more efficient for sparse ticks). */
export function parkinsonVol(bars: Bar1m[], n: number): number | null {
  if (bars.length < n) return null;
  let s = 0;
  let cnt = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const b = bars[i]!;
    if (b.h > 0 && b.l > 0 && b.h >= b.l) {
      s += Math.log(b.h / b.l) ** 2;
      cnt++;
    }
  }
  if (!cnt) return null;
  return Math.sqrt(s / (4 * Math.log(2) * cnt)) * Math.sqrt(TRADING_MIN_PER_YEAR);
}

/** Average true range over n bars in index points. */
export function atr(bars: Bar1m[], n: number): number | null {
  if (bars.length < n + 1) return null;
  let s = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const b = bars[i]!;
    const pc = bars[i - 1]!.c;
    s += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
  }
  return s / n;
}

/** Kaufman efficiency ratio over n bars: |net change| / sum |changes|. 1 = straight line, ~0 = chop. */
export function efficiencyRatio(bars: Bar1m[], n: number): number | null {
  if (bars.length < n + 1) return null;
  const a = bars[bars.length - 1 - n]!.c;
  const b = bars[bars.length - 1]!.c;
  let path = 0;
  for (let i = bars.length - n; i < bars.length; i++) path += Math.abs(bars[i]!.c - bars[i - 1]!.c);
  return path > 0 ? Math.abs(b - a) / path : 0;
}

export interface OpeningRange { high: number; low: number; complete: boolean; minutes: number }

/** Opening range from the first `minutes` completed bars of the session. */
export function openingRange(sessBars: Bar1m[], minutes: number, openMs: number): OpeningRange | null {
  const inRange = sessBars.filter((b) => b.t >= openMs && b.t < openMs + minutes * 60_000);
  if (!inRange.length) return null;
  return {
    high: Math.max(...inRange.map((b) => b.h)),
    low: Math.min(...inRange.map((b) => b.l)),
    complete: inRange.length >= minutes - 1,
    minutes,
  };
}

export function sessionHighLow(sessBars: Bar1m[]): { high: number; low: number; open: number } | null {
  if (!sessBars.length) return null;
  return { high: Math.max(...sessBars.map((b) => b.h)), low: Math.min(...sessBars.map((b) => b.l)), open: sessBars[0]!.o };
}

/** Volume-weighted average price; null when the series has no traded volume (SPX). */
export function vwap(sessBars: Bar1m[]): number | null {
  let pv = 0;
  let vv = 0;
  for (const b of sessBars) {
    if (b.v === null || b.v <= 0) continue;
    const typ = (b.h + b.l + b.c) / 3;
    pv += typ * b.v;
    vv += b.v;
  }
  return vv > 0 ? pv / vv : null;
}

/** Time-weighted average price (explicit proxy for SPX where no volume exists). */
export function twap(sessBars: Bar1m[]): number | null {
  if (!sessBars.length) return null;
  return sessBars.reduce((a, b) => a + (b.h + b.l + b.c) / 3, 0) / sessBars.length;
}

/** Ratio of the latest `w`-bar range to the median of earlier `w`-bar ranges this session (compression < 1 < expansion). */
export function rangeCompression(sessBars: Bar1m[], w: number): number | null {
  if (sessBars.length < 2 * w) return null;
  const ranges: number[] = [];
  for (let i = w; i <= sessBars.length - w; i += w) {
    const seg = sessBars.slice(i - w, i);
    ranges.push(Math.max(...seg.map((b) => b.h)) - Math.min(...seg.map((b) => b.l)));
  }
  const last = sessBars.slice(-w);
  const lr = Math.max(...last.map((b) => b.h)) - Math.min(...last.map((b) => b.l));
  const med = median(ranges);
  return med > 0 ? lr / med : null;
}

/** Speed (points/min) and acceleration (change in speed) over the last `w` bars. */
export function speedAccel(bars: Bar1m[], w: number): { speed: number; accel: number } | null {
  if (bars.length < 2 * w + 1) return null;
  const c = (i: number) => bars[bars.length - 1 - i]!.c;
  const s1 = (c(0) - c(w)) / w;
  const s0 = (c(w) - c(2 * w)) / w;
  return { speed: s1, accel: s1 - s0 };
}

export interface BarFeatures {
  asOf: number;
  nBars: number;
  last: number | null;
  ret1: number | null;
  ret5: number | null;
  ret15: number | null;
  ret30: number | null;
  ret60: number | null;
  rv15: number | null;
  rv30: number | null;
  rv60: number | null;
  park30: number | null;
  atr14: number | null;
  er60: number | null;
  compression15: number | null;
  speed5: number | null;
  accel5: number | null;
  or15: OpeningRange | null;
  or30: OpeningRange | null;
  sessHigh: number | null;
  sessLow: number | null;
  sessOpen: number | null;
  vwap: number | null;
  twap: number | null;
  /** cumulative options volume today (Cboe intraday feed), calls and puts */
  callsVolToday: number | null;
  putsVolToday: number | null;
}

export function barFeatures(allBars: Bar1m[], asOf: number, date: string, openMs: number): BarFeatures {
  const bars = completedBars(allBars, asOf);
  const sess = sessionBars(bars, date);
  const hl = sessionHighLow(sess);
  const sa = speedAccel(sess, 5);
  const hasOptVol = sess.some((b) => b.callsVol !== undefined);
  return {
    asOf,
    nBars: sess.length,
    last: sess.length ? sess[sess.length - 1]!.c : null,
    ret1: ret(sess, 1),
    ret5: ret(sess, 5),
    ret15: ret(sess, 15),
    ret30: ret(sess, 30),
    ret60: ret(sess, 60),
    rv15: realizedVol(sess, 15),
    rv30: realizedVol(sess, 30),
    rv60: realizedVol(sess, 60),
    park30: parkinsonVol(sess, 30),
    atr14: atr(sess, 14),
    er60: efficiencyRatio(sess, 60),
    compression15: rangeCompression(sess, 15),
    speed5: sa?.speed ?? null,
    accel5: sa?.accel ?? null,
    or15: openingRange(sess, 15, openMs),
    or30: openingRange(sess, 30, openMs),
    sessHigh: hl?.high ?? null,
    sessLow: hl?.low ?? null,
    sessOpen: hl?.open ?? null,
    vwap: vwap(sess),
    twap: twap(sess),
    callsVolToday: hasOptVol ? sess.reduce((a, b) => a + (b.callsVol ?? 0), 0) : null,
    putsVolToday: hasOptVol ? sess.reduce((a, b) => a + (b.putsVol ?? 0), 0) : null,
  };
}
