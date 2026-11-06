import type { ClosingLearnerSummary, GradesResponse } from "../api/types";
import { DirectionChip } from "./Badges";
import { Panel, Stat } from "./Panel";
import { fmtContract, fmtDateTime, fmtNum, fmtPct, fmtPts, fmtSignedPct, fmtSignedUsd, fmtTime } from "../lib/format";

function yesNo(v: boolean | null): string {
  return v === null ? "—" : v ? "yes" : "no";
}

/** Continuous self-grading of past recommendations: summary, by family, and the most recent grades. */
export function SelfGrading({ g, recent = 30 }: { g: GradesResponse; recent?: number }) {
  const s = g.summary;
  const fams = Object.entries(s.byFamily).sort((a, b) => b[1].n - a[1].n);
  const rows = [...g.grades].sort((a, b) => b.decidedAt - a.decidedAt).slice(0, recent);
  return (
    <Panel title="Self-grading" meta={<span>{s.n} graded recommendations</span>}>
      <p className="small muted" style={{ maxWidth: "80ch" }}>
        {s.note}
      </p>
      <div className="stats">
        <Stat label="Graded (n)" value={String(s.n)} />
        <Stat label="Direction hit rate" value={s.n ? fmtPct(s.directionHitRate, 0) : "n/a"} meta={s.n ? `95% Wilson ${fmtPct(s.directionCi[0], 0)}–${fmtPct(s.directionCi[1], 0)}` : "no grades yet"} />
        <Stat label="Invalidated first" value={s.n ? fmtPct(s.invalidationRate, 0) : "n/a"} meta="share that breached invalidation before the horizon" />
        <Stat label="Would-have return, avg" value={fmtSignedPct(s.avgWouldHaveRetPct, 0)} meta="ask at decision → bid at horizon, with costs" />
        <Stat label="Would-have return, median" value={fmtSignedPct(s.medianWouldHaveRetPct, 0)} />
      </div>
      <div>
        <div className="section-title">By family</div>
        {!fams.length ? (
          <p className="muted small">No graded families yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Family</th>
                  <th scope="col" className="num">
                    n
                  </th>
                  <th scope="col" className="num">
                    direction hit rate
                  </th>
                  <th scope="col" className="num">
                    avg would-have return
                  </th>
                  <th scope="col" className="num">
                    invalidated
                  </th>
                </tr>
              </thead>
              <tbody>
                {fams.map(([k, f]) => (
                  <tr key={k}>
                    <td className="mono">{k}</td>
                    <td className="num">{f.n}</td>
                    <td className="num">{fmtPct(f.hitRate, 0)}</td>
                    <td className={`num ${f.avgRetPct !== null ? (f.avgRetPct >= 0 ? "pos" : "neg") : ""}`}>{fmtSignedPct(f.avgRetPct, 0)}</td>
                    <td className="num">{fmtPct(f.invalidationRate, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <div className="section-title">Recent grades</div>
        {!rows.length ? (
          <p className="muted small">Nothing graded yet: a recommendation is graded once its horizon has passed.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Decided</th>
                  <th scope="col">Family</th>
                  <th scope="col">Dir</th>
                  <th scope="col">Contract</th>
                  <th scope="col" className="num">
                    underlying move
                  </th>
                  <th scope="col" className="num">
                    would-have return
                  </th>
                  <th scope="col">invalidated</th>
                  <th scope="col">provisional</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.decisionId} className={r.provisional ? "row-quiet" : ""}>
                    <td className="mono">{fmtDateTime(r.decidedAt)}</td>
                    <td className="mono">{r.family}</td>
                    <td>
                      <DirectionChip direction={r.direction} />
                    </td>
                    <td className="mono">{fmtContract(r.osi)}</td>
                    <td className={`num ${r.directionHit ? "pos" : "neg"}`} title={`${fmtPts(r.spotAtDecision, 2)} → ${fmtPts(r.spotAtHorizon, 2)} over ${r.horizonMinutes} min`}>
                      {fmtSignedPct(r.underlyingRetPct, 2)}
                    </td>
                    <td className={`num ${r.wouldHaveRetPct !== null ? (r.wouldHaveRetPct >= 0 ? "pos" : "neg") : ""}`}>
                      {fmtSignedPct(r.wouldHaveRetPct, 0)}
                      {r.wouldHavePnlUsd !== null ? <span className="xs muted"> {fmtSignedUsd(r.wouldHavePnlUsd)}</span> : null}
                    </td>
                    <td>{r.invalidated ? `yes${r.invalidatedAt ? ` at ${fmtTime(r.invalidatedAt)}` : ""}` : "no"}</td>
                    <td>{r.provisional ? "yes (no exit quote yet)" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ParamRow({ label, applied, base, dp = 2 }: { label: string; applied: number; base: number; dp?: number }) {
  const same = Math.abs(applied - base) < 10 ** -dp / 2;
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {fmtNum(applied, dp)} <span className="xs muted">{same ? "(base)" : `(base ${fmtNum(base, dp)})`}</span>
      </dd>
    </>
  );
}

/** Learned closing-window parameters currently applied, against their base values. */
export function LearnedParameters({ p }: { p: ClosingLearnerSummary["parameters"] }) {
  return (
    <dl className="kv">
      <ParamRow label="Seasonality multiplier" applied={p.seasonalityMultiplier} base={p.base.seasonalityMultiplier} />
      <ParamRow label="Drift persistence" applied={p.driftPersistence} base={p.base.driftPersistence} />
      <ParamRow label="Settlement noise (pts)" applied={p.settlementNoisePts} base={p.base.settlementNoisePts} />
    </dl>
  );
}

/** Short box for the Closing view: what the learner currently applies and how much it has learned from. */
export function LearningBox({ learner }: { learner: ClosingLearnerSummary }) {
  return (
    <Panel
      title="Learning"
      meta={
        <>
          <span>{learner.gradedSessions} graded sessions</span>
          <span>{learner.officialGaps} official settlements</span>
        </>
      }
    >
      <LearnedParameters p={learner.parameters} />
      <p className="xs muted">{learner.note}</p>
    </Panel>
  );
}

/** Closing-window self-grading and the bounded learner: calibration stats, patterns, sub-windows, parameters and recent grades. */
export function ClosingLearning({ g, recent = 30 }: { g: GradesResponse; recent?: number }) {
  const L = g.closing.learner;
  const patterns = Object.entries(L.patterns).sort((a, b) => b[1].n - a[1].n);
  const subs = Object.entries(L.subWindows).sort((a, b) => b[1].n - a[1].n);
  const rows = [...g.closing.grades].sort((a, b) => b.decidedAt - a.decidedAt).slice(0, recent);
  return (
    <Panel title="Closing-window learning" meta={<span>{L.gradedSessions} graded sessions</span>}>
      <p className="small muted" style={{ maxWidth: "80ch" }}>
        {L.note}
      </p>
      <div className="stats">
        <Stat label="Graded sessions" value={String(L.gradedSessions)} />
        <Stat label="Official settlement gaps" value={String(L.officialGaps)} meta="official close vs last tick, counted" />
        <Stat label="RMS z" value={fmtNum(L.rmsZ, 2)} meta="realized move / σ used; 1 = calibrated" />
        <Stat label="Drift slope" value={fmtNum(L.driftSlope, 2)} meta="realized move on assumed drift; 1 = fully realised" />
        <Stat label="RMS settlement gap" value={L.rmsSettlementGapPts !== null ? `${fmtPts(L.rmsSettlementGapPts, 2)} pts` : "n/a"} />
      </div>
      <div className="grid-2">
        <div>
          <div className="section-title">Per pattern</div>
          {!patterns.length ? (
            <p className="muted small">No pattern outcomes yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Pattern</th>
                    <th scope="col" className="num">
                      n
                    </th>
                    <th scope="col" className="num">
                      hit rate
                    </th>
                    <th scope="col" className="num">
                      95% CI
                    </th>
                    <th scope="col" className="num">
                      trust
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {patterns.map(([k, p]) => (
                    <tr key={k}>
                      <td className="mono">{k}</td>
                      <td className="num">{p.n}</td>
                      <td className="num">{fmtPct(p.hitRate, 0)}</td>
                      <td className="num">{p.ci ? `${fmtPct(p.ci[0], 0)}–${fmtPct(p.ci[1], 0)}` : "n/a"}</td>
                      <td className="num">{fmtNum(p.trust, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <div className="section-title">Per sub-window</div>
          {!subs.length ? (
            <p className="muted small">No sub-window outcomes yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Sub-window</th>
                    <th scope="col" className="num">
                      n
                    </th>
                    <th scope="col" className="num">
                      avg settle P&amp;L
                    </th>
                    <th scope="col" className="num">
                      bias hit rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map(([k, w]) => (
                    <tr key={k}>
                      <td className="mono">{k}</td>
                      <td className="num">{w.n}</td>
                      <td className={`num ${w.avgPnlUsd !== null ? (w.avgPnlUsd >= 0 ? "pos" : "neg") : ""}`}>{fmtSignedUsd(w.avgPnlUsd)}</td>
                      <td className="num">{fmtPct(w.hitRate, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="section-title">Parameters applied vs base</div>
        <LearnedParameters p={L.parameters} />
      </div>
      <div>
        <div className="section-title">Recent closing grades</div>
        {!rows.length ? (
          <p className="muted small">No closing-window records graded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Decided</th>
                  <th scope="col">Sub-window</th>
                  <th scope="col">Recommendation</th>
                  <th scope="col" className="num">
                    settlement
                  </th>
                  <th scope="col">official</th>
                  <th scope="col" className="num">
                    settle P&amp;L
                  </th>
                  <th scope="col">bias hit</th>
                  <th scope="col" className="num">
                    z
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.decisionId}-${r.official ? "o" : "p"}`} className={r.official ? "" : "row-quiet"}>
                    <td className="mono">{fmtDateTime(r.decidedAt)}</td>
                    <td className="mono">{r.subWindow}</td>
                    <td className="wrap small">
                      <div className="cell-wrap-sm">
                      {r.recommendation.state}
                      {r.recommendation.strike !== null ? ` ${r.recommendation.strike}${r.recommendation.right ?? ""}` : ""}
                      {r.recommendation.mode ? ` (${r.recommendation.mode})` : ""}
                      {r.recommendation.pattern ? <span className="xs muted"> {r.recommendation.pattern}</span> : null}
                      </div>
                    </td>
                    <td className="num">{fmtPts(r.settlement, 2)}</td>
                    <td>{r.official ? "yes" : "provisional"}</td>
                    <td className={`num ${r.settlePnlUsd !== null ? (r.settlePnlUsd >= 0 ? "pos" : "neg") : ""}`}>{fmtSignedUsd(r.settlePnlUsd)}</td>
                    <td>{yesNo(r.biasHit)}</td>
                    <td className="num">{fmtNum(r.z, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}
