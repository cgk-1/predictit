import { useState } from "react";
import type { ChangeEvent } from "@predictit/engine";
import { Panel } from "./Panel";
import { fmtTime, stripTimePrefix } from "../lib/format";
import { useStoredBool } from "../lib/prefs";

/** Raw server/system entries (tick errors, sweep failures) that are noise unless something is being debugged. */
export function isSystemEvent(c: ChangeEvent): boolean {
  if (c.kind !== "data") return false;
  const t = stripTimePrefix(c.text);
  return /^(Tick error|Grading sweep failed|On-demand evaluation failed)\b/.test(t);
}

export function ChangesFeed({ changes, title = "What changed?", limit = 10 }: { changes: ChangeEvent[]; title?: string; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  const [showSystem, setShowSystem] = useStoredBool("changes.system", false);
  const sorted = [...changes].sort((a, b) => b.at - a.at);
  const systemCount = sorted.filter(isSystemEvent).length;
  const visible = showSystem ? sorted : sorted.filter((c) => !isSystemEvent(c));
  const rows = showAll ? visible : visible.slice(0, limit);
  const hidden = visible.length - rows.length;
  return (
    <Panel
      title={title}
      meta={
        <div className="toolbar">
          <span>
            {visible.length} events, newest first
            {!showSystem && systemCount ? `, ${systemCount} system` : ""}
          </span>
          {visible.length > limit ? (
            <button type="button" className="btn btn-sm btn-ghost" aria-pressed={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? `Show newest ${limit}` : `Show all ${visible.length}`}
            </button>
          ) : null}
          {systemCount > 0 || showSystem ? (
            <button type="button" className="btn btn-sm btn-ghost" aria-pressed={showSystem} onClick={() => setShowSystem(!showSystem)}>
              {showSystem ? "Hide system events" : "Show system events"}
            </button>
          ) : null}
        </div>
      }
    >
      {!rows.length ? (
        <p className="muted small">Nothing has changed yet in this session.</p>
      ) : (
        <div className="feed">
          {rows.map((c, i) => (
            <div key={`${c.at}-${i}`} className={`feed-row${isSystemEvent(c) ? " feed-row-system" : ""}`}>
              <span className="ts" style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)" }}>
                {fmtTime(c.at)}
              </span>
              <span className="feed-kind">{c.kind}</span>
              <span>{stripTimePrefix(c.text)}</span>
            </div>
          ))}
          {hidden > 0 ? <p className="xs faint">{hidden} older events hidden.</p> : null}
        </div>
      )}
    </Panel>
  );
}
