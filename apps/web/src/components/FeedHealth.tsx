import type { FeedHealth as FeedHealthT } from "../api/types";
import { fmtAgo, fmtMs, fmtTime } from "../lib/format";

const NAMES: Record<string, string> = { schwab: "Schwab", "cboe-delayed": "Cboe delayed" };

function status(f: FeedHealthT): "ok" | "err" | "idle" {
  if (f.consecutiveErrors > 0) return "err";
  if (f.lastOkAt !== null) return "ok";
  return "idle";
}

/** Compact chips for the status bar. */
export function FeedChips({ feeds, now }: { feeds: Record<string, FeedHealthT>; now: number }) {
  return (
    <>
      {Object.values(feeds).map((f) => {
        const st = status(f);
        const title = `${NAMES[f.source] ?? f.source}: last OK ${f.lastOkAt ? fmtTime(f.lastOkAt) : "never"}; latency ${fmtMs(f.lastLatencyMs)}; ${f.consecutiveErrors} consecutive errors${f.lastError ? `; last error: ${f.lastError}` : ""}`;
        return (
          <span key={f.source} className={`feedchip feedchip-${st}`} title={title}>
            <span className="feedchip-dot" aria-hidden="true" />
            <span>{NAMES[f.source] ?? f.source}</span>
            <span>{f.lastOkAt ? fmtAgo(now - f.lastOkAt) : "no data"}</span>
            {f.lastLatencyMs !== null ? <span>{fmtMs(f.lastLatencyMs)}</span> : null}
            {f.consecutiveErrors ? <span>×{f.consecutiveErrors} err</span> : null}
          </span>
        );
      })}
    </>
  );
}

/** Full panel body for Settings. */
export function FeedHealthTable({ feeds, now }: { feeds: Record<string, FeedHealthT>; now: number }) {
  const rows = Object.values(feeds);
  if (!rows.length) return <p className="muted small">No feeds reported.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th scope="col">Feed</th>
            <th scope="col">Status</th>
            <th scope="col">Last OK</th>
            <th scope="col" className="num">
              Latency
            </th>
            <th scope="col" className="num">
              Errors
            </th>
            <th scope="col">Last error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.source}>
              <td>{NAMES[f.source] ?? f.source}</td>
              <td>
                <span className={`chip ${status(f) === "ok" ? "chip-ok" : status(f) === "err" ? "chip-bad" : "chip-neutral"}`}>{status(f)}</span>
              </td>
              <td className="mono">{f.lastOkAt ? `${fmtTime(f.lastOkAt)} (${fmtAgo(now - f.lastOkAt)})` : "never"}</td>
              <td className="num">{fmtMs(f.lastLatencyMs)}</td>
              <td className="num">{f.consecutiveErrors}</td>
              <td className="wrap small">{f.lastError ? `${f.lastErrorAt ? fmtTime(f.lastErrorAt) + " " : ""}${f.lastError}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
