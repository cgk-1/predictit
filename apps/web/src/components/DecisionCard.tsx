import type { DecisionRecord, QuoteEval, RankedContract } from "@predictit/engine";
import { PHASE_LABEL, type SessionPhase } from "@predictit/engine";
import { Collapsible } from "./Collapsible";
import { Countdown } from "./Countdown";
import { EvidenceList } from "./EvidenceList";
import { stateClass } from "./Badges";
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

/**
 * The full decision record behind the hero: identity (version, id, expiry, inputs digest), the candidate's
 * details, the contract quote at evaluation, wait/pass reasons, evidence, ranking assumptions and data notes.
 * Collapsed by default; the summary line carries the state, version, time and the expiry countdown.
 */
export function DecisionCard({ decision: d, now, id = "decision-record" }: { decision: DecisionRecord; now: number; id?: string }) {
  const cls = stateClass(d.state);
  const primary = d.primary;
  const closingRec = d.closing && (d.closing.recommendation.state === "CALL SETUP" || d.closing.recommendation.state === "PUT SETUP") ? d.closing.recommendation : null;
  const usingClosing = !!closingRec && !d.contracts.length && (d.state === "CALL SETUP" || d.state === "PUT SETUP");
  const contract = recommendedContract(d);
  const evidence = d.evidence.length ? d.evidence : primary?.evidence ?? [];
  const counter = d.counterargument || (usingClosing ? closingRec?.counterargument : primary?.counterargument) || "";
  const quoteAt = contract ? d.asOf - contract.quoteAgeMs : null;
  const isSetup = d.state === "CALL SETUP" || d.state === "PUT SETUP";
  const strategyName = usingClosing ? "Strike flip (closing window)" : primary?.name ?? null;
  const exitRules = usingClosing && closingRec ? closingRec.exitPlan : primary?.exitRules ?? [];

  return (
    <Collapsible
      id={id}
      title="Decision record"
      meta={
        <>
          <span className={`state-${cls}`} style={{ fontWeight: 600 }}>
            {d.state}
          </span>
          <span>decision v{d.version}</span>
          <span>{fmtTime(d.asOf)} ET</span>
          <span>
            <Countdown target={d.expiresAt} now={now} />
          </span>
        </>
      }
    >
      <div className="facts">
        <Fact label="Record id" value={<span style={{ fontSize: "var(--fs-xs)" }}>{d.id}</span>} meta={d.previousId ? `previous ${d.previousId}` : "first record of the day"} />
        <Fact label="Inputs digest" value={d.inputsDigest} meta="hash of the inputs this record was computed from" />
        <Fact label="Phase" text value={`${PHASE_LABEL[d.phase as SessionPhase] ?? d.phase}, ${d.mode} data`} />
        <Fact label="Evaluated" value={fmtTime(d.asOf)} meta={`${fmtMs(Math.max(0, now - d.asOf))} ago`} />
        <Fact label="Expires" value={fmtTime(d.expiresAt)} meta="a new record is written on a material change or at expiry" />
      </div>

      {(strategyName || contract) && (
        <div>
          <div className="section-title">Candidate</div>
          <div className="decision-contract" style={{ padding: 0 }}>
            {contract ? (
              <span className="decision-contract-name" title={contract.osi}>
                {fmtContract(contract.osi)}
              </span>
            ) : null}
            {strategyName ? <span>{strategyName}</span> : null}
            {primary ? <span className="chip chip-quiet">{primary.lifecycle}</span> : null}
            {contract?.is0dte ? <span className="chip chip-quiet">0DTE</span> : null}
            {usingClosing && closingRec ? <span className="chip chip-quiet">{closingRec.mode === "resale" ? "resale" : "hold to settlement"}</span> : null}
          </div>
        </div>
      )}

      {(primary || usingClosing) && (
        <div className="facts">
          <Fact label="Entry condition" text value={usingClosing && closingRec ? closingRec.entryCondition : primary?.triggerCondition ?? <NA />} />
          {primary && !usingClosing ? <Fact label="Entry zone (SPX)" value={primary.entryZone ? `${fmtPts(primary.entryZone.low)} – ${fmtPts(primary.entryZone.high)}` : <NA reason="no zone for this family" />} /> : null}
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
          {primary ? <Fact label="Validation" value={primary.validation} meta="from the evidence ledger" /> : usingClosing && closingRec ? <Fact label="Validation" value={closingRec.validation} /> : null}
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

      {exitRules.length > 0 && (
        <div>
          <div className="section-title">Exit rules</div>
          <ul className="reasons small">
            {exitRules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {d.whyWait.length > 0 && (
        <div>
          <div className="section-title">{d.state === "MANAGE EXISTING POSITION" ? "Open position signals" : "Why wait?"}</div>
          <ul className="reasons small">
            {d.whyWait.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {d.passReasons.length > 0 && (
        <div>
          <div className="section-title">{d.state === "PASS" ? "Why pass?" : "Pass conditions recorded (overridden by the closing-window module)"}</div>
          <ul className="reasons small">
            {d.passReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {counter ? (
        <div className="counter">
          <h3>Strongest counterargument</h3>
          <p className="small">{counter}</p>
        </div>
      ) : null}

      <div>
        <div className="section-title">Evidence</div>
        <EvidenceList evidence={evidence} />
      </div>

      {usingClosing && closingRec && closingRec.rationale.length > 0 ? (
        <div>
          <div className="section-title">Closing-window rationale</div>
          <ul className="reasons small">
            {closingRec.rationale.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {(d.rankingNotes.length > 0 || d.rankingAssumptions.length > 0) && (
        <div>
          <div className="section-title">Ranking assumptions</div>
          <ul className="reasons small">
            {d.rankingNotes.map((n, i) => (
              <li key={`n${i}`} className="muted">
                {n}
              </li>
            ))}
            {d.rankingAssumptions.map((a, i) => (
              <li key={`a${i}`}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <Notes notes={d.dataNotes} title="Data notes" />
    </Collapsible>
  );
}
