import type { IndicatorFamily, LeanResult } from "@predictit/engine";
import { api } from "../api/client";
import { useServer, useServerNow } from "../api/context";
import { leanClass } from "../components/LeanStrip";
import { Empty, Panel, Stat } from "../components/Panel";
import { useFetch } from "../lib/useFetch";
import { fmtAgo, fmtNum, fmtPct, fmtSignedPct, fmtTime } from "../lib/format";

const FAMILY_ORDER: IndicatorFamily[] = ["momentum", "structure", "mean-reversion", "positioning", "flow", "cross-market", "calendar"];
const EVIDENCE_TEXT: Record<string, string> = { A: "A — mechanics", B: "B — published", C: "C — practitioner", D: "D — our in-sample daily study" };

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(1, Math.abs(score)) * 50;
  return (
    <div>
      <div className="score-bar" role="img" aria-label={`lean score ${score.toFixed(2)} on a scale from minus one to plus one`}>
        <span className="score-zero" />
        <span className={`score-fill ${score >= 0 ? "score-fill-up" : "score-fill-down"}`} style={score >= 0 ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }} />
      </div>
      <div className="score-axis">
        <span>−1 (down)</span>
        <span>0</span>
        <span>+1 (up)</span>
      </div>
    </div>
  );
}

function Votes({ lean }: { lean: LeanResult }) {
  const groups = new Map<IndicatorFamily, LeanResult["votes"]>();
  for (const v of lean.votes) groups.set(v.family, [...(groups.get(v.family) ?? []), v]);
  const fams = [...FAMILY_ORDER.filter((f) => groups.has(f)), ...[...groups.keys()].filter((f) => !FAMILY_ORDER.includes(f))];
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th scope="col">Indicator</th>
            <th scope="col" className="num">
              vote
            </th>
            <th scope="col" className="num">
              weight
            </th>
            <th scope="col" className="num">
              contribution
            </th>
            <th scope="col">evidence</th>
            <th scope="col">reason</th>
          </tr>
        </thead>
        <tbody>
          {fams.map((f) => (
            <GroupRows key={f} family={f} rows={groups.get(f)!} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ family, rows }: { family: IndicatorFamily; rows: LeanResult["votes"] }) {
  return (
    <>
      <tr>
        <th scope="rowgroup" colSpan={6} style={{ textAlign: "left", background: "var(--surface-3)" }}>
          {family}
        </th>
      </tr>
      {rows.map((v) => (
        <tr key={v.id} className={v.vote === null ? "row-bad" : ""}>
          <td>
            {v.label} <span className="xs muted mono">{v.id}</span>
          </td>
          <td className={`num ${v.vote !== null && v.vote > 0 ? "pos" : v.vote !== null && v.vote < 0 ? "neg" : ""}`}>{v.vote === null ? "n/a" : v.vote.toFixed(2)}</td>
          <td className="num">{v.weight.toFixed(2)}</td>
          <td className={`num ${v.contribution > 0 ? "pos" : v.contribution < 0 ? "neg" : ""}`}>{v.contribution.toFixed(2)}</td>
          <td title={EVIDENCE_TEXT[v.evidence]}>{v.evidence}</td>
          <td className="wrap">{v.reason}</td>
        </tr>
      ))}
    </>
  );
}

export function LeanView() {
  const { state: s } = useServer();
  const now = useServerNow();
  const ledger = useFetch((sig) => api.lean(sig), "lean", 60_000);
  const lean = s?.decision?.lean;
  if (!s) return <Empty>Connecting…</Empty>;
  const L = ledger.data;
  const horizons = L ? Object.entries(L.stats.horizons) : [];
  const maxW = L ? Math.max(1, ...L.stats.indicators.map((i) => Math.max(i.weight, i.prior))) : 1;
  return (
    <>
      <div className="view-head">
        <h1>Market lean</h1>
        <p>A transparent ensemble: each indicator votes in [−1, +1]; the lean is the weight-normalised vote. Weights adapt online from scored predictions, bounded. The lean never produces an entry by itself.</p>
      </div>
      {lean ? (
        <Panel
          title="Current lean"
          meta={
            <>
              <span>as of {fmtTime(lean.asOf)} ET ({fmtAgo(now - lean.asOf)})</span>
              <span>{lean.available} indicators available</span>
              <span>{lean.validation}</span>
            </>
          }
        >
          <div className="row">
            <span className={leanClass(lean.direction)} style={{ fontSize: "var(--fs-md)" }}>
              {lean.direction}
              {lean.strength !== "none" ? ` · ${lean.strength}` : ""}
            </span>
            <span className="small muted">score {lean.score.toFixed(2)}; {fmtPct(lean.agreement, 0)} of voting indicators agree</span>
          </div>
          <ScoreBar score={lean.score} />
          <div className="grid-2">
            <div>
              <div className="section-title">For the lean</div>
              {lean.top.length ? (
                <ul className="reasons small">
                  {lean.top.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">No non-zero votes.</p>
              )}
            </div>
            <div>
              <div className="section-title">Against the lean</div>
              {lean.against.length ? (
                <ul className="reasons small">
                  {lean.against.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">No dissenting votes.</p>
              )}
            </div>
          </div>
          <Votes lean={lean} />
        </Panel>
      ) : (
        <Empty>n/a — the current decision carries no lean{s.decision ? " (record predates the ensemble)" : " (no decision yet)"}.</Empty>
      )}

      <Panel title="Prospective scoring" meta={L ? <span>{L.pending} pending predictions; η {L.config.eta}, bounds ×{L.config.minMult}–×{L.config.maxMult}, decay {L.config.decay}</span> : undefined}>
        {ledger.error && !L ? <p className="form-status form-status-err">{ledger.error}</p> : null}
        {!L ? (
          <p className="muted small">Loading the prediction ledger…</p>
        ) : (
          <>
            <p className="small">{L.stats.note}</p>
            {!horizons.length ? (
              <p className="muted small">No scored predictions yet.</p>
            ) : (
              <div className="stats">
                {horizons.map(([h, st]) => (
                  <Stat key={h} label={`Hit rate, ${h}`} value={st.n ? `${fmtPct(st.hitRate, 0)} (${fmtPct(st.ci[0], 0)}–${fmtPct(st.ci[1], 0)})` : "n/a"} meta={`n ${st.n}, flat ${st.flat}; Brier ${fmtNum(st.brier, 3)} vs ${st.baselineBrier} baseline; 95% Wilson interval`} />
                ))}
                <Stat label="Calibrated probability" value={L.stats.calibratedProbabilityAvailable ? "available" : "withheld"} meta="shown only once the ledger is large enough" />
              </div>
            )}
            <div>
              <div className="section-title">Indicator weights (adapt online, bounded)</div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Indicator</th>
                      <th scope="col">weight vs prior</th>
                      <th scope="col" className="num">
                        weight
                      </th>
                      <th scope="col" className="num">
                        prior
                      </th>
                      <th scope="col" className="num">
                        scored
                      </th>
                      <th scope="col" className="num">
                        hit rate
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {L.stats.indicators.map((i) => (
                      <tr key={i.id}>
                        <td>
                          {i.label} <span className="xs muted mono">{i.id}</span>
                        </td>
                        <td>
                          <span className="wbar" aria-hidden="true">
                            <span className="wbar-fill" style={{ width: `${(i.weight / maxW) * 100}%` }} />
                            <span className="wbar-prior" style={{ left: `${(i.prior / maxW) * 100}%` }} title="prior" />
                          </span>
                          <span className="xs muted">{i.weight >= i.prior ? "+" : "−"}{fmtPct(Math.abs(i.weight / i.prior - 1), 0)} vs prior</span>
                        </td>
                        <td className="num">{i.weight.toFixed(2)}</td>
                        <td className="num">{i.prior.toFixed(2)}</td>
                        <td className="num">{i.n}</td>
                        <td className="num">{i.hitRate !== null ? fmtPct(i.hitRate, 0) : "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="section-title">Recent scored predictions</div>
              {!L.recent.length ? (
                <p className="muted small">None scored yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th scope="col">At (ET)</th>
                        <th scope="col" className="num">
                          horizon
                        </th>
                        <th scope="col" className="num">
                          score
                        </th>
                        <th scope="col">outcome</th>
                        <th scope="col" className="num">
                          return
                        </th>
                        <th scope="col">hit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...L.recent].sort((a, b) => b.at - a.at).map((p) => (
                        <tr key={p.id}>
                          <td className="mono">{fmtTime(p.at)}</td>
                          <td className="num">{p.horizonMin} min</td>
                          <td className={`num ${p.score > 0 ? "pos" : p.score < 0 ? "neg" : ""}`}>{p.score.toFixed(2)}</td>
                          <td>{p.outcome}</td>
                          <td className="num">{fmtSignedPct(p.ret, 2)}</td>
                          <td>{p.hit === null ? <span className="chip chip-neutral">flat</span> : p.hit ? <span className="chip chip-ok">hit</span> : <span className="chip chip-bad">miss</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
