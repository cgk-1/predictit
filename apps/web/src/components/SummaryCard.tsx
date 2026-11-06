import type { CleanSummary, LeanResult, SRLevel } from "@predictit/engine";
import { Fact } from "./Panel";
import { leanClass } from "./LeanStrip";
import { fmtContract, fmtPct, fmtPremium, fmtPts, fmtSignedPts, fmtTime, fmtUsd } from "../lib/format";

function actionClass(a: CleanSummary["action"]): string {
  return a === "BUY CALL" ? "call" : a === "BUY PUT" ? "put" : a === "WAIT" ? "wait" : a === "PASS" ? "pass" : "manage";
}

/**
 * The engine's clean answer: headline, action, contract, expected move, exits, support/resistance and risks.
 * Ledger records written before these fields existed lack them, so the card renders nothing instead of inventing a lean.
 */
export function SummaryCard({ summary, lean, now }: { summary: CleanSummary | undefined; lean: LeanResult | undefined; now: number }) {
  if (!summary) return null;
  const cls = actionClass(summary.action);
  const em = summary.expectedMove;
  return (
    <section className={`panel decision decision-${cls} summary`} aria-labelledby="summary-head">
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
            {fmtPct(summary.agreement, 0)} agree{lean ? `, score ${lean.score.toFixed(2)}` : ""}; {summary.validation}
          </span>
          <span className="faint xs">
            as of {fmtTime(summary.asOf)} ET ({Math.max(0, Math.round((now - summary.asOf) / 1000))}s ago)
          </span>
        </div>
      </div>
      <div className="decision-body">
        <p className="summary-text">{summary.actionText}</p>
        {summary.contract ? (
          <div className="facts">
            <Fact label="Contract" value={<span title={summary.contract.osi}>{fmtContract(summary.contract.osi)}</span>} meta={summary.contract.label} />
            <Fact label="Bid / ask" value={`${fmtPremium(summary.contract.bid)} / ${fmtPremium(summary.contract.ask)}`} />
            <Fact label="Risk per contract" value={fmtUsd(summary.contract.riskUsd)} />
            <Fact label="Breakeven" value={fmtPts(summary.contract.breakeven, 2)} />
            <Fact label="Entry condition" text value={summary.contract.entryCondition} />
          </div>
        ) : null}
        <div className="facts">
          <Fact label="Expected move to close (1σ)" value={em.toCloseSigmaPts !== null ? `±${fmtPts(em.toCloseSigmaPts, 1)} pts` : "n/a"} meta={em.source} />
          <Fact label={`Expected move over ${em.horizonMinutes ?? "—"} min (1σ)`} value={em.toHorizonSigmaPts !== null && em.horizonMinutes !== null ? `±${fmtPts(em.toHorizonSigmaPts, 1)} pts` : "n/a — no horizon in this record"} />
        </div>
        <div className="grid-2">
          <SRLadder title="Resistance above" levels={summary.resistance} />
          <SRLadder title="Support below" levels={summary.support} />
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
          {summary.why.length > 0 && (
            <div>
              <div className="section-title">Why</div>
              <ul className="reasons small">
                {summary.why.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.keyRisks.length > 0 && (
            <div className="counter" style={{ maxWidth: "none" }}>
              <h3>Key risks</h3>
              <ul className="reasons small">
                {summary.keyRisks.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
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
            <div key={`${l.kind}-${l.level}`} className="sr-row" role="row" title={`${l.strengthText}; ${l.touches} touches, ${l.crossings} crossings${l.confluence.length ? `; confluence: ${l.confluence.join(", ")}` : ""}`}>
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
