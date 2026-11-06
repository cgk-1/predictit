import type { ChangeEvent } from "@predictit/engine";
import { Panel } from "./Panel";
import { fmtTime, stripTimePrefix } from "../lib/format";

export function ChangesFeed({ changes, title = "What changed?", limit = 60 }: { changes: ChangeEvent[]; title?: string; limit?: number }) {
  const rows = [...changes].sort((a, b) => b.at - a.at).slice(0, limit);
  return (
    <Panel title={title} meta={<span>{changes.length} events, newest first</span>}>
      {!rows.length ? (
        <p className="muted small">Nothing has changed yet in this session.</p>
      ) : (
        <div className="feed">
          {rows.map((c, i) => (
            <div key={`${c.at}-${i}`} className="feed-row">
              <span className="ts" style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)" }}>
                {fmtTime(c.at)}
              </span>
              <span className="feed-kind">{c.kind}</span>
              <span>{stripTimePrefix(c.text)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
