/**
 * Closing-window module (final ten minutes, SPX, PM-settled SPXW expiring today).
 *
 * "Strike flip" = the index crossing (or failing to cross) a listed strike into settlement, which flips the
 * expiring call/put at that strike between worthless and intrinsic. It is unrelated to the GEX "gamma flip"
 * (the spot level where modelled dealer gamma changes sign).
 *
 * Everything below is as-of safe; the recommendation is a hypothesis-driven decision aid, labelled
 * "unvalidated" until the replay harness says otherwise. The last displayed index tick is NOT the settlement:
 * settlement is computed from constituent closing-auction prices, so a settlement-noise term is added.
 */
import type { ChainSnapshot, DataQualityNote, IndexQuote, OptionQuote, Right } from "../types";
import { levelInteraction, type LevelInteraction, type PricePoint } from "../features/levels";
import { normCdf, normPdf } from "../pricing/bs";
import { isPmExpiringToday } from "../contracts/series";
import { breakevenWithCosts, DEFAULT_COSTS, perSideCost, type CostModel } from "../contracts/payoff";
import type { SessionClock } from "../time/session";
import { fmtEtTime } from "../time/et";

export type ClosingSubWindow = "pre" | "3:50-3:55" | "3:55-3:58" | "3:58-3:59" | "3:59-4:00" | "closed";

export interface ClosingSettings {
  strikeStep: number;
  ladderHalfWidth: number;
  /** seconds from decision to fill acknowledgement (order entry + routing) */
  entryDelaySec: number;
  /** minimum seconds remaining after entry for a resale attempt to be considered feasible */
  minResaleWindowSec: number;
  /** seconds before close after which no new entry is recommended */
  noNewEntrySec: number;
  maxSpreadPts: number;
  maxSpreadPct: number;
  minSize: number;
  maxQuoteAgeMs: number;
  /** multiplier applied to realized vol for the last-minutes variance seasonality (estimated from data; default conservative) */
  seasonalityMultiplier: number;
  /** standard deviation (points) of official settlement vs last tick (prospectively estimated) */
  settlementNoisePts: number;
  /** fraction of the recent speed assumed to persist (momentum hypothesis) when computing the drifted fair value */
  driftPersistence: number;
  /** minimum modelled edge (points) over the ask required to recommend */
  minEdgePts: number;
  costs: CostModel;
}

export const DEFAULT_CLOSING_SETTINGS: ClosingSettings = {
  strikeStep: 5,
  ladderHalfWidth: 4,
  entryDelaySec: 8,
  minResaleWindowSec: 120,
  noNewEntrySec: 60,
  maxSpreadPts: 0.4,
  maxSpreadPct: 0.3,
  minSize: 5,
  maxQuoteAgeMs: 5000,
  seasonalityMultiplier: 1.5,
  settlementNoisePts: 1.5,
  driftPersistence: 0.5,
  minEdgePts: 0.25,
  costs: { commissionPerContract: 0.65, feesPerContract: 0.7 },
};

export interface QuoteEval {
  osi: string;
  right: Right;
  strike: number;
  bid: number;
  ask: number;
  spread: number;
  bidSize: number;
  askSize: number;
  quoteAgeMs: number;
  breakevenSettle: number;
  requiredMovePts: number;
  pItm: number;
  fairNoDrift: number;
  fairWithDrift: number;
  edgeNoDrift: number;
  edgeWithDrift: number;
  /** P&L per contract at settlement for −2σ, −1σ, 0, +1σ, +2σ moves from spot */
  settlementScenarios: Array<{ move: number; settle: number; pnl: number }>;
  feasibility: { resale: "ok" | "risky" | "infeasible"; hold: "ok" | "blocked"; reasons: string[] };
}

export interface StrikeAnalysis {
  strike: number;
  side: "above" | "below" | "at";
  distance: number;
  interaction: LevelInteraction;
  approach: { speed1: number | null; speed3: number | null; accel: number | null; etaSec: number | null };
  pCloseAbove: number;
  call: QuoteEval | null;
  put: QuoteEval | null;
  pattern: "break-hold" | "failed-cross" | "reclaim" | "rejection" | "pinning" | "accelerating-toward" | "none";
  patternText: string;
  bias: "call" | "put" | null;
}

export interface ClosingRecommendation {
  state: "CALL SETUP" | "PUT SETUP" | "WAIT" | "PASS";
  direction: "call" | "put" | null;
  strike: number | null;
  contract: QuoteEval | null;
  mode: "resale" | "hold-to-settlement" | null;
  entryCondition: string;
  invalidation: string;
  exitPlan: string[];
  rationale: string[];
  counterargument: string;
  expiresAt: number;
  validation: "unvalidated";
}

export interface ClosingAssessment {
  asOf: number;
  subWindow: ClosingSubWindow;
  secondsToClose: number;
  spot: number;
  spotAgeMs: number;
  mode: "LIVE" | "DELAYED" | "REPLAY" | "NONE";
  eligibleExpiry: string | null;
  remaining: { sec: number; sigmaIvPts: number | null; sigmaRvPts: number | null; sigmaUsedPts: number; straddleMid: number | null; driftPts: number };
  ladder: StrikeAnalysis[];
  recommendation: ClosingRecommendation;
  passReasons: string[];
  confirmation: { spy: "confirms" | "diverges" | "n/a"; es: "confirms" | "diverges" | "n/a"; text: string };
  notes: DataQualityNote[];
}

export interface ClosingInputs {
  clock: SessionClock;
  spx: IndexQuote | null;
  spy: IndexQuote | null;
  es: IndexQuote | null;
  /** SPX price path (ticks or bar closes), t <= asOf */
  path: PricePoint[];
  spyPath: PricePoint[];
  esPath: PricePoint[];
  chain: ChainSnapshot | null;
  mode: ClosingAssessment["mode"];
  settings?: Partial<ClosingSettings>;
}

export function subWindowFor(clock: SessionClock): ClosingSubWindow {
  const m = clock.minutesToClose;
  if (!clock.session.isTradingDay || m <= 0) return "closed";
  if (m > 10) return "pre";
  if (m > 5) return "3:50-3:55";
  if (m > 2) return "3:55-3:58";
  if (m > 1) return "3:58-3:59";
  return "3:59-4:00";
}

function speedPtsPerMin(path: PricePoint[], asOf: number, minutes: number): number | null {
  const start = asOf - minutes * 60_000;
  const before = path.filter((p) => p.t <= start);
  const latest = path.filter((p) => p.t <= asOf);
  if (!before.length || !latest.length) return null;
  const a = before[before.length - 1]!;
  const b = latest[latest.length - 1]!;
  const dtMin = (b.t - a.t) / 60_000;
  return dtMin > 0 ? (b.p - a.p) / dtMin : null;
}

function realizedPtsPerSqrtMin(path: PricePoint[], asOf: number, minutes: number): number | null {
  // 1-minute sampled closes over the window
  const pts = path.filter((p) => p.t <= asOf && p.t >= asOf - minutes * 60_000);
  if (pts.length < 4) return null;
  const sampled: number[] = [];
  let lastMin = -1;
  for (const p of pts) {
    const m = Math.floor(p.t / 60_000);
    if (m !== lastMin) {
      sampled.push(p.p);
      lastMin = m;
    } else sampled[sampled.length - 1] = p.p;
  }
  if (sampled.length < 4) return null;
  const d: number[] = [];
  for (let i = 1; i < sampled.length; i++) d.push(sampled[i]! - sampled[i - 1]!);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const v = d.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, d.length - 1);
  return Math.sqrt(v);
}

/** E[max(S_T − K, 0)] for S_T ~ N(mu, sigma²) (Bachelier; appropriate for minutes-to-settlement). */
function expectedIntrinsic(right: Right, mu: number, sigma: number, K: number): number {
  if (sigma <= 0) return Math.max(0, right === "C" ? mu - K : K - mu);
  const d = (mu - K) / sigma;
  if (right === "C") return (mu - K) * normCdf(d) + sigma * normPdf(d);
  return (K - mu) * normCdf(-d) + sigma * normPdf(d);
}

export function assessClosingWindow(i: ClosingInputs): ClosingAssessment {
  const s: ClosingSettings = { ...DEFAULT_CLOSING_SETTINGS, ...(i.settings ?? {}) };
  const asOf = i.clock.now;
  const sub = subWindowFor(i.clock);
  const notes: DataQualityNote[] = [];
  const pass: string[] = [];
  const secondsToClose = Math.max(0, i.clock.secondsToClose);
  const spot = i.spx?.last ?? (i.path.length ? i.path[i.path.length - 1]!.p : NaN);
  const spotAgeMs = i.spx ? asOf - i.spx.quoteTime : Infinity;
  const today = i.clock.date;
  const eligible = i.chain?.options.find((o) => isPmExpiringToday(o.root, o.expiry, today) && o.underlying === "SPX")?.expiry ?? null;

  // remaining distribution
  const remainSec = Math.max(0, secondsToClose - s.entryDelaySec);
  const remainMin = remainSec / 60;
  let straddleMid: number | null = null;
  let sigmaIvPts: number | null = null;
  if (i.chain && eligible && Number.isFinite(spot)) {
    const todays = i.chain.options.filter((o) => o.expiry === eligible && o.settlement === "PM");
    const strikes = [...new Set(todays.map((o) => o.strike))];
    if (strikes.length) {
      const atm = strikes.reduce((a, b) => (Math.abs(b - spot) < Math.abs(a - spot) ? b : a));
      const c = todays.find((o) => o.strike === atm && o.right === "C");
      const p = todays.find((o) => o.strike === atm && o.right === "P");
      if (c && p && c.bid > 0 && p.bid > 0) {
        straddleMid = (c.bid + c.ask) / 2 + (p.bid + p.ask) / 2;
        // ATM straddle ≈ E|S_T − K|; for normal, E|X| = σ√(2/π) → σ = straddle·√(π/2); adjust for the ATM offset
        const offset = Math.abs(spot - atm);
        sigmaIvPts = Math.max(0, straddleMid - offset) * Math.sqrt(Math.PI / 2);
      }
    }
  }
  const rvPerMin = realizedPtsPerSqrtMin(i.path, asOf, 10);
  const sigmaRvPts = rvPerMin !== null ? rvPerMin * Math.sqrt(Math.max(remainMin, 0.05)) * s.seasonalityMultiplier : null;
  const sigmaCore = sigmaIvPts !== null && sigmaRvPts !== null ? Math.max(sigmaIvPts, sigmaRvPts) : sigmaIvPts ?? sigmaRvPts ?? (Number.isFinite(spot) ? spot * 0.0007 : 0);
  const sigmaUsedPts = Math.sqrt(sigmaCore ** 2 + s.settlementNoisePts ** 2);
  const speed3 = speedPtsPerMin(i.path, asOf, 3);
  const driftPts = (speed3 ?? 0) * remainMin * s.driftPersistence;

  // ladder
  const ladder: StrikeAnalysis[] = [];
  if (Number.isFinite(spot)) {
    const base = Math.round(spot / s.strikeStep) * s.strikeStep;
    const todays = i.chain && eligible ? i.chain.options.filter((o) => o.expiry === eligible && o.settlement === "PM") : [];
    for (let k = -s.ladderHalfWidth; k <= s.ladderHalfWidth; k++) {
      const K = base + k * s.strikeStep;
      const li = levelInteraction(i.path, K, asOf, { lookbackMs: 15 * 60_000, touchTol: 0.75, holdMs: 60_000, pinCrossings: 4 });
      const speed1 = speedPtsPerMin(i.path, asOf, 1);
      const sp3 = speed3;
      const accel = speed1 !== null && sp3 !== null ? speed1 - sp3 : null;
      const dist = spot - K;
      const etaSec = sp3 && Math.sign(sp3) === -Math.sign(dist) && sp3 !== 0 ? (Math.abs(dist) / Math.abs(sp3)) * 60 : null;
      const pAbove = sigmaUsedPts > 0 ? normCdf((spot + driftPts - K) / sigmaUsedPts) : spot > K ? 1 : 0;
      const evalQuote = (o: OptionQuote | undefined): QuoteEval | null => {
        if (!o || !(o.ask > 0)) return null;
        const spread = o.ask - o.bid;
        const age = asOf - o.quoteTime;
        const be = breakevenWithCosts(o.right, o.strike, o.ask, s.costs);
        const fair0 = expectedIntrinsic(o.right, spot, sigmaUsedPts, o.strike);
        const fair1 = expectedIntrinsic(o.right, spot + driftPts, sigmaUsedPts, o.strike);
        const costPts = perSideCost(s.costs) / 100;
        const pItm = o.right === "C" ? pAbove : 1 - pAbove;
        const reasons: string[] = [];
        let resale: QuoteEval["feasibility"]["resale"] = "ok";
        let hold: QuoteEval["feasibility"]["hold"] = "ok";
        if (remainSec < s.minResaleWindowSec) resale = remainSec < 60 ? "infeasible" : "risky";
        if (sub === "3:58-3:59") resale = "infeasible";
        if (sub === "3:59-4:00") {
          resale = "infeasible";
          hold = "blocked";
          reasons.push("no new entries in the final minute (entry delay, broker cut-offs, no exit)");
        }
        if (spread > s.maxSpreadPts && spread / Math.max(0.05, (o.ask + o.bid) / 2) > s.maxSpreadPct) reasons.push(`spread ${spread.toFixed(2)} too wide`);
        if (Math.min(o.askSize, 1e9) < s.minSize) reasons.push(`ask size ${o.askSize} < ${s.minSize}`);
        if (age > s.maxQuoteAgeMs) reasons.push(`quote age ${Math.round(age / 1000)}s`);
        if (i.mode === "DELAYED") {
          hold = "blocked";
          resale = "infeasible";
          reasons.push("DELAYED data cannot support execution");
        }
        if (reasons.length && hold === "ok") hold = "blocked";
        const scen = [-2, -1, 0, 1, 2].map((z) => {
          const settle = spot + z * sigmaUsedPts;
          const intr = Math.max(0, o.right === "C" ? settle - o.strike : o.strike - settle);
          return { move: z * sigmaUsedPts, settle, pnl: 100 * (intr - o.ask) - perSideCost(s.costs) };
        });
        return {
          osi: o.osi,
          right: o.right,
          strike: o.strike,
          bid: o.bid,
          ask: o.ask,
          spread,
          bidSize: o.bidSize,
          askSize: o.askSize,
          quoteAgeMs: age,
          breakevenSettle: be,
          requiredMovePts: o.right === "C" ? be - spot : spot - be,
          pItm,
          fairNoDrift: fair0,
          fairWithDrift: fair1,
          edgeNoDrift: fair0 - o.ask - costPts,
          edgeWithDrift: fair1 - o.ask - costPts,
          settlementScenarios: scen,
          feasibility: { resale, hold, reasons },
        };
      };
      const call = evalQuote(todays.find((o) => o.strike === K && o.right === "C"));
      const put = evalQuote(todays.find((o) => o.strike === K && o.right === "P"));
      // pattern + bias
      let pattern: StrikeAnalysis["pattern"] = "none";
      let bias: StrikeAnalysis["bias"] = null;
      let text = li.patternText;
      if (li.pattern === "pinning") pattern = "pinning";
      else if (li.pattern === "break-hold") {
        pattern = "break-hold";
        bias = li.side === "above" ? "call" : "put";
      } else if (li.pattern === "reclaim") {
        pattern = "reclaim";
        bias = li.side === "above" ? "call" : "put";
      } else if (li.pattern === "failed-break") {
        pattern = "failed-cross";
        bias = li.side === "above" ? "call" : "put";
      } else if (li.pattern === "rejection") {
        pattern = "rejection";
        bias = li.side === "above" ? "call" : "put";
      } else if (etaSec !== null && etaSec < remainSec && Math.abs(dist) <= 2 * s.strikeStep && (accel ?? 0) * Math.sign(sp3 ?? 0) > 0) {
        pattern = "accelerating-toward";
        bias = (sp3 ?? 0) > 0 ? "call" : "put";
        text = `Accelerating toward ${K}: ${sp3?.toFixed(1)} pts/min, ETA ${Math.round(etaSec)}s with ${Math.round(remainSec)}s left.`;
      }
      ladder.push({ strike: K, side: dist > 0 ? "above" : dist < 0 ? "below" : "at", distance: dist, interaction: li, approach: { speed1, speed3: sp3, accel, etaSec }, pCloseAbove: pAbove, call, put, pattern, patternText: text, bias });
    }
  }

  // confirmation
  const sgn = (p: PricePoint[]) => {
    const v = speedPtsPerMin(p, asOf, 3);
    return v === null ? null : Math.sign(v);
  };
  const spxS = sgn(i.path);
  const spyS = sgn(i.spyPath);
  const esS = sgn(i.esPath);
  const conf = (x: number | null): "confirms" | "diverges" | "n/a" => (x === null || spxS === null ? "n/a" : x === spxS || spxS === 0 ? "confirms" : "diverges");
  const confirmation = { spy: conf(spyS), es: conf(esS), text: `3-minute direction: SPX ${spxS === null ? "n/a" : spxS > 0 ? "up" : spxS < 0 ? "down" : "flat"}; SPY ${conf(spyS)}; ES ${conf(esS)}.` };

  // global pass conditions
  if (sub === "closed") pass.push("Market closed.");
  if (sub === "pre") pass.push(`Closing window opens at ${fmtEtTime(i.clock.session.closeMs - 10 * 60_000, false)} ET.`);
  if (!eligible) pass.push("No PM-settled SPX contract expiring today in the chain (AM-settled SPX is not eligible).");
  if (i.mode === "DELAYED") pass.push("Data is DELAYED (15 min): levels shown for study only; no executable recommendation.");
  if (i.mode === "NONE") pass.push("No market data.");
  if (spotAgeMs > s.maxQuoteAgeMs && Number.isFinite(spotAgeMs)) pass.push(`SPX quote is ${Math.round(spotAgeMs / 1000)}s old (> ${s.maxQuoteAgeMs / 1000}s).`);
  if (sub === "3:59-4:00") pass.push("Final minute: entry delay, quote changes and broker restrictions leave no practical exit — no new entries.");
  if (secondsToClose <= s.noNewEntrySec && sub !== "closed") pass.push(`Less than ${s.noNewEntrySec}s to the close.`);

  // recommendation
  let rec: ClosingRecommendation = {
    state: pass.length ? "PASS" : "WAIT",
    direction: null,
    strike: null,
    contract: null,
    mode: null,
    entryCondition: "",
    invalidation: "",
    exitPlan: [],
    rationale: [],
    counterargument: "",
    expiresAt: asOf + 20_000,
    validation: "unvalidated",
  };
  if (!pass.length) {
    // candidate strikes with a directional bias and confirmation; pick best modelled edge among feasible quotes
    type Cand = { strike: StrikeAnalysis; q: QuoteEval; mode: "resale" | "hold-to-settlement" };
    const cands: Cand[] = [];
    for (const st of ladder) {
      if (!st.bias) continue;
      // for a call bias consider the call at this strike (ITM if spot>K) and the next strike up (OTM); vice versa for puts
      const qs: QuoteEval[] = [];
      if (st.bias === "call") {
        if (st.call) qs.push(st.call);
        const up = ladder.find((x) => x.strike === st.strike + s.strikeStep)?.call;
        if (up) qs.push(up);
      } else {
        if (st.put) qs.push(st.put);
        const dn = ladder.find((x) => x.strike === st.strike - s.strikeStep)?.put;
        if (dn) qs.push(dn);
      }
      for (const q of qs) {
        if (q.feasibility.hold !== "ok") continue;
        const mode: Cand["mode"] = q.feasibility.resale === "ok" ? "resale" : "hold-to-settlement";
        if (q.edgeWithDrift >= s.minEdgePts) cands.push({ strike: st, q, mode });
      }
    }
    cands.sort((a, b) => b.q.edgeWithDrift / b.q.ask - a.q.edgeWithDrift / a.q.ask);
    const best = cands[0];
    if (best) {
      const dir = best.q.right === "C" ? "call" : "put";
      const K = best.strike.strike;
      const diverge = (dir === "call" ? speed3 ?? 0 : -(speed3 ?? 0)) <= 0;
      rec = {
        state: dir === "call" ? "CALL SETUP" : "PUT SETUP",
        direction: dir,
        strike: best.q.strike,
        contract: best.q,
        mode: best.mode,
        entryCondition: `${best.strike.patternText} Buy ${best.q.osi.trim()} at ≤ ${best.q.ask.toFixed(2)} while SPX stays ${dir === "call" ? "above" : "below"} ${K} (entry delay ${s.entryDelaySec}s assumed).`,
        invalidation: `SPX trades back ${dir === "call" ? "below" : "above"} ${K} for >30 s, or the quote widens beyond ${s.maxSpreadPts.toFixed(2)}.`,
        exitPlan:
          best.mode === "resale"
            ? [`Sell on a touch of ${dir === "call" ? K + s.strikeStep : K - s.strikeStep} or at ${Math.max(30, s.minResaleWindowSec / 2)}s before the close, whichever first.`, "Sell immediately on invalidation (expect to pay the spread).", `Never hold past the close unless settlement P&L at the current spot (${best.q.settlementScenarios[2]!.pnl.toFixed(0)} USD/contract) is acceptable.`]
            : ["Hold through cash settlement; P&L = 100 × (intrinsic − premium) − fees.", "No practical exit: quote may not be sellable before 16:00:00.", `Settlement uses closing-auction prices; modelled settlement noise ±${s.settlementNoisePts} pts.`],
        rationale: [
          `Pattern: ${best.strike.pattern} at ${K} (${best.strike.interaction.crossings} crossings in 15 min, dwell ${Math.round(best.strike.interaction.dwellMs / 1000)}s).`,
          `Remaining move 1σ ≈ ${sigmaUsedPts.toFixed(1)} pts over ${Math.round(remainSec)}s (straddle ${straddleMid?.toFixed(2) ?? "n/a"}, realized ${sigmaRvPts?.toFixed(1) ?? "n/a"} pts, settlement noise ${s.settlementNoisePts}).`,
          `Modelled fair value ${best.q.fairNoDrift.toFixed(2)} (no drift) / ${best.q.fairWithDrift.toFixed(2)} (with ${driftPts.toFixed(1)} pt drift) vs ask ${best.q.ask.toFixed(2)} → edge ${best.q.edgeWithDrift.toFixed(2)} pts after costs.`,
          `Model P(ITM at settlement) ${(best.q.pItm * 100).toFixed(0)}%; breakeven settlement ${best.q.breakevenSettle.toFixed(2)} (needs ${best.q.requiredMovePts.toFixed(1)} pts).`,
          confirmation.text,
        ],
        counterargument: diverge
          ? "The 3-minute drift does not support the direction; the edge rests on the pattern alone."
          : confirmation.spy === "diverges"
            ? "SPY diverges from SPX over the last 3 minutes — one feed may be stale or the move is index-specific."
            : "The edge depends on the momentum-drift assumption; with zero drift the edge is " + best.q.edgeNoDrift.toFixed(2) + " pts. Closing-auction imbalances can reverse the last minutes.",
        expiresAt: asOf + 20_000,
        validation: "unvalidated",
      };
    } else {
      rec.state = "WAIT";
      rec.rationale = [
        ladder.some((x) => x.bias) ? "Directional patterns present but no quote clears the edge/feasibility bar." : "No strike shows a break-hold, reclaim, failed cross or acceleration pattern.",
        `Remaining 1σ ≈ ${sigmaUsedPts.toFixed(1)} pts; nearest strikes ${ladder.filter((x) => Math.abs(x.distance) <= s.strikeStep).map((x) => x.strike).join(", ")}.`,
      ];
    }
  } else {
    rec.rationale = pass;
  }
  if (i.chain?.stamp.mode === "DELAYED") notes.push({ level: "block", message: "Option quotes are delayed; ladder economics are illustrative." });
  if (rvPerMin === null) notes.push({ level: "warn", message: "Realized vol needs ≥4 minutes of price path." });
  if (!straddleMid) notes.push({ level: "warn", message: "ATM 0DTE straddle unavailable; using realized vol only." });
  return {
    asOf,
    subWindow: sub,
    secondsToClose,
    spot,
    spotAgeMs,
    mode: i.mode,
    eligibleExpiry: eligible,
    remaining: { sec: remainSec, sigmaIvPts, sigmaRvPts, sigmaUsedPts, straddleMid, driftPts },
    ladder,
    recommendation: rec,
    passReasons: pass,
    confirmation,
    notes,
  };
}

export const CLOSING_METHOD_NOTES = [
  "Strike flip (index crossing a listed strike into settlement) is distinct from the GEX gamma flip (sign change of modelled dealer gamma).",
  "Remaining-move σ = max(ATM straddle-implied, realized × seasonality) combined with settlement noise; Bachelier (normal) expected intrinsic.",
  "Entry at the ask with an assumed entry delay; resale assumed only when ≥2 minutes remain after entry; final minute always PASS.",
  "The last SPX tick is not the settlement value: SPXW PM settlement uses constituent closing-auction prices.",
  "All of the above is a decision aid under explicit hypotheses and is unvalidated until the replay harness reports out-of-sample results.",
];
