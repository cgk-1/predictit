/**
 * The clean answer for the top of the screen: direction, action, contract, expected move, when to sell,
 * support and resistance, key risks. It composes recorded outputs (decision, lean, chain features, S/R) and
 * adds nothing that is not already evidenced.
 */
import type { DecisionRecord } from "./decide";
import type { LeanResult } from "../lean/ensemble";
import type { SRLevel } from "../features/sr";
import type { EngineContext } from "./context";
import { TRADING_MINUTES_PER_YEAR } from "../pricing/tte";
import { normCdf } from "../pricing/bs";

export interface CleanSummary {
  asOf: number;
  headline: string;
  direction: "UP" | "DOWN" | "NEUTRAL";
  strength: LeanResult["strength"];
  leanScore: number;
  agreement: number;
  action: "BUY CALL" | "BUY PUT" | "WAIT" | "PASS" | "MANAGE";
  actionText: string;
  contract: { osi: string; label: string; bid: number; ask: number; riskUsd: number; breakeven: number; entryCondition: string } | null;
  expectedMove: { toCloseSigmaPts: number | null; horizonMinutes: number | null; toHorizonSigmaPts: number | null; straddleAbsMoveToClose: number | null; source: string };
  /** overnight gap state with the reflection-principle null for a fill (2·(1−Φ(gap/σ_to_close))) */
  gap: { pts: number | null; filled: boolean | null; fillLevel: number | null; nullFillProb: number | null };
  calendar: { dayName: string; timeBucket: string; isMonthlyOpex: boolean; isEarlyClose: boolean; priorDayRet: number | null; priorCloseLocation: number | null; weekToDatePct: number | null; priorWeekRet: number | null; coverageDays: number } | null;
  whenToSell: string[];
  support: SRLevel[];
  resistance: SRLevel[];
  keyRisks: string[];
  why: string[];
  validation: "unvalidated" | "prospective";
}

export function buildSummary(ctx: EngineContext, rec: DecisionRecord, lean: LeanResult, sr: { support: SRLevel[]; resistance: SRLevel[] }): CleanSummary {
  const spot = ctx.frame.spx?.last ?? ctx.spxBars?.last ?? null;
  const atmIv = ctx.spxChain?.front?.atmIv ?? null;
  const toClose = ctx.spxChain?.expectedMoveToClose ?? null;
  const horizon = rec.primary?.horizonMinutes ?? (rec.closing ? Math.round(rec.closing.remaining.sec / 60) : null);
  const toHorizon = atmIv && spot && horizon ? spot * atmIv * Math.sqrt(horizon / TRADING_MINUTES_PER_YEAR) : rec.closing ? rec.closing.remaining.sigmaUsedPts : null;
  let action: CleanSummary["action"] = "WAIT";
  let actionText = "";
  let contract: CleanSummary["contract"] = null;
  const whenToSell: string[] = [];
  if (rec.state === "MANAGE EXISTING POSITION") {
    action = "MANAGE";
    actionText = rec.positions.some((p) => p.exitSignal) ? `Exit signal: ${rec.positions.find((p) => p.exitSignal)!.exitSignal!.reason}` : "Hold: no exit condition met. Watch invalidation and time stop.";
    for (const p of rec.positions) for (const a of p.alerts) whenToSell.push(a.text);
  } else if (rec.state === "CALL SETUP" || rec.state === "PUT SETUP") {
    action = rec.state === "CALL SETUP" ? "BUY CALL" : "BUY PUT";
    if (rec.closing && ctx.clock.inClosingWindow && rec.closing.recommendation.contract) {
      const c = rec.closing.recommendation.contract;
      contract = { osi: c.osi, label: `${c.osi.trim()} (${rec.closing.recommendation.mode})`, bid: c.bid, ask: c.ask, riskUsd: c.ask * 100, breakeven: c.breakevenSettle, entryCondition: rec.closing.recommendation.entryCondition };
      actionText = `${action} — ${rec.closing.recommendation.mode === "resale" ? "resale before the close" : "hold through settlement"}.`;
      whenToSell.push(...rec.closing.recommendation.exitPlan);
      whenToSell.push(`Invalidation: ${rec.closing.recommendation.invalidation}`);
    } else {
      const c = rec.contracts.find((x) => x.eligible) ?? rec.contracts[0];
      if (c && rec.primary) {
        contract = { osi: c.osi, label: `${c.root} ${c.expiry} ${c.strike}${c.right} (Δ ${c.delta?.toFixed(2) ?? "n/a"})`, bid: c.bid, ask: c.ask, riskUsd: c.riskUsd, breakeven: c.breakevenAtExpiry, entryCondition: rec.primary.entryZone ? `Enter while SPX is in ${rec.primary.entryZone.low.toFixed(1)}–${rec.primary.entryZone.high.toFixed(1)}; ${rec.primary.triggerCondition}` : rec.primary.triggerCondition };
        actionText = `${action} — ${rec.primary.name} (${rec.primary.lifecycle}); risk $${c.riskUsd.toFixed(0)}/contract at the ask.`;
        whenToSell.push(...rec.primary.exitRules);
        whenToSell.push(`Invalidation: ${rec.primary.invalidationText}`);
        if (rec.primary.targetLevel) whenToSell.push(`Target: SPX ${rec.primary.targetLevel.toFixed(1)} (modelled option return ${c.atTarget ? (c.atTarget.ret * 100).toFixed(0) + "%" : "n/a"}).`);
        whenToSell.push(`Time stop: ${rec.primary.horizonMinutes} min after entry (flat scenario return ${(c.atFlat.ret * 100).toFixed(0)}%).`);
      } else actionText = `${action} setup but no eligible contract.`;
    }
  } else if (rec.state === "PASS") {
    action = "PASS";
    actionText = rec.passReasons[0] ?? "No trade.";
  } else {
    action = "WAIT";
    actionText = rec.whyWait[0] ?? "No setup is armed or triggered.";
  }
  const dirText = lean.direction === "NEUTRAL" ? "no directional lean" : `lean ${lean.direction} (${lean.strength}, ${Math.round(lean.agreement * 100)}% of voting indicators agree)`;
  const headline = `${dirText} · ${action}`;
  const keyRisks: string[] = [];
  if (rec.counterargument) keyRisks.push(rec.counterargument);
  if (ctx.regime.eventRisk.next && ctx.regime.eventRisk.minutesUntil !== null && ctx.regime.eventRisk.minutesUntil < 120) keyRisks.push(`${ctx.regime.eventRisk.next.label} in ${ctx.regime.eventRisk.minutesUntil.toFixed(0)} min.`);
  if (ctx.regime.dataConfidence !== "high") keyRisks.push(`Data confidence ${ctx.regime.dataConfidence} (${ctx.mode}).`);
  for (const a of lean.against) keyRisks.push(`Against the lean — ${a}`);
  const why = [...lean.top];
  if (rec.primary) why.push(`${rec.primary.name}: ${rec.primary.evidence.map((e) => `${e.label} ${e.value}`).join("; ")}`);
  const cal = ctx.calendar;
  const gapPts = cal?.today.gapPts ?? null;
  const nullFillProb = gapPts !== null && gapPts !== 0 && toClose && toClose > 0 && cal?.today.gapFilled === false ? 2 * (1 - normCdf(Math.abs(gapPts) / toClose)) : cal?.today.gapFilled ? 1 : null;
  return {
    asOf: ctx.asOf,
    headline,
    direction: lean.direction,
    strength: lean.strength,
    leanScore: lean.score,
    agreement: lean.agreement,
    action,
    actionText,
    contract,
    expectedMove: { toCloseSigmaPts: toClose, horizonMinutes: horizon, toHorizonSigmaPts: toHorizon, straddleAbsMoveToClose: ctx.spxChain?.straddleAbsMoveToClose ?? null, source: atmIv ? "0DTE ATM implied vol (trading-time), 1σ" : rec.closing ? "closing-window σ (straddle/realized + settlement noise)" : "n/a" },
    gap: { pts: gapPts, filled: cal?.today.gapFilled ?? null, fillLevel: cal?.today.gapFillLevel ?? null, nullFillProb },
    calendar: cal ? { dayName: cal.dayName, timeBucket: cal.timeBucket, isMonthlyOpex: cal.isMonthlyOpex, isEarlyClose: cal.isEarlyClose, priorDayRet: cal.prior?.ret ?? null, priorCloseLocation: cal.prior?.closeLocation ?? null, weekToDatePct: cal.weekToDatePct, priorWeekRet: cal.priorWeek?.ret ?? null, coverageDays: cal.coverageDays } : null,
    whenToSell,
    support: sr.support,
    resistance: sr.resistance,
    keyRisks,
    why,
    validation: lean.validation,
  };
}
