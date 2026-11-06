import type { KeyLevel } from "@predictit/engine";
import { Panel } from "./Panel";
import { fmtPts, fmtSignedPts, fmtTime } from "../lib/format";

export function levelTagClass(kind: KeyLevel["kind"]): string {
  switch (kind) {
    case "gex-flip":
    case "largest-gex":
    case "high-oi-strike":
      return "lt-gex";
    case "call-wall":
      return "lt-wall-call";
    case "put-wall":
      return "lt-wall-put";
    case "prior-high":
    case "prior-low":
    case "prior-close":
    case "prior-week-high":
    case "prior-week-low":
    case "gap-fill":
      return "lt-prior";
    case "session-high":
    case "session-low":
    case "vwap":
    case "twap":
      return "lt-session";
    case "or-high":
    case "or-low":
      return "lt-or";
    default:
      return "lt-round";
  }
}

export function LevelsLadder({ levels, spot, spotTime, title = "Key levels" }: { levels: KeyLevel[]; spot: number | null; spotTime: number | null; title?: string }) {
  const sorted = [...levels].sort((a, b) => b.level - a.level);
  let nearestAbove: KeyLevel | null = null;
  let nearestBelow: KeyLevel | null = null;
  if (spot !== null) {
    for (const l of sorted) {
      if (l.level >= spot && (!nearestAbove || l.level < nearestAbove.level)) nearestAbove = l;
      if (l.level < spot && (!nearestBelow || l.level > nearestBelow.level)) nearestBelow = l;
    }
  }
  const rows: Array<{ kind: "level"; l: KeyLevel } | { kind: "spot" }> = [];
  let spotInserted = spot === null;
  for (const l of sorted) {
    if (!spotInserted && spot !== null && l.level < spot) {
      rows.push({ kind: "spot" });
      spotInserted = true;
    }
    rows.push({ kind: "level", l });
  }
  if (!spotInserted) rows.push({ kind: "spot" });

  return (
    <Panel title={title} meta={spot !== null ? <span>spot {fmtPts(spot, 2)} at {fmtTime(spotTime)} ET</span> : <span>spot n/a</span>}>
      {!levels.length ? (
        <p className="muted small">n/a — no levels yet (needs prior-day bars, opening range or a chain for GEX levels).</p>
      ) : (
        <div className="ladder" role="table" aria-label="Key levels ladder">
          {rows.map((r, i) =>
            r.kind === "spot" ? (
              <div key="spot" className="ladder-spot" role="row" style={{ display: "contents" }}>
                <div className="ladder-level">{fmtPts(spot, 2)}</div>
                <div className="ladder-dist">spot</div>
                <div className="ladder-label">SPX last</div>
                <div className="ladder-src">{fmtTime(spotTime)}</div>
              </div>
            ) : (
              <div key={`${r.l.kind}-${r.l.level}-${i}`} className={r.l === nearestAbove || r.l === nearestBelow ? "ladder-near" : ""} role="row" style={{ display: "contents" }}>
                <div className="ladder-level">
                  <span className={`level-tag ${levelTagClass(r.l.kind)}`} aria-hidden="true" />
                  {fmtPts(r.l.level, 1)}
                </div>
                <div className="ladder-dist" title="Distance from spot in index points">
                  {spot !== null ? fmtSignedPts(r.l.level - spot) : "n/a"}
                </div>
                <div className="ladder-label" title={r.l.label}>
                  {r.l.label}
                  {r.l === nearestAbove ? <span className="xs muted"> (nearest above)</span> : r.l === nearestBelow ? <span className="xs muted"> (nearest below)</span> : null}
                </div>
                <div className="ladder-src">{r.l.source}</div>
              </div>
            ),
          )}
        </div>
      )}
    </Panel>
  );
}
