import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, extractCodeFromRedirect, parseSchwabChain, parseSchwabQuote, parseSchwabHistory, chainDateWindow } from "./schwab";
import { etToMs } from "@predictit/engine";

describe("Schwab OAuth helpers", () => {
  it("builds the authorize URL with response_type=code and extracts the decoded code from a pasted redirect", () => {
    const u = new URL(buildAuthorizeUrl("CLIENT", "https://127.0.0.1:8182"));
    expect(u.origin + u.pathname).toBe("https://api.schwabapi.com/v1/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("CLIENT");
    expect(u.searchParams.get("redirect_uri")).toBe("https://127.0.0.1:8182");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(extractCodeFromRedirect("https://127.0.0.1:8182/?code=C0.abc%40&session=xyz")).toBe("C0.abc@");
    expect(() => extractCodeFromRedirect("https://127.0.0.1:8182/?session=xyz")).toThrow();
  });
});

describe("Schwab market-data normalizers", () => {
  it("parses an index quote (no bid/ask, tradeTime ms, volume null) and an equity quote", () => {
    const t = etToMs("2026-11-06", 11, 5, 23);
    const spx = parseSchwabQuote("$SPX", { assetMainType: "INDEX", quote: { lastPrice: 7411.12, tradeTime: t, openPrice: 7377.65, highPrice: 7444.2, lowPrice: 7369.55, closePrice: 7353.73 } }, t + 500);
    expect(spx.symbol).toBe("SPX");
    expect(spx.last).toBe(7411.12);
    expect(spx.quoteTime).toBe(t);
    expect(spx.volume).toBeNull();
    expect(spx.bid).toBeUndefined();
    expect(spx.stamp.mode).toBe("LIVE");
    const spy = parseSchwabQuote("SPY", { assetMainType: "EQUITY", quote: { lastPrice: 739.1, bidPrice: 739.09, askPrice: 739.11, bidSize: 5, askSize: 7, quoteTime: t, totalVolume: 1234567 } }, t + 500);
    expect(spy.symbol).toBe("SPY");
    expect(spy.bid).toBe(739.09);
    expect(spy.volume).toBe(1234567);
  });
  it("parses callExpDateMap/putExpDateMap with either bid/ask or bidPrice/askPrice field names and sets settlement from settlementType", () => {
    const t = etToMs("2026-11-06", 11, 5, 23);
    const raw = {
      symbol: "$SPX",
      underlying: { last: 7411.12, quoteTime: t },
      callExpDateMap: {
        "2026-11-06:0": { "7410.0": [{ symbol: "SPXW  261106C07410000", bid: 26.8, ask: 27.0, bidSize: 25, askSize: 98, last: 26.7, totalVolume: 9513, openInterest: 383, volatility: 37.71, delta: 0.5066, gamma: 0.006, theta: -25.9, vega: 0.1, quoteTimeInLong: t, tradeTimeInLong: t - 5000, expirationType: "W", settlementType: "P" }] },
        "2026-11-20:14": { "7400.0": [{ symbol: "SPX   261120C07400000", bidPrice: 100, askPrice: 101, bidSize: 1, askSize: 1, lastPrice: 100.5, totalVolume: 1, openInterest: 10, volatility: -999, delta: 0.55, gamma: 0.001, quoteTimeInLong: t - 1000, expirationType: "S", settlementType: "A" }] },
      },
      putExpDateMap: { "2026-11-06:0": { "7410.0": [{ symbol: "SPXW  261106P07410000", bid: 25.5, ask: 25.7, bidSize: 79, askSize: 1, totalVolume: 12395, openInterest: 1858, volatility: 37.27, delta: -0.4934, gamma: 0.0061, quoteTimeInLong: t, settlementType: "P" }] } },
    };
    const c = parseSchwabChain(raw, t + 200);
    expect(c.underlying).toBe("SPX");
    expect(c.spot).toBe(7411.12);
    expect(c.options.length).toBe(3);
    const w = c.options.find((o) => o.osi === "SPXW  261106C07410000")!;
    expect(w.settlement).toBe("PM");
    expect(w.vendor?.iv).toBeCloseTo(0.3771, 4);
    expect(w.lastTradeTime).toBe(t - 5000);
    const m = c.options.find((o) => o.root === "SPX")!;
    expect(m.settlement).toBe("AM");
    expect(m.bid).toBe(100);
    expect(m.last).toBe(100.5);
    expect(m.vendor?.iv).toBeUndefined(); // sentinel ignored
    expect(c.stamp.observedAt).toBe(t);
    expect(c.stamp.mode).toBe("LIVE");
  });
  it("parses price history into bars and computes the chain date window", () => {
    const t = etToMs("2026-11-06", 9, 30);
    const h = parseSchwabHistory({ symbol: "$SPX", candles: [{ open: 1, high: 2, low: 0.5, close: 1.5, volume: 0, datetime: t }, { open: 1.5, high: 2, low: 1, close: 1.8, volume: 0, datetime: t + 60_000 }] }, t + 120_000);
    expect(h.bars.length).toBe(2);
    expect(h.bars[0]!.v).toBeNull();
    expect(h.stamp.observedAt).toBe(t + 120_000);
    const w = chainDateWindow(etToMs("2026-11-06", 12, 0), 8);
    expect(w.fromDate).toBe("2026-11-06");
    expect(w.toDate).toBe("2026-11-14");
  });
});
