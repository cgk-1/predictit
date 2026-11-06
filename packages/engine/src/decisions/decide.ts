/**
 * Decision aggregation. Produces an immutable DecisionRecord for the frame: one of
 * CALL SETUP / PUT SETUP / WAIT / PASS / MANAGE EXISTING POSITION, with contracts, evidence, counterargument,
 * expiry and data-quality limits. Records are versioned: a new version is written whenever the state, the primary
 * candidate or the top contract changes; otherwise the previous record stays authoritative until it expires.
 */
import type { DataQualityNote, DecisionState, Evidence } from "../types";
import type { EngineContext } from "./context";
import { evaluateStrategies, lifecycleRank } from "../strategies/families";
import type { SetupCandidate, WaitReason } from "../strategies/types";
import { rankAcrossChains, type RankedContract, type RankingResult } from "../ranking/contracts";
import { assessClosingWindow, type ClosingAssessment, type ClosingSettings } from "../closing/strikeFlip";
import { markPosition, type PaperPosition, type PositionMark } from "../positions/positions";
import { fmtEtTime } from "../time/et";
import { computeLean, initialWeights, type EnsembleWeights, type LeanResult } from "../lean/ensemble";
import { buildSummary, type CleanSummary } from "./summary";

export interface DecisionRecord {
  id: string;
  version: number;
  previousId: string | null;
  asOf: number;
  expiresAt: number;
  date: string;
  phase: string;
  mode: EngineContext["mode"];
  state: DecisionState;
  primary: SetupCandidate | null;
  contracts: RankedContract[];
  rankingNotes: string[];
  rankingAssumptions: string[];
  candidates: SetupCandidate[];
  waits: WaitReason[];
  passReasons: string[];
  whyWait: string[];
  evidence: Evidence[];
  counterargument: string;
  regime: EngineContext["regime"];
  dataNotes: DataQualityNote[];
  positions: PositionMark[];
  closing: ClosingAssessment | null;
  /** transparent indicator ensemble (directional lean) */
  lean: LeanResult;
  /** the clean answer composed from recorded outputs */
  summary: CleanSummary;
  /** hash of key inputs so a later viewer can prove what the record was based on */
  inputsDigest: string;
}

export interface DecideInputs {
  ctx: EngineContext;
  positions: PaperPosition[];
  previous: DecisionRecord | null;
  realizedToday: number;
  weights?: EnsembleWeights;
  /** closing-window settings (with learned parameters applied by the caller) */
  closingSettings?: Partial<ClosingSettings>;
}

function digest(parts: Array<string | number | null | undefined>): string {
  // small FNV-1a over a joined string; deterministic, not cryptographic
  let h = 0x811c9dc5;
  const s = parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function decide(i: DecideInputs): DecisionRecord {
  const { ctx } = i;
  const asOf = ctx.asOf;
  const dataNotes: DataQualityNote[] = [...ctx.notes];
  const passReasons: string[] = [];
  const whyWait: string[] = [];
  const openPositions = i.positions.filter((p) => p.status === "open");
  const marks = openPositions.map((p) => markPosition(p, ctx.frame.spxChain ?? null, ctx.frame.spx?.last ?? null, asOf));

  // closing window assessment (always computed in/near the window for display)
  let closing: ClosingAssessment | null = null;
  if (ctx.clock.session.isTradingDay && ctx.clock.minutesToClose <= 20 && ctx.clock.minutesToClose > -5) {
    closing = assessClosingWindow({
      clock: ctx.clock,
      spx: ctx.frame.spx ?? null,
      spy: ctx.frame.spy ?? null,
      es: ctx.frame.es ?? null,
      path: ctx.spxPath,
      spyPath: ctx.frame.spyBars ? ctx.frame.spyBars.bars.filter((b) => b.t + 60_000 <= asOf).map((b) => ({ t: b.t + 60_000, p: b.c })) : [],
      esPath: [],
      chain: ctx.frame.spxChain ?? null,
      mode: ctx.mode,
      settings: { maxPremiumUsd: ctx.settings.maxPremiumPerContract, costs: { commissionPerContract: ctx.settings.commissionPerContract, feesPerContract: ctx.settings.feesPerContract }, ...(i.closingSettings ?? {}) },
    });
  }

  // global PASS conditions
  if (!ctx.clock.isRegularSession) passReasons.push(ctx.clock.phase === "premarket" ? "Premarket: no SPX option session yet (preparation only)." : "Outside the regular session.");
  if (ctx.regime.dataConfidence === "low") passReasons.push("Data confidence is low (stale or missing inputs).");
  if (ctx.mode === "DELAYED") passReasons.push("Running on DELAYED data: setups are shown for study; no executable entry.");
  if (ctx.regime.eventRisk.level === "high") passReasons.push(`High-impact event in ${ctx.regime.eventRisk.minutesUntil?.toFixed(0)} min (${ctx.regime.eventRisk.next?.label}).`);
  if (ctx.regime.liquidity === "poor") passReasons.push("Front-expiry ATM liquidity is poor (wide spread).");
  if (i.realizedToday <= -ctx.settings.dailyLossLimit) passReasons.push(`Daily loss limit reached ($${ctx.settings.dailyLossLimit}).`);
  const blocks = dataNotes.filter((n) => n.level === "block");
  for (const b of blocks) passReasons.push(b.message);

  // strategies
  const strat = ctx.clock.isRegularSession ? evaluateStrategies(ctx) : { candidates: [], waits: [] };
  let candidates = strat.candidates;
  // in the closing window the strike-flip module is the primary source
  if (closing && ctx.clock.inClosingWindow) {
    candidates = candidates.filter((c) => c.horizonMinutes <= ctx.clock.minutesToClose - 1);
  }
  const primary = candidates[0] ?? null;

  let state: DecisionState = "WAIT";
  let contracts: RankedContract[] = [];
  let rankingNotes: string[] = [];
  let rankingAssumptions: string[] = [];
  let counterargument = "";
  const evidence: Evidence[] = [];

  if (openPositions.length) {
    state = "MANAGE EXISTING POSITION";
    for (const m of marks) if (m.exitSignal) whyWait.push(`Position ${m.id}: ${m.exitSignal.reason}`);
  }

  if (closing && ctx.clock.inClosingWindow) {
    const r = closing.recommendation;
    if (!openPositions.length) {
      if (r.state === "PASS") {
        state = "PASS";
        passReasons.push(...closing.passReasons);
      } else if (r.state === "WAIT") {
        state = "WAIT";
        whyWait.push(...r.rationale);
      } else {
        state = r.state;
        counterargument = r.counterargument;
      }
    }
  } else if (!openPositions.length) {
    // rank contracts whenever a triggered setup and a chain exist — also under PASS, for study (never executable)
    if (primary && primary.lifecycle === "triggered" && ctx.frame.spxChain) {
      const chains: Array<{ chain: typeof ctx.frame.spxChain; levelScale: number }> = [{ chain: ctx.frame.spxChain, levelScale: 1 }];
      if (ctx.frame.spyChain && ctx.frame.spx && ctx.frame.spy && ctx.frame.spx.last > 0) chains.push({ chain: ctx.frame.spyChain, levelScale: ctx.frame.spy.last / ctx.frame.spx.last });
      const rk: RankingResult = rankAcrossChains({
        asOf,
        today: ctx.today,
        direction: primary.direction,
        horizonMinutes: primary.horizonMinutes,
        targetLevel: primary.targetLevel,
        invalidationLevel: primary.invalidationLevel,
        preferredExpiry: primary.preferredExpiry,
        minutesToClose: ctx.clock.minutesToClose,
        limits: { maxSpreadPct: ctx.settings.maxSpreadPct, maxQuoteAgeMs: ctx.settings.maxQuoteAgeMs, minQuoteSize: ctx.settings.minQuoteSize, maxPremiumPerContract: ctx.settings.maxPremiumPerContract },
        costs: { commissionPerContract: ctx.settings.commissionPerContract, feesPerContract: ctx.settings.feesPerContract },
      }, chains);
      contracts = rk.ranked;
      rankingNotes = rk.notes.map((n) => n.message);
      rankingAssumptions = rk.assumptions;
    }
    if (passReasons.length) state = "PASS";
    else if (primary && primary.lifecycle === "triggered" && ctx.frame.spxChain) {
      const eligible = contracts.filter((c) => c.eligible);
      if (!eligible.length) {
        state = "PASS";
        passReasons.push(`${primary.name} triggered (${primary.direction}) but no contract passes execution filters: ${contracts[0]?.reasons.join("; ") ?? rankingNotes.join("; ") ?? "none available"}.`);
      } else {
        state = primary.direction === "call" ? "CALL SETUP" : "PUT SETUP";
        counterargument = primary.counterargument;
        evidence.push(...primary.evidence);
      }
    } else if (primary) {
      state = "WAIT";
      whyWait.push(`${primary.name} is ${primary.lifecycle} (${primary.direction}): ${primary.triggerCondition}`);
      for (const c of candidates.slice(1, 3)) whyWait.push(`${c.name} ${c.lifecycle} (${c.direction}).`);
    } else {
      state = "WAIT";
      whyWait.push(...strat.waits.slice(0, 6).map((w) => `${w.family}: ${w.reason}`));
      if (!strat.waits.length) whyWait.push("No setup family is applicable in this phase.");
    }
  }

  const prevId = i.previous?.id ?? null;
  const version = (i.previous?.version ?? 0) + 1;
  const inputsDigest = digest([asOf, ctx.frame.spx?.last, ctx.frame.spx?.quoteTime, ctx.frame.spxChain?.stamp.observedAt, ctx.frame.spxBars?.stamp.observedAt, state, primary?.id, contracts[0]?.osi, closing?.recommendation.contract?.osi]);
  const ttl = ctx.clock.inClosingWindow ? 20_000 : primary ? Math.min(primary.expiresAt - asOf, 5 * 60_000) : 60_000;
  const lean = computeLean(ctx, ctx.calendar, i.weights ?? initialWeights(asOf));
  const partial = {
    id: `dec_${ctx.today}_${asOf}_${inputsDigest}`,
    version,
    previousId: prevId,
    asOf,
    expiresAt: asOf + Math.max(10_000, ttl),
    date: ctx.today,
    phase: ctx.clock.phase,
    mode: ctx.mode,
    state,
    primary,
    contracts,
    rankingNotes,
    rankingAssumptions,
    candidates: candidates.slice(0, 8),
    waits: strat.waits,
    passReasons,
    whyWait,
    evidence,
    counterargument,
    regime: ctx.regime,
    dataNotes,
    positions: marks,
    closing,
    lean,
    inputsDigest,
  };
  const summary = buildSummary(ctx, { ...partial, summary: null as unknown as CleanSummary }, lean, ctx.sr);
  return { ...partial, summary };
}

/** True when a new record should be persisted (material change or expiry of the previous). */
export function shouldPersist(prev: DecisionRecord | null, next: DecisionRecord): boolean {
  if (!prev) return true;
  if (next.asOf >= prev.expiresAt) return true;
  if (prev.state !== next.state) return true;
  if ((prev.primary?.id ?? null) !== (next.primary?.id ?? null)) return true;
  if ((prev.primary?.lifecycle ?? null) !== (next.primary?.lifecycle ?? null)) return true;
  if ((prev.contracts[0]?.osi ?? null) !== (next.contracts[0]?.osi ?? null)) return true;
  if ((prev.closing?.recommendation.contract?.osi ?? null) !== (next.closing?.recommendation.contract?.osi ?? null)) return true;
  if (prev.mode !== next.mode) return true;
  if ((prev.lean?.direction ?? null) !== next.lean.direction) return true;
  return false;
}

export interface ChangeEvent {
  at: number;
  kind: "state" | "setup" | "regime" | "level" | "gex" | "data" | "position" | "closing";
  text: string;
}

/** "What changed?" feed between two consecutive engine outputs. */
export function diffDecisions(prev: DecisionRecord | null, next: DecisionRecord, prevCtx: EngineContext | null, ctx: EngineContext): ChangeEvent[] {
  const ev: ChangeEvent[] = [];
  const at = next.asOf;
  const t = fmtEtTime(at, false);
  if (!prev) {
    ev.push({ at, kind: "state", text: `${t} Engine started: ${next.state} (${next.mode}).` });
    return ev;
  }
  if (prev.state !== next.state) ev.push({ at, kind: "state", text: `${t} ${prev.state} → ${next.state}.` });
  // setup lifecycle events: only armed/triggered setups are newsworthy (forming ones churn)
  const prevIds = new Map((prev.candidates ?? []).map((c) => [c.id, c.lifecycle]));
  const newsworthy = (l: SetupCandidate["lifecycle"]) => l === "armed" || l === "triggered";
  for (const c of next.candidates) {
    const was = prevIds.get(c.id);
    if (!was && newsworthy(c.lifecycle)) ev.push({ at, kind: "setup", text: `${t} ${c.name} (${c.direction}) ${c.lifecycle}.` });
    else if (was && was !== c.lifecycle && (newsworthy(c.lifecycle) || newsworthy(was))) ev.push({ at, kind: "setup", text: `${t} ${c.name} (${c.direction}): ${was} → ${c.lifecycle}.` });
  }
  for (const c of prev.candidates ?? []) if (newsworthy(c.lifecycle) && !next.candidates.some((n) => n.id === c.id)) ev.push({ at, kind: "setup", text: `${t} ${c.name} (${c.direction}) no longer ${c.lifecycle}.` });
  if (prevCtx) {
    const a = prevCtx.regime;
    const b = ctx.regime;
    if (a.trend !== b.trend) ev.push({ at, kind: "regime", text: `${t} Trend: ${a.trend} → ${b.trend}.` });
    if (a.volatility !== b.volatility) ev.push({ at, kind: "regime", text: `${t} Volatility: ${a.volatility} → ${b.volatility}.` });
    if (a.gamma !== b.gamma) ev.push({ at, kind: "gex", text: `${t} Gamma regime: ${a.gamma} → ${b.gamma}.` });
    if (a.dataConfidence !== b.dataConfidence) ev.push({ at, kind: "data", text: `${t} Data confidence: ${a.dataConfidence} → ${b.dataConfidence}.` });
    if (prevCtx.mode !== ctx.mode) ev.push({ at, kind: "data", text: `${t} Data mode: ${prevCtx.mode} → ${ctx.mode}.` });
    const pf = prevCtx.gex?.flip.level;
    const nf = ctx.gex?.flip.level;
    if (pf && nf && Math.abs(nf - pf) > 5) ev.push({ at, kind: "gex", text: `${t} Zero-gamma estimate moved ${pf.toFixed(0)} → ${nf.toFixed(0)}.` });
    const ps = prevCtx.frame.spx?.last;
    const ns = ctx.frame.spx?.last;
    if (ps && ns) {
      for (const l of ctx.levels) {
        if (l.kind === "round") continue;
        if ((ps < l.level && ns >= l.level) || (ps > l.level && ns <= l.level)) ev.push({ at, kind: "level", text: `${t} SPX crossed ${l.label} ${l.level.toFixed(1)} (${ns > l.level ? "above" : "below"}).` });
      }
    }
  }
  for (const m of next.positions) if (m.exitSignal && !(prev.positions ?? []).find((p) => p.id === m.id)?.exitSignal) ev.push({ at, kind: "position", text: `${t} ${m.exitSignal.reason}` });
  if (next.closing && prev.closing && next.closing.recommendation.state !== prev.closing.recommendation.state) ev.push({ at, kind: "closing", text: `${t} Closing window: ${prev.closing.recommendation.state} → ${next.closing.recommendation.state}.` });
  if ((prev.lean?.direction ?? null) !== next.lean.direction) ev.push({ at, kind: "regime", text: `${t} Market lean: ${prev.lean?.direction ?? "n/a"} → ${next.lean.direction} (${next.lean.strength}).` });
  return ev;
}
