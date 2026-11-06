import { CLOSING_METHOD_NOTES, subWindowFor, type ClosingSubWindow } from "@predictit/engine";
import { api } from "../api/client";
import { useServer, useServerNow } from "../api/context";
import { ModeBadge, stateClass, ValidationChip } from "../components/Badges";
import { LearningBox } from "../components/Grades";
import { Notes } from "../components/Notes";
import { Empty, Fact, Panel, Stat } from "../components/Panel";
import { StrikeLadder } from "../components/StrikeLadder";
import { LeanStrip } from "../components/LeanStrip";
import { useFetch } from "../lib/useFetch";
import { fmtClock, fmtContract, fmtMs, fmtPremium, fmtPts, fmtSignedPts, fmtSignedUsd, fmtTime, fmtUsd } from "../lib/format";

const WINDOWS: Array<{ id: ClosingSubWindow; label: string }> = [
  { id: "pre", label: "pre" },
  { id: "3:50-3:55", label: "3:50–3:55" },
  { id: "3:55-3:58", label: "3:55–3:58" },
  { id: "3:58-3:59", label: "3:58–3:59" },
  { id: "3:59-4:00", label: "3:59–4:00" },
  { id: "closed", label: "closed" },
];

export function ClosingView() {
  const { state: s } = useServer();
  const now = useServerNow();
  const grades = useFetch((sig) => api.grades(sig), "grades", 60_000);
  if (!s) return <Empty>Connecting…</Empty>;
  const c = s.closing;
  const liveSub = subWindowFor(s.clock);
  const sub = c?.subWindow ?? liveSub;
  const secondsToClose = (s.clock.session.closeMs - now) / 1000;
  const idx = WINDOWS.findIndex((w) => w.id === sub);
  const preview = !c && s.clock.minutesToClose > 20;
  const rec = c?.recommendation ?? null;
  const contract = rec?.contract ?? null;

  const head = (
    <>
      <div className="view-head">
        <h1>Closing window</h1>
        <p className="panel-meta">
          <span>{s.clock.session.isTradingDay ? `close ${fmtTime(s.clock.session.closeMs)} ET${s.clock.session.isEarlyClose ? " (early close)" : ""}` : "not a trading day"}</span>
          <ModeBadge mode={c?.mode ?? s.mode} />
        </p>
      </div>
      <LeanStrip lean={s.decision?.lean} />
      <Panel title="Sub-window" meta={c ? <span>assessed {fmtTime(c.asOf)} ET; spot {fmtPts(c.spot, 2)} ({fmtMs(c.spotAgeMs)} old at assessment)</span> : <span>from the server clock</span>}>
        <div className="subwindows" role="list" aria-label="Closing sub-windows">
          {WINDOWS.map((w, i) => (
            <div key={w.id} role="listitem" className={`subwindow${w.id === sub ? " subwindow-active" : i < idx ? " subwindow-past" : ""}`} aria-current={w.id === sub ? "step" : undefined}>
              {w.label}
            </div>
          ))}
        </div>
        <div className="row" style={{ alignItems: "baseline" }}>
          <span className="big-num" aria-live="off">
            {secondsToClose > 0 ? fmtClock(secondsToClose) : "closed"}
          </span>
          <span className="muted small">{secondsToClose > 0 ? "to the close (server clock)" : `closed at ${fmtTime(s.clock.session.closeMs)} ET`}</span>
        </div>
      </Panel>
      {grades.data ? <LearningBox learner={grades.data.closing.learner} /> : null}
    </>
  );

  if (preview || !c) {
    return (
      <>
        {head}
        <Panel title={preview ? "Preview — what this workspace will do" : "Not assessed"}>
          {preview ? (
            <>
              <p>
                From 20 minutes before the close the engine assesses the final-ten-minutes "strike flip" module: whether SPX is crossing, holding or failing at a listed strike into the PM settlement of today's SPXW contracts. The window itself opens at {fmtTime(s.clock.session.closeMs - 10 * 60_000)} ET.
              </p>
              <ul className="reasons">
                <li>A ladder of nearby strikes with crossings, dwell, speed and a modelled probability of closing above each one.</li>
                <li>Call and put quotes per strike with breakeven, required move, fair value with and without drift, modelled edge and execution feasibility (resale versus hold-to-settlement).</li>
                <li>A recommendation (CALL SETUP / PUT SETUP / WAIT / PASS) with an entry condition, invalidation, exit plan, rationale and counterargument, refreshed every 20 seconds while the window is open.</li>
                <li>The final minute always passes: entry delay, quote changes and broker cut-offs leave no practical exit.</li>
              </ul>
              <p className="small muted">The assessment starts when fewer than 20 minutes remain; until then nothing here is computed.</p>
            </>
          ) : (
            <p className="muted">n/a — no closing assessment in the current decision ({s.decision ? "outside the assessment window or no data" : "no decision yet"}).</p>
          )}
        </Panel>
        <Panel title="Method notes">
          <ul className="reasons small">
            {CLOSING_METHOD_NOTES.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Panel>
      </>
    );
  }

  const cls = rec ? stateClass(rec.state) : "pass";
  return (
    <>
      {head}
      {rec && (
        <section className={`panel decision decision-${cls}`} aria-label="Closing recommendation">
          <div className="decision-top">
            <h2 className={`decision-state state-${cls}`} style={{ fontSize: 32 }}>
              {rec.state}
            </h2>
            <div className="decision-expiry">
              {now > rec.expiresAt ? <span className="decision-expired">EXPIRED — awaiting refresh</span> : <span>refresh due {fmtTime(rec.expiresAt)} ET</span>}
              <span className="faint xs">assessed {fmtTime(c.asOf)} ET</span>
            </div>
          </div>
          {contract ? (
            <div className="decision-contract">
              <span className="decision-contract-name" title={contract.osi}>
                {fmtContract(contract.osi)}
              </span>
              <span className="chip chip-neutral">{rec.mode === "resale" ? "resale before the close" : "hold to settlement"}</span>
              <ValidationChip validation={rec.validation} />
            </div>
          ) : null}
          <div className="decision-body">
            {contract ? (
              <div className="facts">
                <Fact label="Entry (ask)" value={fmtPremium(contract.ask)} meta={`bid ${fmtPremium(contract.bid)}, size ${contract.bidSize}×${contract.askSize}, quote ${fmtMs(contract.quoteAgeMs)} old at assessment`} />
                <Fact label="Risk per contract" value={fmtUsd(contract.ask * 100)} />
                <Fact label="Breakeven settlement" value={fmtPts(contract.breakevenSettle, 2)} meta={`needs ${fmtSignedPts(contract.requiredMovePts)} pts`} />
                <Fact label="Model P(ITM at settlement)" value={`${(contract.pItm * 100).toFixed(0)}%`} meta="normal (Bachelier) model, not calibrated" />
                <Fact label="Fair value no drift / with drift" value={`${fmtPremium(contract.fairNoDrift)} / ${fmtPremium(contract.fairWithDrift)}`} meta={`edge after costs ${fmtSignedPts(contract.edgeNoDrift, 2)} / ${fmtSignedPts(contract.edgeWithDrift, 2)} pts`} />
                <Fact label="Feasibility" text value={`resale ${contract.feasibility.resale}, hold ${contract.feasibility.hold}${contract.feasibility.reasons.length ? ` — ${contract.feasibility.reasons.join("; ")}` : ""}`} />
              </div>
            ) : null}
            {rec.entryCondition ? <Fact label="Entry condition" text value={rec.entryCondition} /> : null}
            {rec.invalidation ? <Fact label="Invalidation" text value={rec.invalidation} /> : null}
            {rec.exitPlan.length > 0 && (
              <div>
                <div className="section-title">Exit plan</div>
                <ul className="reasons">
                  {rec.exitPlan.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {rec.rationale.length > 0 && (
              <div>
                <div className="section-title">{rec.state === "PASS" ? "Pass reasons" : "Rationale"}</div>
                <ul className="reasons">
                  {rec.rationale.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {rec.counterargument ? (
              <div className="counter">
                <h3>Strongest counterargument</h3>
                <p>{rec.counterargument}</p>
              </div>
            ) : null}
            {c.passReasons.length > 0 && rec.state !== "PASS" && (
              <div>
                <div className="section-title">Pass reasons</div>
                <ul className="reasons">
                  {c.passReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            <Notes notes={c.notes} title="Data quality" />
          </div>
        </section>
      )}

      <div className="grid-2">
        <Panel title="Remaining move" meta={<span>{Math.round(c.remaining.sec)}s after the assumed entry delay</span>}>
          <div className="stats">
            <Stat label="σ implied (ATM straddle)" value={c.remaining.sigmaIvPts !== null ? `${fmtPts(c.remaining.sigmaIvPts, 1)} pts` : "n/a"} meta={c.remaining.straddleMid !== null ? `straddle mid ${fmtPremium(c.remaining.straddleMid)}` : "straddle unavailable"} />
            <Stat label="σ realized (×seasonality)" value={c.remaining.sigmaRvPts !== null ? `${fmtPts(c.remaining.sigmaRvPts, 1)} pts` : "n/a"} meta="needs ≥4 min of path" />
            <Stat label="σ used" value={`${fmtPts(c.remaining.sigmaUsedPts, 1)} pts`} meta="max(implied, realized) ⊕ settlement noise" />
            <Stat label="Drift assumed" value={`${fmtSignedPts(c.remaining.driftPts, 1)} pts`} meta="3-min speed × remaining × persistence" />
          </div>
          <Fact label="Eligible expiry" value={c.eligibleExpiry ?? "n/a — no PM-settled SPX contract expiring today"} />
        </Panel>
        <Panel title="Confirmation">
          <p>{c.confirmation.text}</p>
          <div className="row">
            <span className={`chip ${c.confirmation.spy === "confirms" ? "chip-ok" : c.confirmation.spy === "diverges" ? "chip-bad" : "chip-neutral"}`}>SPY {c.confirmation.spy}</span>
            <span className={`chip ${c.confirmation.es === "confirms" ? "chip-ok" : c.confirmation.es === "diverges" ? "chip-bad" : "chip-neutral"}`}>ES {c.confirmation.es}</span>
          </div>
          {c.confirmation.es === "n/a" ? <p className="xs muted">ES is n/a: no futures feed is connected.</p> : null}
        </Panel>
      </div>

      {contract ? (
        <Panel title="Settlement scenarios" meta={<span>{fmtContract(contract.osi)} bought at {fmtPremium(contract.ask)}; σ = {fmtPts(c.remaining.sigmaUsedPts, 1)} pts</span>}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col" className="num">
                    move (pts)
                  </th>
                  <th scope="col" className="num">
                    settlement
                  </th>
                  <th scope="col" className="num">
                    P&amp;L per contract
                  </th>
                </tr>
              </thead>
              <tbody>
                {contract.settlementScenarios.map((sc, i) => (
                  <tr key={i}>
                    <td>{["−2σ", "−1σ", "flat", "+1σ", "+2σ"][i] ?? `#${i}`}</td>
                    <td className="num">{fmtSignedPts(sc.move)}</td>
                    <td className="num">{fmtPts(sc.settle, 2)}</td>
                    <td className={`num ${sc.pnl > 0 ? "pos" : sc.pnl < 0 ? "neg" : ""}`}>{fmtSignedUsd(sc.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel title="Nearby strikes" meta={<span>{c.ladder.length} strikes; quotes as of assessment ({fmtTime(c.asOf)} ET)</span>}>
        <StrikeLadder ladder={c.ladder} recommendedStrike={rec?.strike ?? null} recommendedRight={rec?.direction === "call" ? "C" : rec?.direction === "put" ? "P" : null} />
        <p className="xs muted">"fair nd / wd" = modelled fair value with no drift / with the assumed drift; "edge wd" = fair (with drift) − ask − costs. Feasibility tooltips list the blocking reasons.</p>
      </Panel>

      <Panel title="Method notes">
        <ul className="reasons small">
          {CLOSING_METHOD_NOTES.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
