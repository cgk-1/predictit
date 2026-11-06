import type { CleanSummary, LeanResult, SRLevel } from "@predictit/engine";
import { Fact } from "./Panel";
import { fmtPct, fmtPts, fmtSignedPts, fmtTime } from "../lib/format";

/**
 * The engine's "clean answer" (summary + lean). Records written before these fields existed lack them, so the
 * block renders nothing rather than inventing a lean.
 */
export function SummaryBlock({ summary, lean }: { summary: CleanSummary | undefined; lean: LeanResult | undefined }) {
  if (!summary || !lean) return null;
  const dirCls = summary.direction === "UP" ? "chip chip-call" : summary.direction === "DOWN" ? "chip chip-put" : "chip chip-neutral";
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <span className={dirCls} title={`lean score ${lean.score.toFixed(2)} from ${lean.available} available indicators`}>
          lean {summary.direction} {summary.strength !== "none" ? `(${summary.strength})` : ""}
        </span>
        <span className="small muted">
          {fmtPct(summary.agreement, 0)} of voting indicators agree; score {lean.score.toFixed(2)}; {lean.validation}
        </span>
      </div>
      <p>{summary.actionText}</p>
      <div className="facts">
        <Fact
          label="Expected move (1σ)"
          value={
            summary.expectedMove.toHorizonSigmaPts !== null
              ? `±${fmtPts(summary.expectedMove.toHorizonSigmaPts, 1)} pts over ${summary.expectedMove.horizonMinutes ?? "?"} min`
              : summary.expectedMove.toCloseSigmaPts !== null
                ? `±${fmtPts(summary.expectedMove.toCloseSigmaPts, 1)} pts to the close`
                : "n/a"
          }
          meta={`${summary.expectedMove.source}${summary.expectedMove.toCloseSigmaPts !== null && summary.expectedMove.toHorizonSigmaPts !== null ? `; ±${fmtPts(summary.expectedMove.toCloseSigmaPts, 1)} pts to the close` : ""}`}
        />
        <Fact label="Support" value={<SR levels={summary.support} />} />
        <Fact label="Resistance" value={<SR levels={summary.resistance} />} />
      </div>
      {summary.whenToSell.length > 0 && (
        <div>
          <div className="section-title">When to sell</div>
          <ul className="reasons small">
            {summary.whenToSell.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.why.length > 0 && (
        <div>
          <div className="section-title">Why (strongest votes)</div>
          <ul className="reasons small">
            {summary.why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.keyRisks.length > 0 && (
        <div>
          <div className="section-title">Key risks</div>
          <ul className="reasons small">
            {summary.keyRisks.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <span className="fact-meta">summary as of {fmtTime(summary.asOf)} ET</span>
    </div>
  );
}

function SR({ levels }: { levels: SRLevel[] }) {
  if (!levels.length) return <span className="na">n/a — no scored levels on this side</span>;
  return (
    <span className="stack" style={{ gap: 2 }}>
      {levels.slice(0, 3).map((l) => (
        <span key={`${l.kind}-${l.level}`} title={`${l.strengthText}; ${l.touches} touches, ${l.crossings} crossings${l.confluence.length ? `; confluence: ${l.confluence.join(", ")}` : ""}`}>
          {fmtPts(l.level, 1)} <span className="muted">({fmtSignedPts(l.distancePts)}, {l.label}, strength {Math.round(l.strength)})</span>
        </span>
      ))}
    </span>
  );
}
