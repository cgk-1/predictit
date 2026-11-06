import { describe, expect, it } from "vitest";
import { calendarFeatures, summarizeDay } from "./calendar";
import { supportResistance } from "./sr";
import { etToMs } from "../time/et";
import type { Bar1m } from "../types";

function session(date: string, open: number, closeDrift: number, n = 390): Bar1m[] {
  const start = etToMs(date, 9, 30);
  const out: Bar1m[] = [];
  let p = open;
  for (let i = 0; i < n; i++) {
    const c = p + closeDrift / n;
    out.push({ t: start + i * 60_000, o: p, h: Math.max(p, c) + 1, l: Math.min(p, c) - 1, c, v: null });
    p = c;
  }
  return out;
}

describe("calendar features", () => {
  it("computes prior-day, gap, week-to-date and prior-week from multi-day bars", () => {
    // prior week: Mon-Fri 2026-10-26..30; this week Mon-Thu 2026-11-02..05; today Fri 2026-11-06
    const bars: Bar1m[] = [];
    let px = 7000;
    bars.push(...session("2026-10-23", px, 0)); // base session so the prior week's return has an anchor
    for (const d of ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]) {
      bars.push(...session(d, px, -20));
      px -= 20;
    }
    for (const d of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]) {
      bars.push(...session(d, px, 30));
      px += 30;
    }
    const todayOpen = px + 15; // gap up 15
    const today = session("2026-11-06", todayOpen, 5, 60);
    bars.push(...today);
    const asOf = etToMs("2026-11-06", 10, 31);
    const cf = calendarFeatures(bars, asOf);
    expect(cf.dayName).toBe("Fri");
    expect(cf.coverageDays).toBe(11);
    expect(cf.prior?.date).toBe("2026-11-05");
    expect(cf.prior?.closeLocation).toBeGreaterThan(0.9);
    expect(cf.prior?.last30Drift).toBeGreaterThan(0);
    expect(cf.prior?.ret).toBeCloseTo(30 / (px - 30), 4);
    expect(cf.today.gapPts).toBeCloseTo(15, 6);
    expect(cf.today.gapFilled).toBe(false);
    expect(cf.today.gapFillLevel).toBeCloseTo(px, 6);
    expect(cf.priorWeek?.ret).toBeLessThan(0);
    expect(cf.priorWeek?.high).toBeGreaterThan(cf.priorWeek!.low!);
    expect(cf.weekToDatePct).toBeGreaterThan(0);
    expect(cf.timeBucket).toBe("mid");
    expect(cf.isMonthlyOpex).toBe(false);
    expect(calendarFeatures(bars, etToMs("2026-11-06", 9, 20)).timeBucket).toBe("pre");
  });
  it("handles today-only data without inventing history", () => {
    const cf = calendarFeatures(session("2026-11-06", 7400, 10, 30), etToMs("2026-11-06", 10, 1));
    expect(cf.coverageDays).toBe(1);
    expect(cf.prior).toBeNull();
    expect(cf.today.gapPts).toBeNull();
    expect(cf.priorWeek).toBeNull();
    expect(summarizeDay([], "2026-11-06")).toBeNull();
  });
});

describe("support / resistance", () => {
  it("splits levels by side, scores touches and confluence, and sorts nearest first", () => {
    const asOf = etToMs("2026-11-06", 11, 0);
    const path = [];
    // price oscillates touching 7390 twice from above
    const seq = [7400, 7395, 7390.5, 7396, 7391, 7398, 7402, 7405];
    for (let i = 0; i < seq.length; i++) path.push({ t: asOf - (seq.length - i) * 60_000, p: seq[i]! });
    const levels = [
      { level: 7390, kind: "prior-close" as const, label: "Prior close", source: "x" },
      { level: 7390.3, kind: "put-wall" as const, label: "Put wall", source: "x" },
      { level: 7350, kind: "round" as const, label: "Round 7350", source: "x" },
      { level: 7420, kind: "or-high" as const, label: "OR high", source: "x" },
      { level: 7450, kind: "round" as const, label: "Round 7450", source: "x" },
      { level: 7800, kind: "call-wall" as const, label: "far", source: "x" },
    ];
    const sr = supportResistance(levels, 7405, path, asOf);
    expect(sr.support[0]!.level).toBeCloseTo(7390, 0);
    expect(sr.support[0]!.touches).toBeGreaterThanOrEqual(2);
    expect(sr.support[0]!.confluence.length).toBe(1);
    expect(sr.support[0]!.strength).toBeGreaterThan(sr.support[1]!.strength);
    expect(sr.resistance[0]!.level).toBe(7420);
    expect(sr.resistance.some((r) => r.level === 7800)).toBe(false); // >2% away
  });
});
