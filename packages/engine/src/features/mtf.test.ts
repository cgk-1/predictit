import { describe, expect, it } from "vitest";
import { aggregateBars, tfIndicators, multiTimeframe } from "./mtf";
import { etToMs } from "../time/et";
import type { Bar1m } from "../types";

function session(date: string, start: number, driftPerMin: number, n = 390): Bar1m[] {
  const t0 = etToMs(date, 9, 30);
  const out: Bar1m[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const c = p + driftPerMin + (i % 7 === 3 ? -0.3 : 0.1);
    out.push({ t: t0 + i * 60_000, o: p, h: Math.max(p, c) + 0.5, l: Math.min(p, c) - 0.5, c, v: null });
    p = c;
  }
  return out;
}

describe("multi-timeframe aggregation", () => {
  it("builds session-aligned 5/10/30-minute bars and drops the forming bucket", () => {
    const bars = session("2026-11-06", 7400, 0.05, 97); // 09:30–11:07 (97 bars)
    const asOf = etToMs("2026-11-06", 11, 7, 30);
    const b30 = aggregateBars(bars, 30, asOf);
    expect(b30.length).toBe(3); // 09:30, 10:00, 10:30 complete; 11:00 bucket forming (7 bars) → dropped
    expect(b30[0]!.t).toBe(etToMs("2026-11-06", 9, 30));
    expect(b30[0]!.n).toBe(30);
    expect(b30[0]!.h).toBe(Math.max(...bars.slice(0, 30).map((b) => b.h)));
    const b5 = aggregateBars(bars, 5, asOf);
    expect(b5.length).toBe(19); // 95 minutes complete → 19 five-minute bars; the 20th has 2 bars
    expect(aggregateBars(bars, 1, asOf).length).toBe(97);
  });
  it("spans sessions and labels trends per timeframe with alignment", () => {
    const bars = [...session("2026-11-04", 7300, 0.08), ...session("2026-11-05", 7331, 0.08), ...session("2026-11-06", 7362, 0.08, 120)];
    const asOf = etToMs("2026-11-06", 11, 31);
    const f30 = tfIndicators(bars, asOf, 30);
    expect(f30.bars).toBe(13 + 13 + 4);
    expect(f30.trend).toBe("up");
    expect(f30.ema9!).toBeGreaterThan(f30.ema21!);
    expect(f30.rsi14!).toBeGreaterThan(50);
    const m = multiTimeframe(bars, asOf);
    expect(m.alignment.label).toBe("aligned-up");
    expect(m.frames.map((f) => f.tf)).toEqual([1, 5, 10, 30]);
  });
  it("detects a pullback inside a higher-timeframe uptrend", () => {
    const up = [...session("2026-11-04", 7300, 0.08), ...session("2026-11-05", 7331, 0.08), ...session("2026-11-06", 7362, 0.08, 100)];
    // last 8 minutes fall sharply
    const t0 = up[up.length - 1]!.t;
    let p = up[up.length - 1]!.c;
    for (let i = 1; i <= 8; i++) {
      const c = p - 1.2;
      up.push({ t: t0 + i * 60_000, o: p, h: p + 0.2, l: c - 0.2, c, v: null });
      p = c;
    }
    const asOf = t0 + 9 * 60_000;
    const m = multiTimeframe(up, asOf);
    expect(m.frames[3]!.trend).toBe("up");
    expect(["pullback-in-uptrend", "mixed"]).toContain(m.alignment.label);
  });
  it("reports n/a with too little history", () => {
    const m = multiTimeframe(session("2026-11-06", 7400, 0.05, 20), etToMs("2026-11-06", 9, 51));
    expect(m.frames[3]!.trend).toBe("n/a");
    expect(m.alignment.label).toBe("n/a");
  });
});
