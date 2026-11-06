import { describe, expect, it } from "vitest";
import { gradeDecision, summarizeGrades, familyTrust } from "./grading";
import { gradeClosingDecision, initialClosingLearner, updateClosingLearner, applyClosingLearning, DEFAULT_CLOSING_LEARN } from "../closing/learning";
import { tickFeatures } from "../features/tick";
import { DEFAULT_CLOSING_SETTINGS, type ClosingAssessment } from "../closing/strikeFlip";
import type { DecisionRecord } from "./decide";
import type { ChainSnapshot } from "../types";

function rec(asOf: number, state: "CALL SETUP" | "PUT SETUP", inval: number, horizon = 30): DecisionRecord {
  return {
    id: "d1", version: 1, previousId: null, asOf, expiresAt: asOf + 60000, date: "2026-11-06", phase: "morning", mode: "LIVE", state,
    primary: { id: "x", family: "orb", name: "ORB", direction: state === "CALL SETUP" ? "call" : "put", lifecycle: "triggered", evidence: [], triggerCondition: "", entryZone: null, invalidationLevel: inval, invalidationText: "", targetLevel: null, horizonMinutes: horizon, exitRules: [], preferredExpiry: "0DTE", counterargument: "", dataNotes: [], expiresAt: asOf + 60000, priority: 1, validation: "unvalidated" },
    contracts: [{ instrument: "SPX", withinBudget: true, osi: "SPXW  261106C07400000", root: "SPXW", expiry: "2026-11-06", right: "C", strike: 7400, is0dte: true, bid: 1.8, ask: 2.0, spread: 0.2, spreadPct: 0.1, bidSize: 10, askSize: 10, quoteAgeMs: 0, entry: 2.0, riskUsd: 200, iv: 0.2, delta: 0.4, gamma: 0.01, thetaPerMin: -0.01, breakevenAtExpiry: 7402, atTarget: null, atFlat: { exit: 1.5, ret: -0.25 }, atInvalidation: { exit: 0.5, ret: -0.75 }, rewardRisk: null, breakevenWinRate: null, eligible: true, reasons: [], tradeoff: "" }],
    rankingNotes: [], rankingAssumptions: [], candidates: [], waits: [], passReasons: [], whyWait: [], evidence: [], counterargument: "", regime: {} as any, dataNotes: [], positions: [], closing: null, lean: {} as any, summary: {} as any, inputsDigest: "x",
  };
}
function chainWith(bid: number, t: number): { receivedAt: number; chain: ChainSnapshot } {
  return { receivedAt: t, chain: { underlying: "SPX", spot: 7400, spotTime: t, options: [{ osi: "SPXW  261106C07400000", root: "SPXW", underlying: "SPX", expiry: "2026-11-06", right: "C", strike: 7400, settlement: "PM", exercise: "european", multiplier: 100, bid, ask: bid + 0.2, bidSize: 10, askSize: 10, volume: 1, openInterest: 1, quoteTime: t }], stamp: { source: "schwab", mode: "LIVE", observedAt: t, receivedAt: t } } };
}

describe("decision grading", () => {
  it("grades direction, invalidation-first exits and would-have returns at the horizon", () => {
    const t0 = 1_000_000_000;
    const r = rec(t0, "CALL SETUP", 7390);
    const path = [{ t: t0, p: 7400 }, { t: t0 + 10 * 60000, p: 7405 }, { t: t0 + 30 * 60000, p: 7412 }];
    const g = gradeDecision({ record: r, path, chains: [chainWith(2.0, t0), chainWith(3.1, t0 + 29 * 60000)], now: t0 + 31 * 60000 })!;
    expect(g.directionHit).toBe(true);
    expect(g.invalidated).toBe(false);
    expect(g.exitBid).toBe(3.1);
    expect(g.wouldHavePnlUsd).toBeCloseTo(100 * 1.1 - 1.5);
    expect(g.provisional).toBe(false);
    // not yet due
    expect(gradeDecision({ record: r, path, chains: [], now: t0 + 5 * 60000 })).toBeNull();
    // invalidation first
    const path2 = [{ t: t0, p: 7400 }, { t: t0 + 5 * 60000, p: 7388 }, { t: t0 + 30 * 60000, p: 7420 }];
    const g2 = gradeDecision({ record: r, path: path2, chains: [chainWith(0.6, t0 + 5 * 60000), chainWith(5, t0 + 30 * 60000)], now: t0 + 31 * 60000 })!;
    expect(g2.invalidated).toBe(true);
    expect(g2.exitBid).toBe(0.6);
    expect(g2.wouldHavePnlUsd).toBeLessThan(0);
    const s = summarizeGrades([g, g2]);
    expect(s.n).toBe(2);
    expect(s.invalidationRate).toBe(0.5);
    expect(familyTrust(s)["orb"]).toBe(1); // below minN → neutral trust
  });
});

describe("closing-window learning", () => {
  const base: ClosingAssessment = {
    asOf: 0, subWindow: "3:50-3:55", secondsToClose: 540, spot: 7400, spotAgeMs: 0, mode: "LIVE", eligibleExpiry: "2026-11-06",
    remaining: { sec: 530, sigmaIvPts: 3, sigmaRvPts: 2.5, sigmaUsedPts: 3.5, straddleMid: 2.4, driftPts: 1.0 },
    ladder: [{ strike: 7400, side: "above", distance: 0, interaction: {} as any, approach: { speed1: 1, speed3: 1, accel: 0, etaSec: null }, pCloseAbove: 0.6, call: null, put: null, pattern: "break-hold", patternText: "", bias: "call" }],
    recommendation: { state: "CALL SETUP", direction: "call", strike: 7400, contract: { osi: "SPXW  261106C07400000", right: "C", strike: 7400, bid: 1.5, ask: 1.7, spread: 0.2, bidSize: 10, askSize: 10, quoteAgeMs: 0, breakevenSettle: 7401.7, requiredMovePts: 1.7, pItm: 0.55, fairNoDrift: 1.8, fairWithDrift: 2.2, edgeNoDrift: 0.1, edgeWithDrift: 0.5, settlementScenarios: [], feasibility: { resale: "ok", hold: "ok", reasons: [] } }, mode: "hold-to-settlement", entryCondition: "", invalidation: "", exitPlan: [], rationale: [], counterargument: "", expiresAt: 0, validation: "unvalidated" },
    passReasons: [], confirmation: { spy: "n/a", es: "n/a", text: "" }, notes: [],
  };
  it("grades settlement P&L and pattern hits; learns bounded parameters only after enough sessions", () => {
    const g = gradeClosingDecision("c1", base, 7406, true, 7405.2, DEFAULT_CLOSING_SETTINGS.costs);
    expect(g.settlePnlUsd).toBeCloseTo(100 * (6 - 1.7) - 1.35, 6);
    expect(g.biasHit).toBe(true);
    expect(g.z).toBeCloseTo(6 / 3.5, 6);
    expect(g.patternOutcomes[0]!.hit).toBe(true);
    let st = initialClosingLearner(0);
    st = updateClosingLearner(st, g, DEFAULT_CLOSING_SETTINGS);
    expect(st.n).toBe(1);
    expect(st.learned.seasonalityMultiplier).toBeNull(); // below minN
    // many large-z sessions → seasonality moves up but stays within bounds
    for (let k = 0; k < 40; k++) st = updateClosingLearner(st, gradeClosingDecision(`c${k}`, base, 7400 + (k % 2 ? 9 : -9), true, 7400 + (k % 2 ? 8 : -8), DEFAULT_CLOSING_SETTINGS.costs), DEFAULT_CLOSING_SETTINGS);
    const applied = applyClosingLearning(DEFAULT_CLOSING_SETTINGS, st);
    expect(applied.seasonalityMultiplier).toBeGreaterThan(DEFAULT_CLOSING_SETTINGS.seasonalityMultiplier);
    expect(applied.seasonalityMultiplier).toBeLessThanOrEqual(DEFAULT_CLOSING_LEARN.bounds.seasonality[1]);
    expect(applied.settlementNoisePts).toBeCloseTo(1.0, 1); // RMS gap of 1 pt, stepped toward
    expect(applied.driftPersistence).toBeGreaterThanOrEqual(0);
    expect(applied.driftPersistence).toBeLessThanOrEqual(1);
    expect(st.patterns["break-hold"]!.n).toBe(41);
    expect(applied.learnedFrom).toBe(41);
  });
});

describe("TICK features", () => {
  it("labels broad participation and exhaustion; n/a without data", () => {
    const t0 = 1_000_000_000;
    const bars = Array.from({ length: 12 }, (_, i) => ({ t: t0 + i * 60000, o: 300, h: 600, l: 100, c: 400, v: null }));
    const f = tickFeatures(bars, { last: 450, quoteTime: t0 + 12 * 60000 + 5000 }, t0 + 12 * 60000 + 6000);
    expect(f.label).toBe("broad-up");
    expect(f.avg10).toBe(400);
    const ex = tickFeatures(bars, { last: 1100, quoteTime: t0 + 12 * 60000 + 5000 }, t0 + 12 * 60000 + 6000);
    expect(ex.label).toBe("exhaustion-high");
    expect(tickFeatures(undefined, undefined, t0).label).toBe("n/a");
  });
});
