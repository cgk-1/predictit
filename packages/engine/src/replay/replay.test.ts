import { describe, expect, it } from "vitest";
import { frameAt, runReplay, performance as perf, type StoredSnapshot } from "./replay";
import { completedBars } from "../features/bars";
import { etToMs } from "../time/et";
import type { BarSeries, ChainSnapshot, IndexQuote } from "../types";

const DATE = "2026-11-06";
const open = etToMs(DATE, 9, 30);

function barsSeries(upTo: number): BarSeries {
  const bars = [];
  for (let t = open; t + 60_000 <= upTo; t += 60_000) bars.push({ t, o: 7400, h: 7401, l: 7399, c: 7400 + (t - open) / 600_000, v: null });
  return { symbol: "SPX", bars, stamp: { source: "schwab", mode: "LIVE", observedAt: upTo, receivedAt: upTo } };
}

describe("replay leakage guards", () => {
  it("frameAt never includes snapshots received after asOf", () => {
    const t1 = open + 10 * 60_000;
    const t2 = open + 20 * 60_000;
    const snaps: StoredSnapshot[] = [
      { receivedAt: t1, kind: "spxBars", payload: barsSeries(t1) },
      { receivedAt: t2, kind: "spxBars", payload: barsSeries(t2) },
      { receivedAt: t2, kind: "spxQuote", payload: { symbol: "SPX", last: 9999, quoteTime: t2, volume: null, stamp: { source: "schwab", mode: "LIVE", observedAt: t2, receivedAt: t2 } } as IndexQuote },
    ];
    const f = frameAt(snaps, t1 + 30_000);
    expect(f.spxBars!.stamp.receivedAt).toBe(t1);
    expect(f.spx!.last).not.toBe(9999);
    expect(f.spx!.quoteTime).toBeLessThanOrEqual(t1 + 30_000);
  });

  it("completedBars excludes the partially formed current bar", () => {
    const s = barsSeries(open + 30 * 60_000);
    const asOf = open + 29 * 60_000 + 30_000; // inside the 29th bar
    const done = completedBars(s.bars, asOf);
    expect(done[done.length - 1]!.t + 60_000).toBeLessThanOrEqual(asOf);
    expect(done.length).toBe(29);
  });

  it("runReplay walks chronologically and reports abstention with no trades on empty data", () => {
    const t1 = open + 10 * 60_000;
    const t2 = open + 15 * 60_000;
    const snaps: StoredSnapshot[] = [
      { receivedAt: t1, kind: "spxBars", payload: barsSeries(t1) },
      { receivedAt: t2, kind: "spxBars", payload: barsSeries(t2) },
    ];
    const r = runReplay(snaps, { stepMs: 60_000, slippagePts: 0.05, requireSize: true, latencyMs: 1000, qty: 1 });
    expect(r.decisions).toBe(6);
    expect(r.trades.length).toBe(0);
    const p = perf(r.trades);
    expect(p.n).toBe(0);
    expect(Number.isNaN(p.winRate)).toBe(true);
  });

  it("performance metrics are computed from trades after costs", () => {
    const p = perf([
      { id: "a", date: DATE, family: "x", direction: "call", osi: "", entryAt: 0, entrySpot: 0, entryPremium: 1, exitAt: 1, exitPremium: 2, exitReason: "", pnlUsd: 98.5, retPct: 0.985, phase: "morning", regime: "r", fillFailed: false },
      { id: "b", date: DATE, family: "x", direction: "put", osi: "", entryAt: 0, entrySpot: 0, entryPremium: 1, exitAt: 1, exitPremium: 0, exitReason: "", pnlUsd: -101.5, retPct: -1.015, phase: "morning", regime: "r", fillFailed: false },
      { id: "c", date: DATE, family: "y", direction: "put", osi: "", entryAt: 0, entrySpot: 0, entryPremium: 2, exitAt: 1, exitPremium: 2.5, exitReason: "", pnlUsd: 48.5, retPct: 0.2425, phase: "midday", regime: "r", fillFailed: false },
    ]);
    expect(p.n).toBe(3);
    expect(p.winRate).toBeCloseTo(2 / 3);
    expect(p.fullLossRate).toBeCloseTo(1 / 3);
    expect(p.totalUsd).toBeCloseTo(45.5);
    expect(p.longestLosingStreak).toBe(1);
    expect(p.byFamily["x"]!.n).toBe(2);
  });
});
