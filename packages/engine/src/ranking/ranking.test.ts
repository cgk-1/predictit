import { describe, expect, it } from "vitest";
import { rankContracts } from "./contracts";
import { etToMs } from "../time/et";
import type { ChainSnapshot, OptionQuote } from "../types";

const DATE = "2026-11-06";
function opt(strike: number, right: "C" | "P", bid: number, ask: number, t: number, expiry = DATE, askSize = 30): OptionQuote {
  const yymmdd = expiry.slice(2, 4) + expiry.slice(5, 7) + expiry.slice(8, 10);
  return { osi: `SPXW  ${yymmdd}${right}${String(strike * 1000).padStart(8, "0")}`, root: "SPXW", underlying: "SPX", expiry, right, strike, settlement: "PM", exercise: "european", multiplier: 100, bid, ask, bidSize: 30, askSize, volume: 1, openInterest: 1, quoteTime: t };
}
function chain(spot: number, t: number): ChainSnapshot {
  const options: OptionQuote[] = [];
  for (let k = 7300; k <= 7500; k += 5) {
    const d = k - spot;
    const c = Math.max(0.15, 20 - d * 0.5 + Math.max(0, d) * 0.25);
    const p = Math.max(0.15, 20 + d * 0.5 + Math.max(0, -d) * 0.25);
    options.push(opt(k, "C", c - 0.1, c + 0.1, t));
    options.push(opt(k, "P", p - 0.1, p + 0.1, t));
  }
  return { underlying: "SPX", spot, spotTime: t, options, stamp: { source: "schwab", mode: "LIVE", observedAt: t, receivedAt: t } };
}

describe("contract ranking", () => {
  const t = etToMs(DATE, 11, 0);
  const limits = { maxSpreadPct: 0.08, maxQuoteAgeMs: 15_000, minQuoteSize: 1, maxPremiumPerContract: 2500 };
  it("ranks calls for a call setup with entry at the ask and a target scenario", () => {
    const r = rankContracts({ chain: chain(7400, t), asOf: t, today: DATE, direction: "call", horizonMinutes: 30, targetLevel: 7425, invalidationLevel: 7390, preferredExpiry: "0DTE", minutesToClose: 300, limits });
    expect(r.ranked.length).toBeGreaterThan(0);
    for (const c of r.ranked) {
      expect(c.right).toBe("C");
      expect(c.entry).toBe(c.ask);
      expect(c.riskUsd).toBeCloseTo(c.ask * 100);
      expect(Math.abs(c.delta!)).toBeGreaterThanOrEqual(0.12);
      expect(Math.abs(c.delta!)).toBeLessThanOrEqual(0.75);
      expect(c.atTarget!.ret).toBeGreaterThan(c.atInvalidation.ret);
    }
    expect(r.ranked[0]!.eligible).toBe(true);
    expect(r.assumptions.join(" ")).toMatch(/ask/);
  });
  it("treats an unchanged quote as fresh when the chain fetch is fresh", () => {
    const c = chain(7400, t - 60_000); // per-contract quoteTime 60 s old
    c.stamp = { ...c.stamp, observedAt: t - 3000 }; // but fetched 3 s ago
    const r = rankContracts({ chain: c, asOf: t, today: DATE, direction: "call", horizonMinutes: 30, targetLevel: 7425, invalidationLevel: 7390, preferredExpiry: "0DTE", minutesToClose: 300, limits });
    expect(r.ranked[0]!.quoteAgeMs).toBe(3000);
    expect(r.ranked[0]!.reasons.some((x) => /quote age/.test(x))).toBe(false);
  });
  it("marks stale, wide or oversized contracts ineligible with reasons", () => {
    const c = chain(7400, t - 60_000);
    const r = rankContracts({ chain: c, asOf: t, today: DATE, direction: "put", horizonMinutes: 30, targetLevel: 7380, invalidationLevel: 7410, preferredExpiry: "0DTE", minutesToClose: 300, limits: { ...limits, maxPremiumPerContract: 500 } });
    expect(r.ranked.every((x) => !x.eligible)).toBe(true);
    expect(r.ranked[0]!.reasons.some((s) => /quote age/.test(s))).toBe(true);
  });
  it("excludes 0DTE when the horizon does not fit before the close", () => {
    const r = rankContracts({ chain: chain(7400, t), asOf: t, today: DATE, direction: "call", horizonMinutes: 60, targetLevel: 7425, invalidationLevel: 7390, preferredExpiry: "0DTE", minutesToClose: 40, limits });
    expect(r.ranked.every((x) => x.expiry !== DATE)).toBe(true);
  });
});
