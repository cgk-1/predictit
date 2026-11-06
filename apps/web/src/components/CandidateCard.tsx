import type { GradeSummary, SetupCandidate } from "@predictit/engine";
import { DirectionChip, LifecycleChip } from "./Badges";
import { EvidenceList } from "./EvidenceList";
import { Notes } from "./Notes";
import { Fact } from "./Panel";
import { fmtPct, fmtPts, fmtSignedPct, fmtTime } from "../lib/format";

export type FamilyGrade = GradeSummary["byFamily"][string];

/** Prospective grade of a setup family: "graded n=12, 58% direction, −4% avg" or "not yet graded". */
export function gradeChipText(g: FamilyGrade | null | undefined): string {
  if (!g || !g.n) return "not yet graded";
  return `graded n=${g.n}, ${fmtPct(g.hitRate, 0)} direction, ${g.avgRetPct === null ? "avg n/a" : `${fmtSignedPct(g.avgRetPct, 0)} avg`}`;
}

export function GradeChip({ grade }: { grade: FamilyGrade | null | undefined }) {
  const text = gradeChipText(grade);
  return (
    <span className={`chip ${grade && grade.n ? "chip-neutral" : "chip-quiet"}`} title="Prospective paper grades of past recommendations in this family (direction hit rate; would-have return at the ask/bid with costs)">
      {text}
    </span>
  );
}

/**
 * One candidate setup. Header chips are limited to direction, lifecycle and the family's prospective grade
 * (`grade` undefined = grades not loaded yet, so no chip; null = loaded but none for this family).
 */
export function CandidateCard({ c, now, grade }: { c: SetupCandidate; now: number; grade?: FamilyGrade | null }) {
  const expired = now > c.expiresAt;
  return (
    <article className={`panel decision decision-${c.direction}`} aria-label={`${c.name} (${c.direction})`}>
      <div className="panel-head">
        <h3 style={{ fontSize: "var(--fs-lg)" }}>{c.name}</h3>
        <div className="row" style={{ gap: 6 }}>
          <DirectionChip direction={c.direction} />
          <LifecycleChip lifecycle={c.lifecycle} />
          {grade !== undefined ? <GradeChip grade={grade} /> : null}
        </div>
      </div>
      <div className="panel-body">
        <div className="panel-meta">
          <span>{c.family}</span>
          <span>{c.validation}</span>
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
          <p className="small">{c.counterargument}</p>
        </div>
        <Notes notes={c.dataNotes} />
      </div>
    </article>
  );
}
