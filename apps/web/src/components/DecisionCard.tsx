import type { DecisionRecord, QuoteEval, RankedContract } from "@predictit/engine";
import { PHASE_LABEL, type SessionPhase } from "@predictit/engine";
import { Countdown } from "./Countdown";
import { EvidenceList } from "./EvidenceList";
import { LifecycleChip, ModeBadge, stateClass, ValidationChip } from "./Badges";
import { Notes } from "./Notes";
import { Fact, NA } from "./Panel";
import { fmtContract, fmtMs, fmtPts, fmtPremium, fmtTime, fmtUsd, fmtDelta } from "../lib/format";

interface ContractView {
  osi: string;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  quoteAgeMs: number;
  riskUsd: number;
  breakeven: number;
  breakevenLabel: string;
  delta: number | null;
  is0dte: boolean | null;
  source: "ranked" | "closing";
}

function fromRanked(c: RankedContract): ContractView {
  return { osi: c.osi, bid: c.bid, ask: c.ask, bidSize: c.bidSize, askSize: c.askSize, quoteAgeMs: c.quoteAgeMs, riskUsd: c.riskUsd, breakeven: c.breakevenAtExpiry, breakevenLabel: "Breakeven at expiry (incl. costs)", delta: c.delta, is0dte: c.is0dte, source: "ranked" };
}

function fromClosing(c: QuoteEval): ContractView {
  return { osi: c.osi, bid: c.bid, ask: c.ask, bidSize: c.bidSize, askSize: c.askSize, quoteAgeMs: c.quoteAgeMs, riskUsd: c.ask * 100, breakeven: c.breakevenSettle, breakevenLabel: "Breakeven settlement (incl. costs)", delta: null, is0dte: true, source: "closing" };
}

/** The recommended contract for a record: ranked list first, else the closing-window recommendation. */
export function recommendedContract(d: DecisionRecord): ContractView | null {
  const r = d.contracts[0];
  if (r) return fromRanked(r);
  const c = d.closing?.recommendation;
  if (c && c.contract && (c.state === "CALL SETUP" || c.state === "PUT SETUP")) return fromClosing(c.contract);
  return null;
}

export function DecisionCard({ decision: d, now, compact }: { decision: DecisionRecord; now: number; compact?: boolean }) {
  const cls = stateClass(d.state);
  const primary = d.primary;
  const closingRec = d.closing && (d.closing.recommendation.state === "CALL SETUP" || d.closing.recommendation.state === "PUT SETUP") ? d.closing.recommendation : null;
  const usingClosing = !!closingRec && !d.contracts.length && (d.state === "CALL SETUP" || d.state === "PUT SETUP");
  const contract = recommendedContract(d);
  const evidence = d.evidence.length ? d.evidence : primary?.evidence ?? [];
  const counter = d.counterargument || (usingClosing ? closingRec?.counterargument : primary?.counterargument) || "";
  const ttl = Math.max(1, d.expiresAt - d.asOf);
  const frac = Math.max(0, Math.min(1, (d.expiresAt - now) / ttl));
  const quoteAt = contract ? d.asOf - contract.quoteAgeMs : null;
  const isSetup = d.state === "CALL SETUP" || d.state === "PUT SETUP";
  const strategyName = usingClosing ? "Strike flip (closing window)" : primary?.name ?? null;

  return (
    <section className={`panel decision decision-${cls}`} aria-labelledby="decision-state">
      <div className="decision-top">
        <div className="stack" style={{ gap: 6 }}>
          <h1 id="decision-state" className={`decision-state state-${cls}`}>
            {d.state}
          </h1>
          <div className="panel-meta" style={{ gap: "4px 10px" }}>
            <span>decision v{d.version}</span>
            <span>as of {fmtTime(d.asOf)} ET</span>
            <ModeBadge mode={d.mode} />
            <span>{PHASE_LABEL[d.phase as SessionPhase] ?? d.phase}</span>
            <span title="Digest of the inputs this record was computed from">inputs {d.inputsDigest}</span>
          </div>
        </div>
        <div className="decision-expiry" aria-live="polite">
          <Countdown target={d.expiresAt} now={now} />
          <span className="faint xs">evaluated {fmtMs(Math.max(0, now - d.asOf))} ago</span>
        </div>
      </div>
      <div className="expiry-track" aria-hidden="true">
        <div className="expiry-fill" style={{ width: `${frac * 100}%` }} />
      </div>

      {(strategyName || contract) && (
        <div className="decision-contract">
          {contract ? (
            <span className="decision-contract-name" title={contract.osi}>
              {fmtContract(contract.osi)}
            </span>
          ) : null}
          {contract?.is0dte ? <span className="chip chip-neutral">0DTE</span> : null}
          {strategyName ? <span>{strategyName}</span> : null}
          {primary ? <LifecycleChip lifecycle={primary.lifecycle} /> : null}
          {usingClosing && closingRec ? <span className="chip chip-neutral">{closingRec.mode === "resale" ? "resale" : "hold to settlement"}</span> : null}
          {primary ? <ValidationChip validation={primary.validation} /> : usingClosing && closingRec ? <ValidationChip validation={closingRec.validation} /> : null}
        </div>
      )}

      <div className="decision-body">
        {(primary || usingClosing) && (
          <div className="facts">
            <Fact label="Entry condition" text value={usingClosing && closingRec ? closingRec.entryCondition : primary?.triggerCondition ?? <NA />} />
            {primary && !usingClosing ? (
              <Fact label="Entry zone (SPX)" value={primary.entryZone ? `${fmtPts(primary.entryZone.low)} – ${fmtPts(primary.entryZone.high)}` : <NA reason="no zone for this family" />} />
            ) : null}
            <Fact
              label="Invalidation"
              text
              value={
                usingClosing && closingRec ? (
                  closingRec.invalidation
                ) : primary ? (
                  <>
                    <span className="mono">{fmtPts(primary.invalidationLevel)}</span> — {primary.invalidationText}
                  </>
                ) : (
                  <NA />
                )
              }
            />
            {primary && !usingClosing ? <Fact label="Target (SPX)" value={primary.targetLevel !== null ? fmtPts(primary.targetLevel) : <NA reason="no target for this family" />} /> : null}
            <Fact label="Horizon" value={usingClosing && d.closing ? `to the close (${Math.round(d.closing.secondsToClose)}s at evaluation)` : primary ? `${primary.horizonMinutes} min from trigger` : <NA />} />
            {primary && !usingClosing ? <Fact label="Preferred expiry" value={primary.preferredExpiry} /> : null}
          </div>
        )}

        {contract ? (
          <div className="facts">
            <Fact label="Risk per contract" value={fmtUsd(contract.riskUsd)} meta={`entry at ask ${fmtPremium(contract.ask)} × 100`} />
            <Fact label={contract.breakevenLabel} value={fmtPts(contract.breakeven, 2)} />
            <Fact label="Quote (bid / ask)" value={`${fmtPremium(contract.bid)} / ${fmtPremium(contract.ask)}`} meta={`size ${contract.bidSize} × ${contract.askSize}`} />
            <Fact label="Quote age at evaluation" value={fmtMs(contract.quoteAgeMs)} meta={quoteAt !== null ? `quote ${fmtTime(quoteAt)} ET` : undefined} />
            {contract.delta !== null ? <Fact label="Delta (our model)" value={fmtDelta(contract.delta)} /> : null}
          </div>
        ) : isSetup ? (
          <p className="small muted">
            <NA reason="no contract attached to this record" />
          </p>
        ) : null}

        {(usingClosing && closingRec ? closingRec.exitPlan : primary?.exitRules ?? []).length > 0 && (
          <div>
            <div className="section-title">Exit rules</div>
            <ul className="reasons">
              {(usingClosing && closingRec ? closingRec.exitPlan : primary?.exitRules ?? []).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {d.whyWait.length > 0 && (
          <div>
            <div className="section-title">{d.state === "MANAGE EXISTING POSITION" ? "Open position signals" : "Why wait?"}</div>
            <ul className="reasons">
              {d.whyWait.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {d.passReasons.length > 0 && (
          <div>
            <div className="section-title">Why pass?</div>
            <ul className="reasons">
              {d.passReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {counter ? (
          <div className="counter">
            <h3>Strongest counterargument</h3>
            <p>{counter}</p>
          </div>
        ) : null}

        {!compact && (
          <div>
            <div className="section-title">Evidence</div>
            <EvidenceList evidence={evidence} />
          </div>
        )}

        {usingClosing && closingRec && closingRec.rationale.length > 0 && !compact ? (
          <div>
            <div className="section-title">Closing-window rationale</div>
            <ul className="reasons">
              {closingRec.rationale.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Notes notes={d.dataNotes} title="Data quality" />
      </div>
    </section>
  );
}
