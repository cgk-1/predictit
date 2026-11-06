import { describe, expect, it } from "vitest";
import { bsGreeks, bsPrice, impliedVol, probItm, probTouch, normCdf } from "./bs";
import { tradingMinutesRemaining, yearsToExpiry, sigmaOverMinutes, expiryInstantMs } from "./tte";
import { etToMs } from "../time/et";

describe("Black-Scholes", () => {
  it("matches a textbook value", () => {
    // S=100,K=100,T=1,sigma=0.2,r=0.05 -> call 10.4506, put 5.5735
    expect(bsPrice("C", { S: 100, K: 100, T: 1, sigma: 0.2, r: 0.05 })).toBeCloseTo(10.4506, 3);
    expect(bsPrice("P", { S: 100, K: 100, T: 1, sigma: 0.2, r: 0.05 })).toBeCloseTo(5.5735, 3);
  });
  it("put-call parity holds", () => {
    const i = { S: 7411, K: 7400, T: 0.003, sigma: 0.17, r: 0.04, q: 0.012 };
    const c = bsPrice("C", i);
    const p = bsPrice("P", i);
    expect(c - p).toBeCloseTo(i.S * Math.exp(-i.q * i.T) - i.K * Math.exp(-i.r * i.T), 6);
  });
  it("implied vol inverts price", () => {
    const i = { S: 7411, K: 7400, T: 0.003, r: 0.04 };
    const px = bsPrice("C", { ...i, sigma: 0.165 });
    const iv = impliedVol("C", px, i);
    expect(iv.iv).toBeCloseTo(0.165, 5);
    expect(impliedVol("C", 11, { S: 7411, K: 7400, T: 0.003 }).reason).toBe("no-time-value");
    expect(impliedVol("C", 5, { S: 7411, K: 7400, T: 0.003 }).reason).toBe("below-intrinsic");
  });
  it("greeks have sane signs and gamma is symmetric", () => {
    const c = bsGreeks("C", { S: 100, K: 100, T: 0.01, sigma: 0.2 });
    const p = bsGreeks("P", { S: 100, K: 100, T: 0.01, sigma: 0.2 });
    expect(c.delta).toBeGreaterThan(0.49);
    expect(p.delta).toBeLessThan(-0.49);
    expect(c.gamma).toBeCloseTo(p.gamma, 10);
    expect(c.theta).toBeLessThan(0);
    expect(c.vega).toBeGreaterThan(0);
  });
  it("probabilities", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(probItm("C", { S: 100, K: 100, T: 0.01, sigma: 0.2 })).toBeCloseTo(0.496, 2);
    expect(probTouch(100, 101, 0.01, 0.2)).toBeGreaterThan(probItm("C", { S: 100, K: 101, T: 0.01, sigma: 0.2 }));
  });
});

describe("time to expiry", () => {
  it("counts trading minutes to today's close", () => {
    const now = etToMs("2026-11-06", 15, 50);
    const exp = expiryInstantMs("SPXW", "2026-11-06");
    expect(exp).toBe(etToMs("2026-11-06", 16, 0));
    expect(tradingMinutesRemaining(now, exp)).toBe(10);
    expect(yearsToExpiry(now, exp, "trading")).toBeCloseTo(10 / (252 * 390), 12);
    expect(yearsToExpiry(now, exp, "calendar")).toBeCloseTo(10 / (365 * 1440), 12);
  });
  it("spans multiple sessions and skips the weekend", () => {
    const now = etToMs("2026-11-06", 15, 0); // Friday 3pm
    const exp = expiryInstantMs("SPXW", "2026-11-10"); // Tuesday
    // 60 min today + Mon 390 + Tue 390
    expect(tradingMinutesRemaining(now, exp)).toBe(60 + 390 + 390);
    // AM-settled: ends at the open of expiry day
    const expAm = expiryInstantMs("SPX", "2026-11-20");
    expect(tradingMinutesRemaining(etToMs("2026-11-19", 15, 0), expAm)).toBe(60);
  });
  it("sigma over minutes", () => {
    expect(sigmaOverMinutes(0.16, 10)).toBeCloseTo(0.16 * Math.sqrt(10 / 98280), 10);
  });
  it("after expiry returns zero", () => {
    expect(tradingMinutesRemaining(etToMs("2026-11-06", 16, 1), expiryInstantMs("SPXW", "2026-11-06"))).toBe(0);
  });
});
