import type { CleanSummary, LeanResult, SRLevel } from "@predictit/engine";
import { Fact } from "./Panel";
import { LeanStrip, leanClass } from "./LeanStrip";
import { fmtContract, fmtPct, fmtPremium, fmtPts, fmtSignedPct, fmtSignedPts, fmtTime, fmtUsd } from "../lib/format";

function actionClass(a: CleanSummary["action"]): string {
  return a === "BUY CALL" ? "call" : a === "BUY PUT" ? "put" : a === "WAIT" ? "wait" : a === "PASS" ? "pass" : "manage";
}

/**
 * The hero: the engine's clean answer in one card. Headline, action, the contract with its budget check, expected
 * move, when to sell, the two S/R ladders, why and key risks, then one quiet line of gap and calendar facts.
 * Ledger records written before these fields existed lack them, so the card renders nothing instead of inventing a lean.
 */
export function SummaryCard({ summary, lean, now, budgetUsd }: { summary: CleanSummary | undefined; lean: LeanResult | undefined; now: number; budgetUsd?: number }) {
  if (!summary) return null;
  const cls = actionClass(summary.action);
  const em = summary.expectedMove;
  const c = summary.contract;
  const withinBudget = c && budgetUsd !== undefined ? c.riskUsd <= budgetUsd : null;
  return (
    <section className={`panel decision decision-${cls} hero`} aria-labelledby="summary-head">
      <div className="decision-top">
        <div className="stack" style={{ gap: 6 }}>
          <h1 id="summary-head" className={`summary-action state-${cls}`}>
            {summary.action}
          </h1>
          <p className="summary-headline">{summary.headline}</p>
        </div>
        <div className="decision-expiry">
          <span className={leanClass(summary.direction)}>
            {summary.direction}
            {summary.strength !== "none" ? ` · ${summary.strength}` : ""}
          </span>
          <span className="faint xs">
            {fmtPct(summary.agreement, 0)} agree{lean ? `, score ${lean.score.toFixed(2)}` : ""}, {summary.validation}
          </span>
          <span className="faint xs">
            as of {fmtTime(summary.asOf)} ET ({Math.max(0, Math.round((now - summary.asOf) / 1000))}s ago)
          </span>
        </div>
      </div>
      <div className="decision-body">
        <p className="summary-text">{summary.actionText}</p>
        {c ? (
          <div className="hero-contract">
            <Fact label={`Contract (${c.instrument})`} value={<span title={c.osi}>{fmtContract(c.osi)}</span>} meta={c.label} />
            <Fact label="Bid / ask" value={`${fmtPremium(c.bid)} / ${fmtPremium(c.ask)}`} />
            <Fact
              label="Risk at the ask"
              value={fmtUsd(c.riskUsd)}
              meta={
                withinBudget === null ? (
                  "per contract"
                ) : withinBudget ? (
                  <span className="chip chip-ok">within {fmtUsd(budgetUsd)} budget</span>
                ) : (
                  <span className="chip chip-bad">over {fmtUsd(budgetUsd)} budget</span>
                )
              }
            />
            <Fact label="Breakeven" value={fmtPts(c.breakeven, 2)} />
            <Fact label="Entry condition" text value={c.entryCondition} />
          </div>
        ) : null}
        <div className="facts">
          <Fact label="Expected move to close (1σ)" value={em.toCloseSigmaPts !== null ? `±${fmtPts(em.toCloseSigmaPts, 1)} pts` : "n/a"} meta={em.source} />
          <Fact label={`Expected move over ${em.horizonMinutes ?? "—"} min (1σ)`} value={em.toHorizonSigmaPts !== null && em.horizonMinutes !== null ? `±${fmtPts(em.toHorizonSigmaPts, 1)} pts` : "n/a"} meta={em.toHorizonSigmaPts === null || em.horizonMinutes === null ? "no horizon in this record" : undefined} />
          {em.straddleAbsMoveToClose !== null && em.straddleAbsMoveToClose !== undefined ? <Fact label="Straddle-implied |move| to close" value={`${fmtPts(em.straddleAbsMoveToClose, 1)} pts`} meta="0DTE ATM straddle mid" /> : null}
        </div>
        {summary.whenToSell.length > 0 && (
          <div>
            <div className="section-title">When to sell</div>
            <ul className="reasons">
              {summary.whenToSell.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid-2">
          <SRLadder title="Resistance above" levels={summary.resistance} />
          <SRLadder title="Support below" levels={summary.support} />
        </div>
        <div className="grid-2">
          <div>
            <div className="section-title">Why</div>
            {summary.why.length ? (
              <ul className="reasons small">
                {summary.why.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : (
              <p className="small na">n/a — no non-zero votes</p>
            )}
          </div>
          <div>
            <div className="section-title">Key risks</div>
            {summary.keyRisks.length ? (
              <ul className="reasons small">
                {summary.keyRisks.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : (
              <p className="small na">n/a — none recorded</p>
            )}
          </div>
        </div>
        <GapCalendarLine summary={summary} />
        <LeanStrip lean={lean} bare />
      </div>
    </section>
  );
}

/** One compact line: gap state and calendar context. Every missing value renders as "n/a" rather than a blank. */
export function GapCalendarLine({ summary }: { summary: CleanSummary }) {
  const g = summary.gap;
  const cal = summary.calendar;
  const gapText = g.pts === null ? "n/a" : `${fmtSignedPts(g.pts)} pts, ${g.filled === null ? "fill n/a" : g.filled ? "filled" : "unfilled"}`;
  return (
    <div className="facts-line" aria-label="Gap and calendar facts">
      <span>
        <b>Gap</b>
        {gapText}
      </span>
      <span>
        <b>Fill level</b>
        {fmtPts(g.fillLevel, 1)}
      </span>
      <span title="Probability of a fill by the close under a driftless (reflection-principle) null">
        <b>Null fill p</b>
        {fmtPct(g.nullFillProb, 0)}
      </span>
      <span>
        <b>Day</b>
        {cal ? `${cal.dayName}, ${cal.timeBucket}` : "n/a"}
      </span>
      <span>
        <b>OPEX</b>
        {cal ? (cal.isMonthlyOpex ? "monthly" : "no") : "n/a"}
        {cal?.isEarlyClose ? ", early close" : ""}
      </span>
      <span>
        <b>Prior day</b>
        {cal ? fmtSignedPct(cal.priorDayRet, 2) : "n/a"}
      </span>
      <span title="Where the prior session closed within its range: 100% = at the high">
        <b>Prior close loc</b>
        {cal ? fmtPct(cal.priorCloseLocation, 0) : "n/a"}
      </span>
      <span>
        <b>Week to date</b>
        {cal ? fmtSignedPct(cal.weekToDatePct, 2) : "n/a"}
      </span>
    </div>
  );
}

function SRLadder({ title, levels }: { title: string; levels: SRLevel[] }) {
  const sorted = [...levels].sort((a, b) => b.level - a.level);
  return (
    <div>
      <div className="section-title">{title}</div>
      {!sorted.length ? (
        <p className="small na">n/a — no scored level on this side</p>
      ) : (
        <div className="sr" role="table" aria-label={title}>
          {sorted.map((l) => (
            <div key={`${l.kind}-${l.level}`} className="sr-row" role="row" title={l.strengthText}>
              <span className="sr-level">{fmtPts(l.level, 1)}</span>
              <span className="sr-dist">
                {fmtSignedPts(l.distancePts)} ({fmtSignedPts(l.distancePct * 100, 2)}%)
              </span>
              <span className="sr-label">{l.label}</span>
              <span className="sr-bar" aria-label={`strength ${Math.round(l.strength)} of 100`}>
                <span className={`sr-fill ${l.role === "support" ? "sr-fill-support" : "sr-fill-resistance"}`} style={{ width: `${Math.max(2, Math.min(100, l.strength))}%` }} />
              </span>
              <span className="sr-strength">{Math.round(l.strength)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
