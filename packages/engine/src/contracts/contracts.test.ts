import { describe, expect, it } from "vitest";
import { parseOptionSymbol, formatOsi, formatCboe } from "./occ";
import { isPmExpiringToday, isStandardMonthly, lastTradeMs, seriesSpec, upcomingSpxwExpiries } from "./series";
import { breakeven, breakevenWithCosts, intrinsic, resalePnl, settlementPnl, settlementReturn, DEFAULT_COSTS } from "./payoff";
import { etToMs } from "../time/et";

describe("option symbols", () => {
  it("parses Cboe compact, OSI and Schwab forms identically", () => {
    const a = parseOptionSymbol("SPXW261106C07400000");
    const b = parseOptionSymbol("SPXW  261106C07400000");
    expect(a).toEqual(b);
    expect(a.root).toBe("SPXW");
    expect(a.expiry).toBe("2026-11-06");
    expect(a.right).toBe("C");
    expect(a.strike).toBe(7400);
    expect(a.osi).toBe("SPXW  261106C07400000");
    expect(parseOptionSymbol("SPX261120P06900000").root).toBe("SPX");
    expect(parseOptionSymbol("SPY   261106P00740000").strike).toBe(740);
    expect(formatCboe("SPY", "2026-11-06", "P", 740)).toBe("SPY261106P00740000");
    expect(formatOsi("SPX", "2026-11-20", "C", 7412.5)).toBe("SPX   261120C07412500");
  });
  it("rejects unknown roots", () => {
    expect(() => parseOptionSymbol("QQQ261106C00500000")).toThrow();
  });
});

describe("series rules", () => {
  it("distinguishes AM-settled SPX from PM-settled SPXW on the same third Friday", () => {
    expect(isStandardMonthly("2026-11-20")).toBe(true);
    expect(seriesSpec("SPX").settlement).toBe("AM");
    expect(seriesSpec("SPXW").settlement).toBe("PM");
    expect(isPmExpiringToday("SPX", "2026-11-20", "2026-11-20")).toBe(false);
    expect(isPmExpiringToday("SPXW", "2026-11-20", "2026-11-20")).toBe(true);
    expect(isPmExpiringToday("SPY", "2026-11-20", "2026-11-20")).toBe(true);
    expect(isPmExpiringToday("SPXW", "2026-11-23", "2026-11-20")).toBe(false);
  });
  it("last trade: expiring PM contracts stop at 16:00, non-expiring SPX at 16:15, early close 13:00/13:15", () => {
    expect(lastTradeMs("SPXW", "2026-11-06", "2026-11-06")).toBe(etToMs("2026-11-06", 16, 0));
    expect(lastTradeMs("SPXW", "2026-11-09", "2026-11-06")).toBe(etToMs("2026-11-06", 16, 15));
    expect(lastTradeMs("SPY", "2026-11-09", "2026-11-06")).toBe(etToMs("2026-11-06", 16, 15));
    expect(lastTradeMs("SPY", "2026-11-06", "2026-11-06")).toBe(etToMs("2026-11-06", 16, 15));
    // SPXO: AM-settled weekday series (launch 2026-11-09): expires at the open, never eligible for the PM closing window
    expect(lastTradeMs("SPXO", "2026-11-18", "2026-11-18")).toBe(etToMs("2026-11-18", 9, 30));
    expect(seriesSpec("SPXO").settlement).toBe("AM");
    expect(isPmExpiringToday("SPXO", "2026-11-18", "2026-11-18")).toBe(false);
    expect(parseOptionSymbol("SPXO261118C07400000").root).toBe("SPXO");
    expect(lastTradeMs("SPXW", "2026-11-27", "2026-11-27")).toBe(etToMs("2026-11-27", 13, 0));
    expect(lastTradeMs("SPXW", "2026-11-30", "2026-11-27")).toBe(etToMs("2026-11-27", 13, 15));
    // AM-settled standard SPX does not trade on its expiration day
    expect(lastTradeMs("SPX", "2026-11-20", "2026-11-20")).toBe(etToMs("2026-11-20", 9, 30));
  });
  it("moves third Fridays that fall on holidays to Thursday", () => {
    expect(isStandardMonthly("2026-06-18")).toBe(true); // Juneteenth Fri 2026-06-19
    expect(isStandardMonthly("2027-06-17")).toBe(true); // Juneteenth observed Fri 2027-06-18
  });
  it("lists daily SPXW expiries skipping holidays", () => {
    expect(upcomingSpxwExpiries("2026-11-24", 4)).toEqual(["2026-11-24", "2026-11-25", "2026-11-27", "2026-11-30"]);
  });
});

describe("payoff arithmetic", () => {
  it("intrinsic and breakeven", () => {
    expect(intrinsic("C", 7400, 7412.37)).toBeCloseTo(12.37, 6);
    expect(intrinsic("P", 7400, 7412.37)).toBe(0);
    expect(intrinsic("P", 7400, 7390)).toBe(10);
    expect(breakeven("C", 7400, 3.2)).toBeCloseTo(7403.2);
    expect(breakeven("P", 7400, 3.2)).toBeCloseTo(7396.8);
    // one side of default costs = $0.75 per contract = 0.0075 index points
    expect(breakevenWithCosts("C", 7400, 3.2)).toBeCloseTo(7403.2075);
  });
  it("settlement P&L uses multiplier 100 and counts one side of costs", () => {
    const r = settlementPnl({ right: "C", strike: 7400, settlement: 7412.37, premiumPaid: 3.2, qty: 2 });
    expect(r.intrinsic).toBeCloseTo(12.37);
    expect(r.gross).toBeCloseTo(100 * (12.37 - 3.2) * 2);
    expect(r.costs).toBeCloseTo(0.75 * 2);
    expect(r.net).toBeCloseTo(1834 - 1.5);
  });
  it("in the money is not necessarily profitable", () => {
    const r = settlementPnl({ right: "P", strike: 7400, settlement: 7398, premiumPaid: 4.5, qty: 1 });
    expect(r.intrinsic).toBe(2);
    expect(r.net).toBeLessThan(0);
    expect(settlementReturn("P", 7400, 7398, 4.5)).toBeCloseTo((2 - 4.5) / 4.5);
  });
  it("full premium loss when out of the money", () => {
    const r = settlementPnl({ right: "C", strike: 7400, settlement: 7399.99, premiumPaid: 1.1, qty: 1 });
    expect(r.gross).toBeCloseTo(-110);
  });
  it("resale P&L counts both sides of costs", () => {
    const r = resalePnl({ entryPremium: 1.1, exitPremium: 2.0, qty: 3, costs: DEFAULT_COSTS });
    expect(r.gross).toBeCloseTo(100 * 0.9 * 3);
    expect(r.costs).toBeCloseTo(2 * 0.75 * 3);
    expect(r.net).toBeCloseTo(270 - 4.5);
  });
});
