import { describe, expect, it } from "vitest";
import { parseCboeChain, parseCboeIntraday, CBOE_DELAY_MS, type CboeChainRaw, type CboeIntradayRaw } from "./cboe";
import { etToMs } from "@predictit/engine";

// Shapes copied from live payloads observed 2026-11-06 (values trimmed).
const chainRaw: CboeChainRaw = {
  timestamp: "2026-11-06 16:20:25",
  symbol: "_SPX",
  data: {
    symbol: "^SPX",
    security_type: "index",
    current_price: 7411.1201,
    bid: 7408.68,
    ask: 7413.72,
    open: 7377.65,
    high: 7444.2,
    low: 7369.55,
    close: 7411.12,
    prev_day_close: 7353.73,
    volume: 0,
    iv30: 18.633,
    last_trade_time: "2026-11-06T11:05:23",
    options: [
      { option: "SPXW261106C07410000", bid: 26.8, bid_size: 25, ask: 27.0, ask_size: 98, iv: 0.3771, open_interest: 383, volume: 9513, delta: 0.5066, gamma: 0.006, vega: 0.1, theta: -25.9, rho: 0, theo: 26.9, last_trade_price: 26.7, last_trade_time: "2026-11-06T11:05:18", prev_day_close: 20 },
      { option: "SPX261120P06900000", bid: 1.0, bid_size: 10, ask: 1.2, ask_size: 10, iv: 0.3, open_interest: 5000, volume: 10, delta: -0.05, gamma: 0.0001, vega: 0.1, theta: -1, rho: 0, theo: 1.1, last_trade_price: 1.1, last_trade_time: null, prev_day_close: 1 },
      { option: "SPX271217C05000000", bid: 2500, bid_size: 1, ask: 2520, ask_size: 1, iv: 0.2, open_interest: 100, volume: 0, delta: 1, gamma: 0, vega: 0, theta: 0, rho: 0, theo: 2510, last_trade_price: 2500, last_trade_time: null, prev_day_close: 2500 },
      { option: "B1SPY261106C00740000", bid: 0, bid_size: 0, ask: 1, ask_size: 3, iv: 0, open_interest: 85, volume: 38, delta: 0.05, gamma: 0, vega: 0, theta: -0.48, rho: 0, theo: 0.48, last_trade_price: 0.54, last_trade_time: "2026-11-06T10:57:12", prev_day_close: 0.15 },
    ],
  },
};

describe("Cboe delayed chain adapter", () => {
  it("stamps DELAYED with observedAt = generation UTC − 15 min and parses ET local times", () => {
    const recv = Date.UTC(2026, 10, 6, 16, 21, 0);
    const c = parseCboeChain(chainRaw, recv);
    expect(c.stamp.mode).toBe("DELAYED");
    expect(c.stamp.source).toBe("cboe-delayed");
    expect(c.stamp.observedAt).toBe(Date.UTC(2026, 10, 6, 16, 20, 25) - CBOE_DELAY_MS);
    expect(c.stamp.receivedAt).toBe(recv);
    expect(c.spotTime).toBe(etToMs("2026-11-06", 11, 5, 23));
    expect(c.underlying).toBe("SPX");
    expect(c.spot).toBe(7411.1201);
    expect(c.prevClose).toBe(7353.73);
  });
  it("normalizes contracts, keeps settlement by root, skips unsupported series, and filters by expiry/strike", () => {
    const c = parseCboeChain(chainRaw, Date.now());
    expect(c.options.length).toBe(3); // B1SPY… skipped
    const w = c.options.find((o) => o.root === "SPXW")!;
    expect(w.osi).toBe("SPXW  261106C07410000");
    expect(w.settlement).toBe("PM");
    expect(w.vendor?.ivTimeConvention).toBe("calendar");
    expect(w.lastTradeTime).toBe(etToMs("2026-11-06", 11, 5, 18));
    const m = c.options.find((o) => o.root === "SPX" && o.expiry === "2026-11-20")!;
    expect(m.settlement).toBe("AM");
    expect(m.lastTradeTime).toBeUndefined();
    const filtered = parseCboeChain(chainRaw, Date.now(), { maxDays: 14, strikePct: 0.05, today: "2026-11-06" });
    expect(filtered.options.map((o) => o.osi)).toEqual(["SPXW  261106C07410000"]);
  });
  it("converts intraday bars to bar-start instants and keeps options volume; SPX volume is null", () => {
    const raw: CboeIntradayRaw = {
      timestamp: "2026-11-06 16:20:11",
      symbol: "_SPX",
      data: [
        { datetime: "2026-11-06T09:31:00", sequence_number: 1, price: { open: 7377.65, high: 7379.72, low: 7369.55, close: 7378.56 }, volume: { stock_volume: 0, calls_volume: 10916, puts_volume: 11772, total_options_volume: 22688 } },
        { datetime: "2026-11-06T09:32:00", sequence_number: 2, price: { open: 7377.82, high: 7382.55, low: 7375.38, close: 7376.9 }, volume: { stock_volume: 0, calls_volume: 100, puts_volume: 200, total_options_volume: 300 } },
      ],
    };
    const b = parseCboeIntraday(raw, Date.now());
    expect(b.symbol).toBe("SPX");
    expect(b.bars[0]!.t).toBe(etToMs("2026-11-06", 9, 30));
    expect(b.bars[0]!.v).toBeNull();
    expect(b.bars[0]!.callsVol).toBe(10916);
    expect(b.bars[1]!.t).toBe(etToMs("2026-11-06", 9, 31));
    const spy = parseCboeIntraday({ ...raw, symbol: "SPY", data: [{ ...raw.data[0]!, volume: { ...raw.data[0]!.volume, stock_volume: 1116260 } }] }, Date.now());
    expect(spy.symbol).toBe("SPY");
    expect(spy.bars[0]!.v).toBe(1116260);
  });
});
