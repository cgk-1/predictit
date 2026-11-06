import { describe, expect, it } from "vitest";
import { gexSummary, contractGammas, DEFAULT_GEX_CONFIG } from "./gex";
import { bsGreeks } from "../pricing/bs";
import { yearsToExpiry, expiryInstantMs } from "../pricing/tte";
import { etToMs } from "../time/et";
import type { ChainSnapshot, OptionQuote } from "../types";

const DATE = "2026-11-06";
const t = etToMs(DATE, 11, 0);
function opt(strike: number, right: "C" | "P", oi: number, expiry = DATE): OptionQuote {
  const T = yearsToExpiry(t, expiryInstantMs("SPXW", expiry), "trading");
  const px = bsGreeks(right, { S: 7400, K: strike, T, sigma: 0.18, r: 0.04, q: 0.012 }).price;
  const yymmdd = expiry.slice(2, 4) + expiry.slice(5, 7) + expiry.slice(8, 10);
  return { osi: `SPXW  ${yymmdd}${right}${String(strike * 1000).padStart(8, "0")}`, root: "SPXW", underlying: "SPX", expiry, right, strike, settlement: "PM", exercise: "european", multiplier: 100, bid: px - 0.05, ask: px + 0.05, bidSize: 10, askSize: 10, volume: 100, openInterest: oi, quoteTime: t };
}
const chain: ChainSnapshot = {
  underlying: "SPX",
  spot: 7400,
  spotTime: t,
  options: [opt(7400, "C", 1000), opt(7400, "P", 1000), opt(7450, "C", 2000), opt(7350, "P", 2000), opt(7400, "C", 500, "2026-11-13"), opt(7400, "P", 500, "2026-11-13")],
  stamp: { source: "schwab", mode: "LIVE", observedAt: t, receivedAt: t },
};

describe("GEX", () => {
  it("recovers the input IV and applies the formula Γ·OI·100·S with the configured sign", () => {
    const cg = contractGammas(chain, t, { ...DEFAULT_GEX_CONFIG, dealerSign: "naive" });
    const c = cg.find((x) => x.strike === 7400 && x.right === "C" && x.is0dte)!;
    expect(c.iv).toBeCloseTo(0.18, 2);
    expect(c.ivSource).toBe("own");
    expect(c.gex1pt).toBeCloseTo(c.gamma * 1000 * 100 * 7400, 6);
    const p = cg.find((x) => x.strike === 7400 && x.right === "P" && x.is0dte)!;
    expect(p.gex1pt).toBeLessThan(0);
    expect(Math.abs(p.gex1pt)).toBeCloseTo(Math.abs(c.gex1pt), 0);
  });
  it("naive-ex-0dte excludes 0DTE from the signed net but keeps unsigned concentration", () => {
    const s = gexSummary(chain, t);
    expect(s.config.dealerSign).toBe("naive-ex-0dte");
    expect(s.totals.net0dte).toBe(0);
    const row = s.byStrike.find((r) => r.strike === 7400)!;
    expect(row.abs0dte).toBeGreaterThan(0);
    expect(s.walls.largest0dte).toBe(7400);
    const naive = s.sensitivity.find((x) => x.model === "naive")!;
    const abs0 = s.byStrike.reduce((a, r) => a + r.abs0dte, 0);
    expect(Math.abs(naive.net0dte)).toBeLessThan(0.15 * abs0); // near-symmetric call/put OI largely cancels under naive signs
    expect(s.sensitivity.find((x) => x.model === "all-short")!.net).toBeLessThan(0);
    expect(s.sensitivity.find((x) => x.model === "all-long")!.net).toBeGreaterThan(0);
  });
  it("finds a zero-gamma level between a put-heavy strike below and a call-heavy strike above", () => {
    const s = gexSummary(chain, t, { ...DEFAULT_GEX_CONFIG, dealerSign: "naive" });
    expect(s.flip.level).not.toBeNull();
    expect(s.flip.level!).toBeGreaterThan(7350);
    expect(s.flip.level!).toBeLessThan(7450);
    expect(s.walls.callWall).toBe(7450);
    expect(s.walls.putWall).toBe(7350);
    expect(s.notes.some((n) => /OI as of the close before/.test(n.message))).toBe(true);
  });
});
