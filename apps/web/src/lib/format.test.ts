import { describe, expect, it } from "vitest";
import { fmtAgo, fmtClock, fmtContract, fmtMs, fmtPct, fmtPts, fmtSignedPts, fmtSignedUsd, fmtStrike, fmtTime, fmtUsd, stripTimePrefix, undash } from "./format";

describe("format helpers", () => {
  it("renders n/a for missing or non-finite numbers", () => {
    expect(fmtPts(null)).toBe("n/a");
    expect(fmtPts(undefined)).toBe("n/a");
    expect(fmtPts(NaN)).toBe("n/a");
    expect(fmtUsd(Infinity)).toBe("n/a");
    expect(fmtPct(null)).toBe("n/a");
    expect(fmtAgo(null)).toBe("n/a");
    expect(fmtTime(null)).toBe("n/a");
  });

  it("formats points, signed points and strikes", () => {
    expect(fmtPts(6012.345)).toBe("6012.3");
    expect(fmtPts(6012.345, 2)).toBe("6012.35");
    expect(fmtSignedPts(3.21)).toBe("+3.2");
    expect(fmtSignedPts(-1.26)).toBe("−1.3");
    expect(fmtSignedPts(0)).toBe("0.0");
    expect(fmtStrike(6000)).toBe("6000");
    expect(fmtStrike(6002.5)).toBe("6002.5");
  });

  it("formats USD and percentages", () => {
    expect(fmtUsd(1234.5)).toBe("$1,235");
    expect(fmtUsd(-12)).toBe("−$12");
    expect(fmtSignedUsd(50)).toBe("+$50");
    expect(fmtSignedUsd(-50.4, 2)).toBe("−$50.40");
    expect(fmtPct(0.1234)).toBe("12.3%");
    expect(fmtPct(0.5, 0)).toBe("50%");
  });

  it("formats durations", () => {
    expect(fmtMs(120)).toBe("120ms");
    expect(fmtMs(1500)).toBe("1.5s");
    expect(fmtMs(45_000)).toBe("45s");
    expect(fmtMs(130_000)).toBe("2m 10s");
    expect(fmtMs(3_600_000)).toBe("1h");
    expect(fmtAgo(3000)).toBe("3.0s ago");
    expect(fmtAgo(-120_000)).toBe("in 2m");
    expect(fmtClock(0)).toBe("0:00");
    expect(fmtClock(75)).toBe("1:15");
    expect(fmtClock(3725)).toBe("1:02:05");
    expect(fmtClock(-5)).toBe("0:00");
  });

  it("formats ET times from epoch ms", () => {
    // 2026-11-06 15:50:00 ET (EST, UTC-5) = 20:50:00Z
    const ms = Date.UTC(2026, 10, 6, 20, 50, 0);
    expect(fmtTime(ms)).toBe("15:50:00");
  });

  it("formats contracts from OSI symbols and tolerates junk", () => {
    expect(fmtContract("SPXW  261106C07400000")).toBe("SPXW 2026-11-06 7400 C");
    expect(fmtContract("not-a-symbol")).toBe("not-a-symbol");
    expect(fmtContract(null)).toBe("n/a");
  });

  it("strips change-feed time prefixes and undashes labels", () => {
    expect(stripTimePrefix("15:42 WAIT → CALL SETUP.")).toBe("WAIT → CALL SETUP.");
    expect(stripTimePrefix("Opened paper position")).toBe("Opened paper position");
    expect(undash("trend-up")).toBe("trend up");
    expect(undash(null)).toBe("n/a");
  });
});
