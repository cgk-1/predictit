import { describe, expect, it } from "vitest";
import { INDICATORS, initialWeights, makePredictions, scorePredictions, leanStats, wilson, computeLean, DEFAULT_ENSEMBLE_CONFIG } from "./ensemble";
import { buildContext } from "../decisions/context";
import { etToMs } from "../time/et";
import type { MarketFrame, Bar1m } from "../types";

const DATE = "2026-11-06";
const open = etToMs(DATE, 9, 30);
function bars(n: number, drift: number): Bar1m[] {
  const out: Bar1m[] = [];
  let p = 7400;
  for (let i = 0; i < n; i++) {
    const c = p + drift;
    out.push({ t: open + i * 60_000, o: p, h: Math.max(p, c) + 0.4, l: Math.min(p, c) - 0.4, c, v: null });
    p = c;
  }
  return out;
}
function frame(asOf: number, drift: number): MarketFrame {
  const b = bars(Math.floor((asOf - open) / 60_000), drift);
  const last = b[b.length - 1]!.c;
  return { asOf, spx: { symbol: "SPX", last, quoteTime: asOf, volume: null, stamp: { source: "schwab", mode: "LIVE", observedAt: asOf, receivedAt: asOf } }, spxBars: { symbol: "SPX", bars: b, stamp: { source: "schwab", mode: "LIVE", observedAt: asOf, receivedAt: asOf } }, events: [] };
}

describe("ensemble lean", () => {
  it("leans UP on a steady uptrend and DOWN on a downtrend, with contributions listed", () => {
    const up = computeLean(buildContext(frame(open + 90 * 60_000, 0.5)), null, initialWeights(0));
    const dn = computeLean(buildContext(frame(open + 90 * 60_000, -0.5)), null, initialWeights(0));
    expect(up.direction).toBe("UP");
    expect(dn.direction).toBe("DOWN");
    expect(up.available).toBeGreaterThan(5);
    expect(up.top.length).toBeGreaterThan(0);
    expect(up.validation).toBe("unvalidated");
    expect(up.weightsMode).toBe("prior (burn-in)");
    for (const v of up.votes) expect(v.vote === null || (v.vote >= -1 && v.vote <= 1)).toBe(true);
  });

  it("updates weights by a bounded amount: right → up, wrong → down, clamped, never beyond multipliers", () => {
    const w0 = initialWeights(0);
    const preds = makePredictions({ asOf: 1_000_000, weightsMode: "prior (burn-in)", score: 0.6, direction: "UP", strength: "strong", agreement: 1, available: 2, votes: [{ id: "mom15", vote: 1, reason: "", weight: 0.8, contribution: 0.8, label: "", family: "momentum", evidence: "B" }, { id: "rangeLoc", vote: -1, reason: "", weight: 0.6, contribution: -0.6, label: "", family: "mean-reversion", evidence: "C" }], top: [], against: [], validation: "unvalidated" }, 7400);
    expect(preds.length).toBe(DEFAULT_ENSEMBLE_CONFIG.horizonsMin.length);
    const due = preds[0]!.dueAt;
    const path = [{ t: due + 1000, p: 7410 }]; // went up: mom15 right, rangeLoc wrong
    const r = scorePredictions(preds, path, due + 2000, w0);
    expect(r.scored.length).toBe(1); // only the 15m one is due
    expect(r.pending.length).toBe(1);
    expect(r.weights.w["mom15"]!).toBeGreaterThan(w0.w["mom15"]!);
    expect(r.weights.w["rangeLoc"]!).toBeLessThan(w0.w["rangeLoc"]!);
    // "not too much": a single update moves a weight by less than 5%
    expect(Math.abs(r.weights.w["mom15"]! / w0.w["mom15"]! - 1)).toBeLessThan(0.05);
    expect(r.scored[0]!.hit).toBe(true);
    // hammer 500 wrong outcomes: weight floors at minMult × prior, never below
    let w = r.weights;
    for (let i = 0; i < 500; i++) {
      const p = makePredictions({ asOf: 2_000_000 + i * 60_000, weightsMode: "prior (burn-in)", score: 0.6, direction: "UP", strength: "strong", agreement: 1, available: 1, votes: [{ id: "mom15", vote: 1, reason: "", weight: 1, contribution: 1, label: "", family: "momentum", evidence: "B" }], top: [], against: [], validation: "unvalidated" }, 7400)[0]!;
      w = scorePredictions([p], [{ t: p.dueAt + 1000, p: 7390 }], p.dueAt + 2000, w).weights;
    }
    const spec = INDICATORS.find((i) => i.id === "mom15")!;
    expect(w.w["mom15"]!).toBeGreaterThanOrEqual(DEFAULT_ENSEMBLE_CONFIG.minMult * spec.priorWeight - 1e-9);
    expect(w.w["mom15"]!).toBeLessThan(spec.priorWeight);
    const st = leanStats(w);
    expect(st.horizons["15m"]!.n).toBe(501);
    expect(st.calibratedProbabilityAvailable).toBe(true);
    expect(st.indicators.find((i) => i.id === "mom15")!.hitRate!).toBeLessThan(0.01);
  });

  it("treats flat outcomes as no-update and keeps pending until data arrives", () => {
    const w0 = initialWeights(0);
    const p = makePredictions({ asOf: 5_000_000, weightsMode: "prior (burn-in)", score: 0.3, direction: "UP", strength: "weak", agreement: 1, available: 1, votes: [{ id: "mom5", vote: 0.5, reason: "", weight: 0.6, contribution: 0.3, label: "", family: "momentum", evidence: "C" }], top: [], against: [], validation: "unvalidated" }, 7400)[0]!;
    const noData = scorePredictions([p], [], p.dueAt + 1000, w0);
    expect(noData.pending.length).toBe(1);
    const flat = scorePredictions([p], [{ t: p.dueAt + 1000, p: 7400.5 }], p.dueAt + 2000, w0);
    expect(flat.scored[0]!.outcome).toBe("flat");
    expect(flat.weights.w["mom5"]).toBe(w0.w["mom5"]);
    expect(leanStats(flat.weights).horizons["15m"]!.flat).toBe(1);
  });

  it("withholds calibrated probabilities until enough scored predictions exist", () => {
    const st = leanStats(initialWeights(0));
    expect(st.calibratedProbabilityAvailable).toBe(false);
    expect(st.note).toMatch(/withheld/);
    const w = wilson(60, 100);
    expect(w.p).toBeCloseTo(0.6);
    expect(w.lo).toBeLessThan(0.6);
    expect(w.hi).toBeGreaterThan(0.6);
  });
});
