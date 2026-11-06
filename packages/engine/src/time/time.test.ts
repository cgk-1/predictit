import { describe, expect, it } from "vitest";
import { etParts, etToMs, etLocalIsoToMs, utcLocalIsoToMs, fmtEt } from "./et";
import { sessionInfo, isTradingDay, nextTradingDay, prevTradingDay, thirdFriday, tradingDaysBetween } from "./calendar";
import { sessionClock } from "./session";

describe("ET conversions", () => {
  it("handles EST and EDT offsets", () => {
    // 2026-11-06 is after DST end (Nov 1, 2026) -> EST (-300)
    const ms = etToMs("2026-11-06", 15, 50);
    expect(ms).toBe(Date.UTC(2026, 10, 6, 20, 50));
    expect(etParts(ms).offsetMinutes).toBe(-300);
    // 2026-07-15 -> EDT (-240)
    const ms2 = etToMs("2026-07-15", 9, 30);
    expect(ms2).toBe(Date.UTC(2026, 6, 15, 13, 30));
    expect(etParts(ms2).offsetMinutes).toBe(-240);
  });
  it("round-trips wall time", () => {
    const ms = etToMs("2026-03-09", 10, 15, 30); // day after DST start (Mar 8, 2026)
    const p = etParts(ms);
    expect([p.hour, p.minute, p.second, p.date]).toEqual([10, 15, 30, "2026-03-09"]);
  });
  it("parses vendor local ET strings and UTC strings", () => {
    expect(etLocalIsoToMs("2026-11-06T11:05:23")).toBe(Date.UTC(2026, 10, 6, 16, 5, 23));
    expect(utcLocalIsoToMs("2026-11-06 16:20:25")).toBe(Date.UTC(2026, 10, 6, 16, 20, 25));
    expect(fmtEt(Date.UTC(2026, 10, 6, 16, 20, 25))).toBe("2026-11-06 11:20:25 ET");
  });
});

describe("calendar", () => {
  it("knows 2026 holidays and early closes", () => {
    expect(isTradingDay("2026-11-26")).toBe(false); // Thanksgiving
    expect(sessionInfo("2026-11-27").isEarlyClose).toBe(true);
    expect(sessionInfo("2026-11-27").equityCloseMin).toBe(13 * 60);
    expect(sessionInfo("2026-11-27").spxOptionsCloseMin).toBe(13 * 60 + 15);
    expect(isTradingDay("2026-07-03")).toBe(false);
    expect(isTradingDay("2026-11-07")).toBe(false); // Saturday
    expect(isTradingDay("2026-11-06")).toBe(true);
    expect(sessionInfo("2026-11-06").calendarVerified).toBe(true);
    expect(sessionInfo("2031-01-06").calendarVerified).toBe(false);
  });
  it("navigates trading days", () => {
    expect(nextTradingDay("2026-11-25")).toBe("2026-11-27");
    expect(prevTradingDay("2026-11-30")).toBe("2026-11-27");
    expect(tradingDaysBetween("2026-11-06", "2026-11-13")).toBe(5);
  });
  it("computes third Fridays", () => {
    expect(thirdFriday(2026, 11)).toBe("2026-11-20");
    expect(thirdFriday(2026, 12)).toBe("2026-12-18");
    expect(thirdFriday(2027, 4)).toBe("2027-04-16");
  });
});

describe("session clock", () => {
  it("classifies phases on a regular day", () => {
    const at = (h: number, m: number) => sessionClock(etToMs("2026-11-06", h, m)).phase;
    expect(at(8, 0)).toBe("premarket");
    expect(at(9, 30)).toBe("opening");
    expect(at(9, 44)).toBe("opening");
    expect(at(10, 30)).toBe("morning");
    expect(at(12, 0)).toBe("midday");
    expect(at(14, 30)).toBe("afternoon");
    expect(at(15, 10)).toBe("final-hour");
    expect(at(15, 50)).toBe("final-ten");
    expect(at(15, 59)).toBe("final-ten");
    expect(at(16, 0)).toBe("post-close");
    expect(at(18, 0)).toBe("closed");
  });
  it("shifts the closing window on early-close days", () => {
    const c = sessionClock(etToMs("2026-11-27", 12, 55));
    expect(c.phase).toBe("final-ten");
    expect(c.inClosingWindow).toBe(true);
    expect(Math.round(c.minutesToClose)).toBe(5);
  });
  it("is closed on holidays", () => {
    expect(sessionClock(etToMs("2026-11-26", 12, 0)).phase).toBe("closed");
  });
});
