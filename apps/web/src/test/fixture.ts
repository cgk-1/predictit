/**
 * Deterministic synthetic market data run through the REAL engine (buildContext + decide) to produce a
 * ServerState for render tests and local previews. Prices are a seeded random walk; nothing here is market data.
 */
import {
  addDays,
  bsPrice,
  buildContext,
  decide,
  DEFAULT_CLOSING_SETTINGS,
  DEFAULT_SETTINGS,
  etToMs,
  expiryInstantMs,
  formatOsi,
  markPosition,
  newPaperPosition,
  sessionClock,
  yearsToExpiry,
  type Bar1m,
  type ChainSnapshot,
  type DecisionRecord,
  type IndexQuote,
  type MarketFrame,
  type OptionQuote,
  type PaperPosition,
  type SourceStamp,
} from "@predictit/engine";
import type { AppSettings, ServerState } from "../api/types";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sessionBars(date: string, untilMs: number, start: number, rnd: () => number, vol: number): Bar1m[] {
  const open = etToMs(date, 9, 30);
  const close = etToMs(date, 16, 0);
  const out: Bar1m[] = [];
  let p = start;
  for (let t = open; t < close && t + 60_000 <= untilMs; t += 60_000) {
    const o = p;
    const c = o + gauss(rnd) * vol;
    const h = Math.max(o, c) + Math.abs(gauss(rnd)) * vol * 0.5;
    const l = Math.min(o, c) - Math.abs(gauss(rnd)) * vol * 0.5;
    out.push({ t, o, h, l, c, v: null, callsVol: Math.round(500 + rnd() * 900), putsVol: Math.round(500 + rnd() * 900) });
    p = c;
  }
  return out;
}

export interface Fixture {
  asOf: number;
  frame: MarketFrame;
  settings: AppSettings;
  decision: DecisionRecord;
  state: ServerState;
}

export function syntheticFixture(date = "2026-11-06", hour = 11, minute = 5, opts: { seed?: number; spot?: number; withPosition?: boolean } = {}): Fixture {
  const asOf = etToMs(date, hour, minute, 0);
  const rnd = lcg(opts.seed ?? 42);
  const base = opts.spot ?? 6000;
  const prevDate = addDays(date, -1);
  const prevBars = sessionBars(prevDate, etToMs(prevDate, 16, 0), base - 18, rnd, 1.1);
  const prevClose = prevBars[prevBars.length - 1]?.c ?? base;
  const todayBars = sessionBars(date, asOf, prevClose + 6, rnd, 1.3);
  const spot = (todayBars[todayBars.length - 1]?.c ?? prevClose) + 0.4;
  const stamp = (observedAt: number): SourceStamp => ({ source: "schwab", mode: "LIVE", observedAt, receivedAt: observedAt + 400 });
  const spx: IndexQuote = { symbol: "SPX", last: spot, quoteTime: asOf - 1500, volume: null, open: todayBars[0]?.o, high: Math.max(...todayBars.map((b) => b.h), spot), low: Math.min(...todayBars.map((b) => b.l), spot), prevClose, stamp: stamp(asOf - 1500) };
  const spy: IndexQuote = { symbol: "SPY", last: spot / 10.03, bid: spot / 10.03 - 0.01, ask: spot / 10.03 + 0.01, quoteTime: asOf - 1200, volume: 31_000_000, stamp: stamp(asOf - 1200) };

  const expiries = [date, addDays(date, 3), addDays(date, 7)];
  const options: OptionQuote[] = [];
  const k0 = Math.round(spot / 5) * 5;
  for (const expiry of expiries) {
    const T = yearsToExpiry(asOf, expiryInstantMs("SPXW", expiry), "trading");
    for (let k = k0 - 300; k <= k0 + 300; k += 5) {
      for (const right of ["C", "P"] as const) {
        const m = k / spot - 1;
        const sigma = 0.14 + Math.max(0, -m) * 1.4 + Math.max(0, m) * 0.5;
        const fair = bsPrice(right, { S: spot, K: k, T, sigma, r: 0.04, q: 0.012 });
        const half = Math.max(0.05, fair * 0.02 + 0.05);
        const bid = Math.max(0, Math.round((fair - half) * 20) / 20);
        const ask = Math.max(0.05, Math.round((fair + half) * 20) / 20);
        const round = k % 50 === 0 ? 4 : k % 25 === 0 ? 2 : 1;
        const near = Math.exp(-Math.abs(m) * 60);
        options.push({
          osi: formatOsi("SPXW", expiry, right, k),
          root: "SPXW",
          underlying: "SPX",
          expiry,
          right,
          strike: k,
          settlement: "PM",
          exercise: "european",
          multiplier: 100,
          bid,
          ask,
          bidSize: 10 + Math.round(rnd() * 40),
          askSize: 10 + Math.round(rnd() * 40),
          volume: Math.round(near * 4000 * rnd()),
          openInterest: Math.round(near * 9000 * round * (expiry === date ? 0.6 : 1) + rnd() * 200),
          quoteTime: asOf - 900,
        });
      }
    }
  }
  const chain: ChainSnapshot = { underlying: "SPX", spot, spotTime: asOf - 1500, options, stamp: stamp(asOf - 900) };
  const frame: MarketFrame = {
    asOf,
    spx,
    spy,
    spxBars: { symbol: "SPX", bars: [...prevBars, ...todayBars], stamp: stamp(asOf - 2000) },
    spyBars: { symbol: "SPY", bars: todayBars.map((b) => ({ ...b, o: b.o / 10.03, h: b.h / 10.03, l: b.l / 10.03, c: b.c / 10.03, v: 200_000 })), stamp: stamp(asOf - 2000) },
    spxChain: chain,
    priorDay: { date: prevDate, high: Math.max(...prevBars.map((b) => b.h)), low: Math.min(...prevBars.map((b) => b.l)), close: prevClose },
    events: [{ at: etToMs(date, 14, 0), label: "FOMC statement", severity: "high" }],
  };
  const settings: AppSettings = { engine: { ...DEFAULT_SETTINGS, feesPerContract: 0.7 }, closing: DEFAULT_CLOSING_SETTINGS, events: frame.events ?? [], maxOpenRiskUsd: 3000, pollSec: { live: 5, delayed: 60, idle: 300 }, retentionDays: 7, archiveCboe: false };
  const positions: PaperPosition[] = [];
  if (opts.withPosition) {
    const q = options.find((o) => o.expiry === date && o.right === "C" && o.strike === k0 + 10)!;
    positions.push(newPaperPosition({ osi: q.osi, root: q.root, expiry: q.expiry, right: q.right, strike: q.strike, qty: 1, entryPremium: q.ask + 0.3, entryAt: asOf - 25 * 60_000, entrySpot: spot - 4, strategyId: "orb", decisionId: null, invalidationLevel: spot - 12, horizonEndsAt: asOf + 20 * 60_000, profitTargetPremium: q.ask * 1.6, trail: null, note: "fixture", mode: "paper" }, "fx"));
  }
  const ctx = buildContext(frame, settings.engine, positions);
  const decision = decide({ ctx, positions, previous: null, realizedToday: 0 });
  const marks = positions.map((p) => markPosition(p, chain, spot, asOf));
  const state: ServerState = {
    serverTime: asOf,
    clock: sessionClock(asOf),
    mode: ctx.mode,
    feeds: {
      schwab: { source: "schwab", lastOkAt: asOf - 2100, lastErrorAt: null, lastError: null, lastLatencyMs: 143, consecutiveErrors: 0 },
      "cboe-delayed": { source: "cboe-delayed", lastOkAt: asOf - 61_000, lastErrorAt: asOf - 3_600_000, lastError: "HTTP 503", lastLatencyMs: 820, consecutiveErrors: 0 },
    },
    schwab: { configured: true, credentialSource: "env", connected: true, accessExpiresAt: asOf + 25 * 60_000, refreshExpiresAt: asOf + 5 * 86_400_000, lastRefreshAt: asOf - 5 * 60_000, lastError: null },
    lastTick: { at: asOf - 1200, durationMs: 212, mode: ctx.mode },
    tickStats: { n: 311, avgMs: 198 },
    spx,
    spy,
    decision,
    decisionAgeMs: 0,
    regime: ctx.regime,
    levels: ctx.levels,
    bars: ctx.spxBars,
    chainFeatures: ctx.spxChain,
    gex: ctx.gex ? { ...ctx.gex, byStrike: ctx.gex.byStrike.filter((r) => Math.abs(r.strike / ctx.gex!.spot - 1) <= 0.05) } : null,
    closing: decision.closing,
    positions: positions.map((p) => ({ position: p, mark: marks.find((m) => m.id === p.id) ?? null })),
    realizedToday: -42.6,
    changes: [
      { at: asOf - 40 * 60_000, kind: "state", text: `10:25 Engine started: WAIT (LIVE).` },
      { at: asOf - 12 * 60_000, kind: "level", text: `10:53 SPX crossed Opening range high (30m) ${(spot - 3).toFixed(1)} (above).` },
      { at: asOf - 3 * 60_000, kind: "setup", text: `11:02 New setup: Opening-range breakout / failure (call) forming.` },
    ],
    settings,
    notes: ctx.notes,
    evaluatedAt: asOf,
  };
  return { asOf, frame, settings, decision, state };
}
