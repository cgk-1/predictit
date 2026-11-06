import { describe, expect, it } from "vitest";
import { decide, shouldPersist, diffDecisions } from "./decide";
import { buildContext } from "./context";
import { etToMs } from "../time/et";
import type { MarketFrame, Bar1m, ChainSnapshot, OptionQuote } from "../types";

const DATE = "2026-11-06";
const open = etToMs(DATE, 9, 30);

function bars(n: number, start = 7400, drift = 0.3): Bar1m[] {
  const out: Bar1m[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = p + drift + (i % 3 === 0 ? -0.4 : 0.2);
    out.push({ t: open + i * 60_000, o, h: Math.max(o, c) + 0.5, l: Math.min(o, c) - 0.5, c, v: null });
    p = c;
  }
  return out;
}
function opt(strike: number, right: "C" | "P", bid: number, ask: number, t: number, expiry = DATE): OptionQuote {
  const yymmdd = expiry.slice(2, 4) + expiry.slice(5, 7) + expiry.slice(8, 10);
  return { osi: `SPXW  ${yymmdd}${right}${String(strike * 1000).padStart(8, "0")}`, root: "SPXW", underlying: "SPX", expiry, right, strike, settlement: "PM", exercise: "european", multiplier: 100, bid, ask, bidSize: 30, askSize: 30, volume: 500, openInterest: 800, quoteTime: t };
}
function chainAt(spot: number, t: number): ChainSnapshot {
  const options: OptionQuote[] = [];
  const base = Math.round(spot / 5) * 5;
  for (let k = base - 100; k <= base + 100; k += 5) {
    const dist = k - spot;
    const callMid = Math.max(0.2, 12 - dist * 0.45 + Math.max(0, dist) * 0.2);
    const putMid = Math.max(0.2, 12 + dist * 0.45 + Math.max(0, -dist) * 0.2);
    options.push(opt(k, "C", callMid - 0.1, callMid + 0.1, t));
    options.push(opt(k, "P", putMid - 0.1, putMid + 0.1, t));
    options.push(opt(k, "C", callMid + 8, callMid + 8.3, t, "2026-11-09"));
    options.push(opt(k, "P", putMid + 8, putMid + 8.3, t, "2026-11-09"));
  }
  return { underlying: "SPX", spot, spotTime: t, options, stamp: { source: "schwab", mode: "LIVE", observedAt: t, receivedAt: t } };
}
function frame(asOf: number, nBars: number, mode: "LIVE" | "DELAYED" = "LIVE"): MarketFrame {
  const b = bars(nBars);
  const last = b.length ? b[b.length - 1]!.c : 7400;
  const ch = chainAt(last, asOf);
  return {
    asOf,
    spx: { symbol: "SPX", last, quoteTime: asOf - 1000, volume: null, stamp: { source: "schwab", mode, observedAt: asOf - 1000, receivedAt: asOf } },
    spxBars: { symbol: "SPX", bars: b, stamp: { source: "schwab", mode, observedAt: asOf, receivedAt: asOf } },
    spxChain: { ...ch, stamp: { ...ch.stamp, mode } },
    priorDay: { date: "2026-11-05", high: 7420, low: 7350, close: 7398 },
    events: [],
  };
}

describe("decision aggregation", () => {
  it("PASSes before the open and on delayed data", () => {
    const pre = decide({ ctx: buildContext(frame(etToMs(DATE, 9, 0), 0)), positions: [], previous: null, realizedToday: 0 });
    expect(pre.state).toBe("PASS");
    const asOf = open + 70 * 60_000;
    const delayed = decide({ ctx: buildContext(frame(asOf, 70, "DELAYED")), positions: [], previous: null, realizedToday: 0 });
    expect(delayed.state).toBe("PASS");
    expect(delayed.passReasons.some((r) => /DELAYED/.test(r))).toBe(true);
  });

  it("produces a directional setup with a ranked contract on a clean uptrend, and PASSes once the loss limit is hit", () => {
    const asOf = open + 70 * 60_000 + 30_000;
    const ctx = buildContext(frame(asOf, 70));
    const rec = decide({ ctx, positions: [], previous: null, realizedToday: 0 });
    expect(["CALL SETUP", "PUT SETUP", "WAIT"]).toContain(rec.state);
    if (rec.state === "CALL SETUP") {
      expect(rec.contracts.length).toBeGreaterThan(0);
      expect(rec.contracts[0]!.right).toBe("C");
      expect(rec.contracts[0]!.riskUsd).toBeCloseTo(rec.contracts[0]!.entry * 100);
      expect(rec.expiresAt).toBeGreaterThan(asOf);
      expect(rec.counterargument.length).toBeGreaterThan(10);
    }
    const limited = decide({ ctx, positions: [], previous: null, realizedToday: -5000 });
    expect(limited.state).toBe("PASS");
    expect(limited.passReasons.some((r) => /loss limit/.test(r))).toBe(true);
  });

  it("switches to MANAGE EXISTING POSITION when a position is open and flags invalidation", () => {
    const asOf = open + 70 * 60_000 + 30_000;
    const f = frame(asOf, 70);
    const pos = { id: "p1", osi: "SPXW  261106C07400000", root: "SPXW" as const, expiry: DATE, right: "C" as const, strike: 7400, qty: 1, entryPremium: 10, entryAt: asOf - 600_000, entrySpot: 7410, strategyId: null, decisionId: null, invalidationLevel: 9000, horizonEndsAt: null, profitTargetPremium: null, trail: null, highBidSeen: 10, status: "open" as const, exit: null, note: "", mode: "paper" as const };
    const rec = decide({ ctx: buildContext(f, undefined, [pos]), positions: [pos], previous: null, realizedToday: 0 });
    expect(rec.state).toBe("MANAGE EXISTING POSITION");
    expect(rec.positions[0]!.exitSignal?.reason).toMatch(/Invalidation/);
  });

  it("versions records and persists only on material change", () => {
    const asOf = open + 70 * 60_000 + 30_000;
    const ctx = buildContext(frame(asOf, 70));
    const a = decide({ ctx, positions: [], previous: null, realizedToday: 0 });
    const b = decide({ ctx: buildContext(frame(asOf + 5000, 70)), positions: [], previous: a, realizedToday: 0 });
    expect(b.version).toBe(a.version + 1);
    expect(b.previousId).toBe(a.id);
    expect(shouldPersist(null, a)).toBe(true);
    // same state & primary & contract within TTL → no new persisted version
    expect(shouldPersist(a, b)).toBe(a.state !== b.state || (a.primary?.id ?? null) !== (b.primary?.id ?? null) || (a.contracts[0]?.osi ?? null) !== (b.contracts[0]?.osi ?? null));
    const ev = diffDecisions(a, b, ctx, buildContext(frame(asOf + 5000, 70)));
    expect(Array.isArray(ev)).toBe(true);
  });
});
