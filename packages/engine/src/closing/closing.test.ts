import { describe, expect, it } from "vitest";
import { assessClosingWindow, subWindowFor, DEFAULT_CLOSING_SETTINGS } from "./strikeFlip";
import { sessionClock } from "../time/session";
import { etToMs } from "../time/et";
import type { ChainSnapshot, OptionQuote, IndexQuote } from "../types";
import type { PricePoint } from "../features/levels";

const DATE = "2026-11-06";
function at(h: number, m: number, s = 0) {
  return etToMs(DATE, h, m, s);
}
function stamp(t: number, mode: "LIVE" | "DELAYED" = "LIVE") {
  return { source: "schwab" as const, mode, observedAt: t, receivedAt: t };
}
function opt(strike: number, right: "C" | "P", bid: number, ask: number, t: number, root: "SPXW" | "SPX" | "SPXO" = "SPXW", expiry = DATE): OptionQuote {
  const yymmdd = expiry.slice(2, 4) + expiry.slice(5, 7) + expiry.slice(8, 10);
  return {
    osi: `${root.padEnd(6)}${yymmdd}${right}${String(strike * 1000).padStart(8, "0")}`,
    root,
    underlying: "SPX",
    expiry,
    right,
    strike,
    settlement: root === "SPXW" ? "PM" : "AM",
    exercise: "european",
    multiplier: 100,
    bid,
    ask,
    bidSize: 20,
    askSize: 20,
    volume: 100,
    openInterest: 100,
    quoteTime: t,
  };
}
/** Chain around spot with roughly fair 0DTE quotes for ~sigma points remaining. */
function chain(spot: number, t: number, sigma: number, mode: "LIVE" | "DELAYED" = "LIVE"): ChainSnapshot {
  const options: OptionQuote[] = [];
  const base = Math.round(spot / 5) * 5;
  for (let k = base - 30; k <= base + 30; k += 5) {
    // crude normal expected-intrinsic fair values
    const d = (spot - k) / sigma;
    const pdf = Math.exp((-d * d) / 2) / Math.sqrt(2 * Math.PI);
    const cdf = 0.5 * (1 + erf(d / Math.SQRT2));
    const call = (spot - k) * cdf + sigma * pdf;
    const put = call - (spot - k);
    options.push(opt(k, "C", Math.max(0, call - 0.1), call + 0.1, t));
    options.push(opt(k, "P", Math.max(0, put - 0.1), put + 0.1, t));
  }
  return { underlying: "SPX", spot, spotTime: t, options, stamp: stamp(t, mode) };
}
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function path(points: Array<[number, number]>): PricePoint[] {
  return points.map(([t, p]) => ({ t, p }));
}
function quote(spot: number, t: number): IndexQuote {
  return { symbol: "SPX", last: spot, quoteTime: t, volume: null, stamp: stamp(t) };
}

describe("closing window sub-windows", () => {
  it("maps minutes-to-close to windows on a regular day and an early close", () => {
    expect(subWindowFor(sessionClock(at(15, 40)))).toBe("pre");
    expect(subWindowFor(sessionClock(at(15, 50)))).toBe("3:50-3:55");
    expect(subWindowFor(sessionClock(at(15, 55)))).toBe("3:55-3:58");
    expect(subWindowFor(sessionClock(at(15, 58)))).toBe("3:58-3:59");
    expect(subWindowFor(sessionClock(at(15, 59, 30)))).toBe("3:59-4:00");
    expect(subWindowFor(sessionClock(at(16, 0)))).toBe("closed");
    expect(subWindowFor(sessionClock(etToMs("2026-11-27", 12, 52)))).toBe("3:50-3:55");
  });
});

describe("closing window assessment", () => {
  it("PASSes in the final minute even with a clean break-and-hold", () => {
    const t = at(15, 59, 20);
    const pts = path([[t - 600_000, 7395], [t - 300_000, 7398], [t - 120_000, 7401], [t - 60_000, 7403], [t - 10_000, 7404]]);
    const a = assessClosingWindow({ clock: sessionClock(t), spx: quote(7404, t), spy: null, es: null, path: pts, spyPath: [], esPath: [], chain: chain(7404, t, 2), mode: "LIVE" });
    expect(a.subWindow).toBe("3:59-4:00");
    expect(a.recommendation.state).toBe("PASS");
    expect(a.passReasons.join(" ")).toMatch(/final minute/i);
    const row = a.ladder.find((r) => r.strike === 7400)!;
    expect(row.call?.feasibility.hold).toBe("blocked");
  });

  it("PASSes on DELAYED data regardless of pattern", () => {
    const t = at(15, 52);
    const pts = path([[t - 600_000, 7395], [t - 240_000, 7401], [t - 120_000, 7403], [t - 30_000, 7404]]);
    const a = assessClosingWindow({ clock: sessionClock(t), spx: { ...quote(7404, t), stamp: stamp(t, "DELAYED") }, spy: null, es: null, path: pts, spyPath: [], esPath: [], chain: chain(7404, t, 2, "DELAYED"), mode: "DELAYED" });
    expect(a.recommendation.state).toBe("PASS");
    expect(a.passReasons.some((r) => /DELAYED/.test(r))).toBe(true);
  });

  it("PASSes when the SPX quote is stale", () => {
    const t = at(15, 52);
    const a = assessClosingWindow({ clock: sessionClock(t), spx: quote(7404, t - 30_000), spy: null, es: null, path: path([[t - 30_000, 7404]]), spyPath: [], esPath: [], chain: chain(7404, t, 2), mode: "LIVE" });
    expect(a.recommendation.state).toBe("PASS");
    expect(a.passReasons.some((r) => /quote is/.test(r))).toBe(true);
  });

  it("recognises a break-and-hold above a strike and marks resale feasible at 3:51", () => {
    const t = at(15, 51);
    // crossed above 7400 three minutes ago and held
    const pts = path([[t - 600_000, 7394], [t - 400_000, 7397], [t - 200_000, 7399], [t - 180_000, 7401.5], [t - 120_000, 7403], [t - 60_000, 7404], [t - 5_000, 7405]]);
    const a = assessClosingWindow({ clock: sessionClock(t), spx: quote(7405, t), spy: null, es: null, path: pts, spyPath: [], esPath: [], chain: chain(7405, t, 2.5), mode: "LIVE", settings: { minEdgePts: -10, maxPremiumUsd: 2000 } });
    const row = a.ladder.find((r) => r.strike === 7400)!;
    expect(row.pattern).toBe("break-hold");
    expect(row.bias).toBe("call");
    expect(row.call?.feasibility.resale).toBe("ok");
    expect(row.call?.feasibility.hold).toBe("ok");
    // the per-contract budget blocks contracts whose ask × 100 exceeds it
    const tight = assessClosingWindow({ clock: sessionClock(t), spx: quote(7405, t), spy: null, es: null, path: pts, spyPath: [], esPath: [], chain: chain(7405, t, 2.5), mode: "LIVE", settings: { minEdgePts: -10, maxPremiumUsd: 100 } });
    const itm = tight.ladder.find((r) => r.strike === 7400)!.call!;
    expect(itm.ask * 100).toBeGreaterThan(100);
    expect(itm.feasibility.hold).toBe("blocked");
    expect(itm.feasibility.reasons.some((x) => /budget/.test(x))).toBe(true);
    expect(a.eligibleExpiry).toBe(DATE);
    expect(["CALL SETUP", "WAIT"]).toContain(a.recommendation.state);
    if (a.recommendation.state === "CALL SETUP") {
      expect(a.recommendation.mode).toBe("resale");
      expect(a.recommendation.contract?.right).toBe("C");
    }
  });

  it("does not treat AM-settled roots as eligible and only PM SPXW counts", () => {
    const t = at(15, 52);
    const c = chain(7404, t, 2);
    const amOnly: ChainSnapshot = { ...c, options: c.options.map((o) => ({ ...o, root: "SPXO", settlement: "AM" })) };
    const a = assessClosingWindow({ clock: sessionClock(t), spx: quote(7404, t), spy: null, es: null, path: path([[t - 300_000, 7400], [t - 10_000, 7404]]), spyPath: [], esPath: [], chain: amOnly, mode: "LIVE" });
    expect(a.eligibleExpiry).toBeNull();
    expect(a.recommendation.state).toBe("PASS");
  });

  it("does not flip direction within 90 s of a setup unless the new side has a clear P(ITM) margin", () => {
    const t = at(15, 51);
    const pts = path([[t - 600_000, 7394], [t - 400_000, 7397], [t - 200_000, 7399], [t - 180_000, 7401.5], [t - 120_000, 7403], [t - 60_000, 7404], [t - 5_000, 7405]]);
    const inputs = { clock: sessionClock(t), spx: quote(7405, t), spy: null, es: null, path: pts, spyPath: [], esPath: [], chain: chain(7405, t, 2.5), mode: "LIVE" as const, settings: { minEdgePts: -10, maxPremiumUsd: 2000 } };
    const base = assessClosingWindow(inputs);
    expect(base.recommendation.state).toBe("CALL SETUP");
    // a put setup at 7400 issued 30 s ago: the flip to a call is allowed only with a clear P(ITM) margin over the put side
    const clear = assessClosingWindow({ ...inputs, previous: { direction: "put", strike: 7400, asOf: t - 30_000 } });
    expect(clear.recommendation.state).toBe("CALL SETUP");
    // when both sides have candidates and the model cannot separate them, there is no side (conflict rule)
    const conflict = assessClosingWindow({ ...inputs, settings: { ...inputs.settings, minSideMargin: 1 } });
    expect(conflict.recommendation.state).toBe("WAIT");
    expect(conflict.recommendation.rationale.join(" ")).toMatch(/Opposite biases with no clear side/);
    // spot just through 7405 (no put bias anywhere): a call setup is fine on its own, but a flip against a put setup
    // issued 30 s ago is suppressed because the old side has no candidate to measure a margin against
    const pts2 = path([[t - 600_000, 7394], [t - 400_000, 7397], [t - 200_000, 7399], [t - 180_000, 7401.5], [t - 120_000, 7403], [t - 60_000, 7404], [t - 5_000, 7407]]);
    const inputs2 = { ...inputs, spx: quote(7407, t), path: pts2, chain: chain(7407, t, 2.5) };
    const base2 = assessClosingWindow(inputs2);
    expect(base2.ladder.some((r) => r.bias === "put")).toBe(false);
    expect(base2.recommendation.state).toBe("CALL SETUP");
    const flipped = assessClosingWindow({ ...inputs2, previous: { direction: "put", strike: 7400, asOf: t - 30_000 } });
    expect(flipped.recommendation.state).toBe("WAIT");
    expect(flipped.recommendation.rationale.join(" ")).toMatch(/flipped against the put setup at 7400/);
    // a setup from well outside the suppression window does not constrain the decision
    const old = assessClosingWindow({ ...inputs, previous: { direction: "put", strike: 7400, asOf: t - 200_000 } });
    expect(old.recommendation.state).toBe(base.recommendation.state);
    // the same side and strike issued moments ago never suppresses (it widens the gate instead)
    const same = assessClosingWindow({ ...inputs, previous: { direction: "call", strike: 7400, asOf: t - 30_000 } });
    expect(same.recommendation.state).toBe(base.recommendation.state);
  });

  it("hold-to-settlement only recommends the option at the pattern strike with P(ITM) ≥ 50%", () => {
    const t = at(15, 58, 30);
    const pts = path([[t - 600_000, 7394], [t - 400_000, 7397], [t - 200_000, 7399], [t - 180_000, 7401.5], [t - 120_000, 7402], [t - 60_000, 7402.5], [t - 5_000, 7402]]);
    const a = assessClosingWindow({ clock: sessionClock(t), spx: quote(7402, t), spy: null, es: null, path: pts, spyPath: [], esPath: [], chain: chain(7402, t, 1.5), mode: "LIVE", settings: { minEdgePts: -10, maxPremiumUsd: 2000 } });
    expect(a.subWindow).toBe("3:58-3:59");
    expect(a.recommendation.state).toBe("CALL SETUP");
    expect(a.recommendation.mode).toBe("hold-to-settlement");
    const K = a.recommendation.contract!.strike;
    // the recommended option sits at a strike that itself carries the call bias (in the money), never the OTM neighbour
    expect(K).toBeLessThanOrEqual(7402);
    expect(a.ladder.find((r) => r.strike === K)!.bias).toBe("call");
    expect(a.recommendation.contract!.pItm).toBeGreaterThanOrEqual(0.5);
  });

  it("flags pinning when the strike has been crossed repeatedly", () => {
    const t = at(15, 53);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 12; i++) pts.push([t - 600_000 + i * 50_000, 7400 + (i % 2 ? 1.5 : -1.5)]);
    const a = assessClosingWindow({ clock: sessionClock(t), spx: quote(7401.5, t), spy: null, es: null, path: path(pts), spyPath: [], esPath: [], chain: chain(7401.5, t, 2), mode: "LIVE" });
    expect(a.ladder.find((r) => r.strike === 7400)!.pattern).toBe("pinning");
  });

  it("settlement scenarios use intrinsic minus premium minus one side of costs", () => {
    const t = at(15, 52);
    const a = assessClosingWindow({ clock: sessionClock(t), spx: quote(7404, t), spy: null, es: null, path: path([[t - 300_000, 7400], [t - 10_000, 7404]]), spyPath: [], esPath: [], chain: chain(7404, t, 2), mode: "LIVE" });
    const q = a.ladder.find((r) => r.strike === 7400)!.call!;
    const flat = q.settlementScenarios[2]!;
    expect(flat.settle).toBeCloseTo(7404);
    expect(flat.pnl).toBeCloseTo(100 * (4 - q.ask) - (DEFAULT_CLOSING_SETTINGS.costs.commissionPerContract + DEFAULT_CLOSING_SETTINGS.costs.feesPerContract), 6);
  });
});
