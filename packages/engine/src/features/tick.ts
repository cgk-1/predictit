/**
 * NYSE TICK features (breadth / participation). TICK = (NYSE stocks on an uptick − downtick) at an instant; readings
 * beyond ±1000 are classically read as exhaustion, and persistently signed TICK as broad participation. All of it is
 * a hypothesis layer; values come only from a live TICK feed (Schwab $TICK) and are null otherwise.
 */
import type { Bar1m } from "../types";
import { completedBars } from "./bars";

export interface TickFeatures {
  last: number | null;
  lastAt: number | null;
  avg5: number | null;
  avg10: number | null;
  hi10: number | null;
  lo10: number | null;
  /** count of 1-minute bars in the last 10 with |high| or |low| ≥ 1000 */
  extremes10: number;
  /** share of the last 10 bars whose close is positive */
  posShare10: number | null;
  label: "broad-up" | "broad-down" | "mixed" | "exhaustion-high" | "exhaustion-low" | "n/a";
  text: string;
}

export function tickFeatures(bars: Bar1m[] | undefined, lastQuote: { last: number; quoteTime: number } | undefined, asOf: number): TickFeatures {
  const done = bars ? completedBars(bars, asOf) : [];
  const last10 = done.slice(-10);
  const last5 = done.slice(-5);
  const avg = (xs: Bar1m[]) => (xs.length ? xs.reduce((a, b) => a + b.c, 0) / xs.length : null);
  const avg5 = avg(last5);
  const avg10 = avg(last10);
  const hi10 = last10.length ? Math.max(...last10.map((b) => b.h)) : null;
  const lo10 = last10.length ? Math.min(...last10.map((b) => b.l)) : null;
  const extremes10 = last10.filter((b) => b.h >= 1000 || b.l <= -1000).length;
  const posShare10 = last10.length ? last10.filter((b) => b.c > 0).length / last10.length : null;
  const last = lastQuote?.last ?? (done.length ? done[done.length - 1]!.c : null);
  let label: TickFeatures["label"] = "n/a";
  let text = "TICK unavailable (needs the Schwab live feed).";
  if (last !== null && avg10 !== null) {
    if (last >= 1000) {
      label = "exhaustion-high";
      text = `TICK ${last} ≥ +1000: buying climax reading (hypothesis: short-term exhaustion).`;
    } else if (last <= -1000) {
      label = "exhaustion-low";
      text = `TICK ${last} ≤ −1000: selling climax reading (hypothesis: short-term exhaustion).`;
    } else if (avg10 >= 200 && (posShare10 ?? 0) >= 0.7) {
      label = "broad-up";
      text = `10-min average TICK ${avg10.toFixed(0)} with ${Math.round((posShare10 ?? 0) * 100)}% positive minutes: broad participation to the upside.`;
    } else if (avg10 <= -200 && (posShare10 ?? 1) <= 0.3) {
      label = "broad-down";
      text = `10-min average TICK ${avg10.toFixed(0)} with ${Math.round((1 - (posShare10 ?? 1)) * 100)}% negative minutes: broad participation to the downside.`;
    } else {
      label = "mixed";
      text = `10-min average TICK ${avg10.toFixed(0)}: mixed participation.`;
    }
  }
  return { last, lastAt: lastQuote?.quoteTime ?? (done.length ? done[done.length - 1]!.t + 60_000 : null), avg5, avg10, hi10, lo10, extremes10, posShare10, label, text };
}
