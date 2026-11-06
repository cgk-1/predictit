import type { PerformanceReport } from "@predictit/engine";
import { api } from "../api/client";
import { Empty, Panel, Stat } from "../components/Panel";
import { DirectionChip } from "../components/Badges";
import { ClosingLearning, SelfGrading } from "../components/Grades";
import { useFetch } from "../lib/useFetch";
import { fmtAgo, fmtContract, fmtNum, fmtPct, fmtPremium, fmtPts, fmtSignedPct, fmtSignedUsd, fmtTime, fmtUsd } from "../lib/format";

const SMALL_SAMPLE = "No strategy here is validated out-of-sample; paper results are prospective and small-sample.";

function Metrics({ r }: { r: PerformanceReport }) {
  return (
    <div className="stats">
      <Stat label="Trades (n)" value={String(r.n)} />
      <Stat label="Net expectancy" value={fmtSignedUsd(r.netExpectancyUsd)} meta="mean P&L per trade after costs" />
      <Stat label="Total" value={fmtSignedUsd(r.totalUsd)} />
      <Stat label="Median return" value={fmtSignedPct(r.medianRetPct, 0)} meta="on premium at risk" />
      <Stat label="Win rate" value={fmtPct(r.winRate, 0)} />
      <Stat label="Payoff ratio" value={fmtNum(r.payoffRatio, 2)} meta="mean win / mean loss" />
      <Stat label="Full-loss rate" value={fmtPct(r.fullLossRate, 0)} meta="return ≤ −95%" />
      <Stat label="Max drawdown" value={fmtUsd(r.maxDrawdownUsd)} />
      <Stat label="Longest losing streak" value={String(r.longestLosingStreak)} />
      <Stat label="Top-winner share" value={fmtPct(r.topWinnerShare, 0)} meta="largest win / total" />
      <Stat label="p10 / p90 return" value={`${fmtSignedPct(r.p10RetPct, 0)} / ${fmtSignedPct(r.p90RetPct, 0)}`} />
    </div>
  );
}

function Breakdown<T extends { n: number; totalUsd: number; winRate?: number }>({ title, rows }: { title: string; rows: Record<string, T> }) {
  const entries = Object.entries(rows).sort((a, b) => b[1].n - a[1].n);
  return (
    <Panel title={title}>
      {!entries.length ? (
        <p className="muted small">No trades.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col" className="num">
                  n
                </th>
                <th scope="col" className="num">
                  total
                </th>
                <th scope="col" className="num">
                  win rate
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k}>
                  <td className="mono">{k}</td>
                  <td className="num">{v.n}</td>
                  <td className={`num ${v.totalUsd >= 0 ? "pos" : "neg"}`}>{fmtSignedUsd(v.totalUsd)}</td>
                  <td className="num">{v.winRate !== undefined ? fmtPct(v.winRate, 0) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function PerformanceView() {
  const q = useFetch((sig) => api.performance(sig), "performance", 60_000);
  const g = useFetch((sig) => api.grades(sig), "grades", 60_000);
  if (q.error && !q.data) return <Empty>Cannot load performance: {q.error}</Empty>;
  if (!q.data) return <Empty>Loading…</Empty>;
  const { trades, report, ledger } = q.data;
  const states = Object.entries(ledger.byState).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <div className="view-head">
        <h1>Performance</h1>
        <p className="panel-meta">
          <span>{ledger.decisions} ledger decisions</span>
          <span>{trades.length} closed paper trades</span>
          {q.fetchedAt ? <span>fetched {fmtAgo(Date.now() - q.fetchedAt)}</span> : null}
        </p>
      </div>
      {report.n < 50 ? (
        <div className="banner banner-warn" role="note">
          <strong>Small sample.</strong>
          <span>{SMALL_SAMPLE}</span>
        </div>
      ) : (
        <div className="banner" role="note">
          <span>Paper results are prospective; no strategy here is validated out-of-sample.</span>
        </div>
      )}
      <Panel title="Decision ledger by state">
        {!states.length ? (
          <p className="muted small">No decisions recorded yet.</p>
        ) : (
          <div className="stats">
            {states.map(([k, v]) => (
              <Stat key={k} label={k} value={String(v)} />
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Report">
        <Metrics r={report} />
      </Panel>
      <div className="grid-3">
        <Breakdown title="By family" rows={report.byFamily} />
        <Breakdown title="By phase" rows={report.byPhase} />
        <Breakdown title="By regime (trend/gamma)" rows={report.byRegime} />
      </div>
      {g.data ? (
        <>
          <SelfGrading g={g.data} />
          <ClosingLearning g={g.data} />
        </>
      ) : (
        <Panel title="Self-grading">{g.error ? <p className="form-status form-status-err">Cannot load grades: {g.error}</p> : <p className="muted small">Loading grades…</p>}</Panel>
      )}
      <Panel title="Trades" meta={<span>closed paper and manual positions</span>}>
        {!trades.length ? (
          <p className="muted small">No closed trades yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Family</th>
                  <th scope="col">Dir</th>
                  <th scope="col">Contract</th>
                  <th scope="col" className="num">
                    entry
                  </th>
                  <th scope="col" className="num">
                    exit
                  </th>
                  <th scope="col">exit reason</th>
                  <th scope="col" className="num">
                    P&amp;L
                  </th>
                  <th scope="col" className="num">
                    return
                  </th>
                  <th scope="col">phase</th>
                  <th scope="col">regime</th>
                </tr>
              </thead>
              <tbody>
                {[...trades].sort((a, b) => b.entryAt - a.entryAt).map((t) => (
                  <tr key={t.id} className={t.fillFailed ? "row-bad" : ""}>
                    <td className="mono">{t.date}</td>
                    <td className="mono">{t.family}</td>
                    <td>
                      <DirectionChip direction={t.direction} />
                    </td>
                    <td className="mono">{fmtContract(t.osi)}</td>
                    <td className="num">
                      {fmtPremium(t.entryPremium)} <span className="xs muted">{fmtTime(t.entryAt)} @ {fmtPts(t.entrySpot, 1)}</span>
                    </td>
                    <td className="num">
                      {fmtPremium(t.exitPremium)} <span className="xs muted">{fmtTime(t.exitAt)}</span>
                    </td>
                    <td className="wrap">{t.exitReason}</td>
                    <td className={`num ${t.pnlUsd >= 0 ? "pos" : "neg"}`}>{fmtSignedUsd(t.pnlUsd)}</td>
                    <td className="num">{fmtSignedPct(t.retPct, 0)}</td>
                    <td>{t.phase}</td>
                    <td className="mono">{t.regime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
