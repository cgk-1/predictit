import type { SetupCandidate } from "@predictit/engine";
import { DirectionChip, LifecycleChip, ValidationChip } from "./Badges";
import { EvidenceList } from "./EvidenceList";
import { Notes } from "./Notes";
import { Fact } from "./Panel";
import { fmtPts, fmtTime } from "../lib/format";

export function CandidateCard({ c, now }: { c: SetupCandidate; now: number }) {
  const expired = now > c.expiresAt;
  return (
    <article className={`panel decision decision-${c.direction}`} aria-label={`${c.name} (${c.direction})`}>
      <div className="panel-head">
        <h3 style={{ fontSize: "var(--fs-lg)" }}>{c.name}</h3>
        <div className="row" style={{ gap: 6 }}>
          <DirectionChip direction={c.direction} />
          <LifecycleChip lifecycle={c.lifecycle} />
          <ValidationChip validation={c.validation} />
          <span className="chip chip-neutral">{c.family}</span>
        </div>
      </div>
      <div className="panel-body">
        <div className="panel-meta">
          <span>id {c.id}</span>
          <span>
            re-evaluate by {fmtTime(c.expiresAt)} ET{expired ? " (passed)" : ""}
          </span>
        </div>
        <div className="facts">
          <Fact label="Trigger" text value={c.triggerCondition} />
          <Fact label="Entry zone (SPX)" value={c.entryZone ? `${fmtPts(c.entryZone.low)} – ${fmtPts(c.entryZone.high)}` : "n/a"} />
          <Fact
            label="Invalidation"
            text
            value={
              <>
                <span className="mono">{fmtPts(c.invalidationLevel)}</span> — {c.invalidationText}
              </>
            }
          />
          <Fact label="Target (SPX)" value={c.targetLevel !== null ? fmtPts(c.targetLevel) : "n/a"} />
          <Fact label="Horizon" value={`${c.horizonMinutes} min`} />
          <Fact label="Preferred expiry" value={c.preferredExpiry} />
        </div>
        {c.exitRules.length > 0 && (
          <div>
            <div className="section-title">Exit rules</div>
            <ul className="reasons small">
              {c.exitRules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="section-title">Evidence</div>
          <EvidenceList evidence={c.evidence} />
        </div>
        <div className="counter">
          <h3>Counterargument</h3>
          <p>{c.counterargument}</p>
        </div>
        <Notes notes={c.dataNotes} />
      </div>
    </article>
  );
}
