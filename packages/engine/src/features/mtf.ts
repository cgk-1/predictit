/**
 * Multi-timeframe features: 1/5/10/30-minute bars aggregated from the 1-minute stream, session-aligned (buckets start
 * at 09:30 ET each day so a 30-minute bar is 09:30–10:00, …, 15:30–16:00) and spanning prior sessions when history is
 * loaded. Each timeframe gets the same indicator set; the cross-timeframe read says whether the frames agree.
 * As-of safe: only 1-minute bars completed by `asOf` are used, and the forming higher-timeframe bar is excluded.
 */
import type { Bar1m } from "../types";
import { etParts } from "../time/et";
import { completedBars } from "./bars";

export type Timeframe = 1 | 5 | 10 | 30;
export const TIMEFRAMES: Timeframe[] = [1, 5, 10, 30];

export interface TfBar { t: number; o: number; h: number; l: number; c: number; n: number }

/** Aggregate completed 1-minute bars into session-aligned `tf`-minute bars; the last (forming) bucket is dropped unless complete. */
export function aggregateBars(bars1m: Bar1m[], tf: Timeframe, asOf: number): TfBar[] {
  const done = completedBars(bars1m, asOf);
  const out: TfBar[] = [];
  let cur: TfBar | null = null;
  let curKey = "";
  for (const b of done) {
    const p = etParts(b.t);
    const idx = Math.floor((p.minuteOfDay - 570) / tf); // 570 = 09:30
    const key = `${p.date}:${idx}`;
    if (key !== curKey) {
      if (cur) out.push(cur);
      cur = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, n: 1 };
      curKey = key;
    } else if (cur) {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.n++;
    }
  }
  if (cur) {
    // keep the final bucket only if it is complete (tf one-minute bars, or the session's last bucket ended)
    const p = etParts(cur.t);
    const bucketEnd = cur.t + (tf - ((p.minuteOfDay - 570) % tf)) * 60_000;
    if (cur.n >= tf || asOf >= bucketEnd) out.push(cur);
  }
  return out;
}

function ema(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let e = values[0] ?? 0;
  values.forEach((v, i) => {
    e = i === 0 ? v : v * k + e * (1 - k);
    out.push(e);
  });
  return out;
}

function rsi(values: number[], n = 14): number | null {
  if (values.length < n + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = values.length - n; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d > 0) gain += d;
    else loss -= d;
  }
  if (gain + loss === 0) return 50;
  const rs = loss === 0 ? Infinity : gain / loss;
  return 100 - 100 / (1 + rs);
}

export interface TfIndicators {
  tf: Timeframe;
  bars: number;
  last: number;
  lastBarRetPct: number | null;
  ema9: number | null;
  ema21: number | null;
  /** slope of EMA21 over the last 3 bars, % per bar */
  ema21SlopePctPerBar: number | null;
  roc3Pct: number | null;
  rsi14: number | null;
  atr14: number | null;
  /** position of the last close within the last 20 bars' range, 0 = low, 1 = high */
  rangePos20: number | null;
  structure: "HH-HL" | "LH-LL" | "mixed" | "n/a";
  trend: "up" | "down" | "flat" | "n/a";
  /** 0–1: |EMA9−EMA21| relative to ATR14, capped */
  strength: number;
  text: string;
}

export function tfIndicators(bars1m: Bar1m[], asOf: number, tf: Timeframe): TfIndicators {
  const bars = aggregateBars(bars1m, tf, asOf);
  const closes = bars.map((b) => b.c);
  const n = bars.length;
  const last = closes[n - 1] ?? NaN;
  const empty: TfIndicators = { tf, bars: n, last, lastBarRetPct: null, ema9: null, ema21: null, ema21SlopePctPerBar: null, roc3Pct: null, rsi14: null, atr14: null, rangePos20: null, structure: "n/a", trend: "n/a", strength: 0, text: `${tf}m: ${n} bars (needs 24+ for trend).` };
  if (n < 2) return empty;
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const ema9 = n >= 9 ? e9[n - 1]! : null;
  const ema21 = n >= 21 ? e21[n - 1]! : null;
  const slope = n >= 24 ? ((e21[n - 1]! - e21[n - 4]!) / e21[n - 4]! / 3) * 100 : null;
  const roc3 = n >= 4 ? (closes[n - 1]! / closes[n - 4]! - 1) * 100 : null;
  let atr: number | null = null;
  if (n >= 15) {
    let s = 0;
    for (let i = n - 14; i < n; i++) s += Math.max(bars[i]!.h - bars[i]!.l, Math.abs(bars[i]!.h - bars[i - 1]!.c), Math.abs(bars[i]!.l - bars[i - 1]!.c));
    atr = s / 14;
  }
  let rangePos: number | null = null;
  if (n >= 20) {
    const w = bars.slice(-20);
    const hi = Math.max(...w.map((b) => b.h));
    const lo = Math.min(...w.map((b) => b.l));
    rangePos = hi > lo ? (last - lo) / (hi - lo) : 0.5;
  }
  // swing structure from the last three completed bars' highs/lows (simple, deterministic)
  let structure: TfIndicators["structure"] = "n/a";
  if (n >= 3) {
    const [a, b, c] = bars.slice(-3) as [TfBar, TfBar, TfBar];
    if (c.h > b.h && b.h > a.h && c.l > b.l && b.l > a.l) structure = "HH-HL";
    else if (c.h < b.h && b.h < a.h && c.l < b.l && b.l < a.l) structure = "LH-LL";
    else structure = "mixed";
  }
  let trend: TfIndicators["trend"] = "n/a";
  let strength = 0;
  if (ema9 !== null && ema21 !== null && slope !== null) {
    const sep = ema9 - ema21;
    strength = atr ? Math.min(1, Math.abs(sep) / atr) : 0;
    if (sep > 0 && slope > 0.005) trend = "up";
    else if (sep < 0 && slope < -0.005) trend = "down";
    else trend = "flat";
  }
  const text = trend === "n/a" ? `${tf}m: ${n} bars (needs 24+ for trend).` : `${tf}m ${trend}${trend !== "flat" ? ` (${(strength * 100).toFixed(0)}%)` : ""}; EMA9 ${ema9!.toFixed(1)} vs EMA21 ${ema21!.toFixed(1)}, slope ${slope!.toFixed(3)}%/bar, RSI ${rsi(closes)?.toFixed(0) ?? "n/a"}, ${structure}.`;
  return { tf, bars: n, last, lastBarRetPct: (closes[n - 1]! / closes[n - 2]! - 1) * 100, ema9, ema21, ema21SlopePctPerBar: slope, roc3Pct: roc3, rsi14: rsi(closes), atr14: atr, rangePos20: rangePos, structure, trend, strength, text };
}

export interface MtfSummary {
  asOf: number;
  frames: TfIndicators[];
  alignment: { up: number; down: number; flat: number; label: "aligned-up" | "aligned-down" | "pullback-in-uptrend" | "bounce-in-downtrend" | "mixed" | "n/a"; text: string };
}

export function multiTimeframe(bars1m: Bar1m[], asOf: number): MtfSummary {
  const frames = TIMEFRAMES.map((tf) => tfIndicators(bars1m, asOf, tf));
  const higher = frames.filter((f) => f.tf >= 5 && f.trend !== "n/a");
  const up = higher.filter((f) => f.trend === "up").length;
  const down = higher.filter((f) => f.trend === "down").length;
  const flat = higher.filter((f) => f.trend === "flat").length;
  const f1 = frames[0]!;
  const f5 = frames[1]!;
  const f30 = frames[3]!;
  let label: MtfSummary["alignment"]["label"] = "n/a";
  let text = "Higher timeframes need more history (Schwab price history loads 10 days).";
  if (higher.length) {
    if (up === higher.length && higher.length >= 2) {
      label = "aligned-up";
      text = `All ${higher.length} higher timeframes trend up.`;
    } else if (down === higher.length && higher.length >= 2) {
      label = "aligned-down";
      text = `All ${higher.length} higher timeframes trend down.`;
    } else if (f30.trend === "up" && (f5.trend === "down" || f1.trend === "down" || (f5.lastBarRetPct ?? 0) < 0)) {
      label = "pullback-in-uptrend";
      text = "30-minute uptrend with a 5/1-minute pullback.";
    } else if (f30.trend === "down" && (f5.trend === "up" || f1.trend === "up" || (f5.lastBarRetPct ?? 0) > 0)) {
      label = "bounce-in-downtrend";
      text = "30-minute downtrend with a 5/1-minute bounce.";
    } else {
      label = "mixed";
      text = `Timeframes disagree (${up} up / ${down} down / ${flat} flat among 5/10/30m).`;
    }
  }
  return { asOf, frames, alignment: { up, down, flat, label, text } };
}
