import type { Evidence } from "@predictit/engine";
import { fmtTime } from "../lib/format";

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return <p className="small muted">No evidence lines recorded.</p>;
  return (
    <div className="evidence">
      {evidence.map((e, i) => (
        <EvidenceRow key={i} e={e} />
      ))}
    </div>
  );
}

function EvidenceRow({ e }: { e: Evidence }) {
  return (
    <>
      <span className="evidence-label">{e.label}</span>
      <span className="evidence-value">{e.value}</span>
      <span className="ts" title={`${e.source}, ${e.mode}`}>
        {fmtTime(e.at)} {e.mode === "LIVE" ? "" : e.mode.toLowerCase()}
      </span>
    </>
  );
}
