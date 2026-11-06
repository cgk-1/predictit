import type { RegimeAssessment } from "@predictit/engine";
import { Notes } from "./Notes";
import { Panel } from "./Panel";
import { fmtNum, fmtTime, undash } from "../lib/format";

type Kind = "ok" | "bad" | "wait" | "neutral" | "faint";

function kindOf(label: string, value: string): Kind {
  if (value === "unknown") return "faint";
  switch (label) {
    case "trend":
      return value === "trend-up" ? "ok" : value === "trend-down" ? "bad" : "neutral";
    case "structure":
      return value.startsWith("breakout-up") ? "ok" : value.startsWith("breakout-down") ? "bad" : value.startsWith("failed") ? "wait" : "neutral";
    case "volatility":
      return value === "compression" ? "wait" : value === "expansion" ? "bad" : "neutral";
    case "liquidity":
      return value === "good" ? "ok" : value === "poor" ? "bad" : "wait";
    case "gamma":
      return value === "positive" ? "ok" : value === "negative" ? "bad" : "wait";
    case "confidence":
      return value === "high" ? "ok" : value === "low" ? "bad" : "wait";
    case "event":
      return value === "high" ? "bad" : value === "medium" ? "wait" : "neutral";
    default:
      return "neutral";
  }
}

function Row({ label, value, kind, extra }: { label: string; value: string; kind: Kind; extra?: string }) {
  const cls = kind === "faint" ? "chip chip-neutral" : `chip chip-${kind === "neutral" ? "neutral" : kind}`;
  return (
    <>
      <dt>{label}</dt>
      <dd className="prose">
        <span className={cls} style={kind === "faint" ? { color: "var(--text-3)" } : undefined}>
          {value}
        </span>
        {extra ? <span className="small muted"> {extra}</span> : null}
      </dd>
    </>
  );
}

export function RegimePanel({ regime, now }: { regime: RegimeAssessment | null; now: number }) {
  if (!regime) {
    return (
      <Panel title="Regime">
        <p className="muted">n/a — the engine has not evaluated a frame yet.</p>
      </Panel>
    );
  }
  const ev = regime.eventRisk;
  return (
    <Panel title="Regime" meta={<span>as of {fmtTime(regime.asOf)} ET ({Math.max(0, Math.round((now - regime.asOf) / 1000))}s ago)</span>}>
      <dl className="kv">
        <Row label="Trend" value={undash(regime.trend)} kind={kindOf("trend", regime.trend)} />
        <Row label="Structure" value={undash(regime.structure)} kind={kindOf("structure", regime.structure)} />
        <Row label="Volatility" value={regime.volatility} kind={kindOf("volatility", regime.volatility)} extra={regime.rvOverIv !== null ? `realized/implied ${fmtNum(regime.rvOverIv, 2)}` : "realized/implied n/a"} />
        <Row label="Liquidity" value={regime.liquidity} kind={kindOf("liquidity", regime.liquidity)} />
        <Row label="Gamma" value={undash(regime.gamma)} kind={kindOf("gamma", regime.gamma)} />
        <Row label="Participation" value={regime.participation} kind={kindOf("participation", regime.participation)} extra={regime.participation === "unknown" ? "breadth not available from connected feeds" : undefined} />
        <Row label="Event risk" value={ev.level} kind={kindOf("event", ev.level)} extra={ev.next ? `${ev.next.label} at ${fmtTime(ev.next.at)} ET${ev.minutesUntil !== null ? ` (in ${Math.round(ev.minutesUntil)} min)` : ""}` : "no scheduled events"} />
        <Row label="Data confidence" value={regime.dataConfidence} kind={kindOf("confidence", regime.dataConfidence)} />
      </dl>
      {regime.evidence.length > 0 && (
        <div>
          <div className="section-title">Evidence</div>
          <ul className="reasons small">
            {regime.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <Notes notes={regime.notes} />
    </Panel>
  );
}
