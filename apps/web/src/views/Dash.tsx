/**
 * Dash — the terse view. Numbers and labels only; every sentence lives on Today.
 */
import { useServer, useServerNow } from "../api/context";
import { Empty } from "../components/Panel";
import { ModeBadge, stateClass } from "../components/Badges";
import { TimeframesCompact } from "../components/Timeframes";
import { fmtClock, fmtNum, fmtPts, fmtUsd } from "../lib/format";
import type { SRLevel } from "@predictit/engine";

function Tile({ label, value, sub, className, children }: { label: string; value?: React.ReactNode; sub?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <div className={`dash-tile${className ? ` ${className}` : ""}`}>
      <div className="dash-label">{label}</div>
      {value !== undefined ? <div className="dash-value">{value}</div> : null}
      {sub ? <div className="dash-sub">{sub}</div> : null}
      {children}
    </div>
  );
}

function shortLevelLabel(l: SRLevel): string {
  switch (l.kind) {
    case "prior-high":
      return "PDH";
    case "prior-low":
      return "PDL";
    case "prior-close":
      return "PDC";
    case "or-high":
      return "ORH";
    case "or-low":
      return "ORL";
    case "session-high":
      return "HOD";
    case "session-low":
      return "LOD";
    case "vwap":
      return "VWAP";
    case "twap":
      return "TWAP";
    case "gex-flip":
      return "γ flip";
    case "call-wall":
      return "call wall";
    case "put-wall":
      return "put wall";
    case "largest-gex":
      return "0DTE γ";
    case "gap-fill":
      return "gap";
    case "prior-week-high":
      return "PWH";
    case "prior-week-low":
      return "PWL";
    case "high-oi-strike":
      return "OI";
    default:
      return "round";
  }
}

function Levels({ label, levels, kind }: { label: string; levels: SRLevel[]; kind: "support" | "resistance" }) {
  return (
    <Tile label={label} className={`dash-levels dash-${kind}`}>
      {levels.length ? (
        <div className="dash-level-list">
          {levels.slice(0, 4).map((l) => (
            <div key={`${l.kind}-${l.level}`} className="dash-level">
              <span className="mono dash-level-num">{fmtPts(l.level)}</span>
              <span className="dash-level-tag">{shortLevelLabel(l)}</span>
              <span className="mono muted dash-level-dist">{l.distancePts >= 0 ? "+" : ""}{l.distancePts.toFixed(1)}</span>
              <span className="dash-level-str" title={`strength ${l.strength}`}>
                <span style={{ width: `${l.strength}%` }} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="dash-sub muted">none within 2%</div>
      )}
    </Tile>
  );
}

export function DashView() {
  const { state: s, loading } = useServer();
  const now = useServerNow();
  if (!s) return <Empty>{loading ? "Connecting…" : "No state yet."}</Empty>;
  const d = s.decision;
  if (!d) return <Empty>No decision yet.</Empty>;
  const sm = d.summary;
  const instQuote = sm.instrument === "SPY" ? s.spy : s.spx;
  const spot = instQuote?.last ?? null;
  const dp = sm.instrument === "SPY" ? 2 : 1;
  const act = sm.action;
  const hasSetup = act === "BUY CALL" || act === "BUY PUT";
  void act;
  const cls = act === "BUY CALL" ? "call" : act === "BUY PUT" ? "put" : act === "WAIT" ? "wait" : act === "PASS" ? "pass" : "manage";
  const move = sm.expectedMove.toCloseSigmaPts;
  const horizon = sm.expectedMove.toHorizonSigmaPts;
  const primary = d.primary;
  const c = sm.contract;
  const closing = d.closing;
  const inClosing = s.clock.inClosingWindow;
  const pos = s.positions[0] ?? null;
  const secondsToClose = Math.max(0, Math.round((s.clock.session.closeMs - now) / 1000));
  const reason = act === "PASS" ? d.passReasons[0] : act === "WAIT" ? d.whyWait[0] : null;
  const budget = s.settings.engine.maxPremiumPerContract;
  // the other instrument's own native decision: shown as a sign check only (levels and sizes are not comparable)
  const other = sm.instrument === "SPY" ? "SPX" : "SPY";
  const otherAct = s.instruments?.[other]?.decision?.summary?.action ?? null;
  const otherHasSetup = otherAct === "BUY CALL" || otherAct === "BUY PUT";
  const disagree = hasSetup && otherHasSetup && otherAct !== act;
  return (
    <div className="dash">
      <div className="dash-row dash-row-top">
        <Tile
          label={`Action · ${sm.instrument ?? "SPX"}`}
          className={`dash-action state-${cls}`}
          value={act}
          sub={
            <>
              {primary ? `${primary.name} · ${primary.lifecycle}` : inClosing ? "closing window" : "—"}
              {otherAct ? <span className={disagree ? "dash-warn" : "muted"}> · {other} {otherAct}{disagree ? " — disagrees" : otherHasSetup ? " — agrees" : ""}</span> : null}
            </>
          }
        />
        <Tile label="Lean" className={`dash-lean dash-lean-${sm.direction.toLowerCase()}`} value={sm.direction} sub={`${sm.strength} · ${Math.round(sm.agreement * 100)}% agree · ${d.lean.weightsMode === "learned" ? "learned weights" : "prior weights"}`} />
        <Tile
          label="Expected move to close (1σ)"
          value={move !== null ? `±${fmtPts(move, dp)}` : "n/a"}
          sub={
            <>
              {spot !== null && move !== null ? <span className="mono">{fmtPts(spot - move, dp)} – {fmtPts(spot + move, dp)}</span> : null}
              {horizon !== null && sm.expectedMove.horizonMinutes ? <span className="mono"> · ±{fmtPts(horizon, dp)} / {sm.expectedMove.horizonMinutes}m (1σ)</span> : null}
              {sm.expectedMove.straddleAbsMoveToClose !== null ? <span className="mono"> · straddle E|move| {fmtPts(sm.expectedMove.straddleAbsMoveToClose, dp)}</span> : null}
              {sm.expectedMove.consumedPct !== null && sm.expectedMove.consumedPct !== undefined ? <span className="mono"> · {Math.round(sm.expectedMove.consumedPct * 100)}% of open-anchored EM used</span> : null}
            </>
          }
        />
        <Tile label="To close" value={fmtClock(secondsToClose)} sub={<><ModeBadge mode={s.mode} /> <span>{s.clock.phase}</span></>} />
      </div>

      <div className="dash-row dash-row-contract">
        <Tile label={`Contract${c ? ` · ${c.instrument}` : ""}`} className="dash-contract" value={c ? c.label.replace(/ \(Δ.*\)$/, "") : "—"} sub={c ? <span className="mono">{fmtNum(c.bid)} / {fmtNum(c.ask)} · risk {fmtUsd(c.riskUsd)} · BE {fmtPts(c.breakeven, dp)} · {c.riskUsd <= budget ? "in budget" : `over $${budget}`}</span> : reason ? <span className="muted">{reason}</span> : "no contract"} />
        <Tile label={`Entry (${sm.instrument})`} value={hasSetup && primary?.entryZone ? <span className="mono">{fmtPts(primary.entryZone.low, dp)}–{fmtPts(primary.entryZone.high, dp)}</span> : hasSetup && closing?.recommendation.contract ? <span className="mono">ask ≤ {fmtNum(closing.recommendation.contract.ask)}</span> : "—"} />
        <Tile label={`Invalidation (${sm.instrument})`} className="dash-inval" value={hasSetup && primary ? <span className="mono">{fmtPts(primary.invalidationLevel, dp)}</span> : hasSetup && closing?.recommendation.strike ? <span className="mono">{closing.recommendation.strike}</span> : "—"} />
        <Tile label="Target" value={hasSetup && primary?.targetLevel ? <span className="mono">{fmtPts(primary.targetLevel, dp)}</span> : "—"} />
        <Tile label="Exit" value={hasSetup && primary ? `${primary.horizonMinutes}m` : hasSetup && closing?.recommendation.mode ? (closing.recommendation.mode === "resale" ? "resale" : "settle") : "—"} sub={hasSetup && primary ? "time stop" : hasSetup && closing?.recommendation.mode === "resale" ? "before close" : hasSetup && closing?.recommendation.mode ? "hold to settlement" : ""} />
      </div>
      {hasSetup && (c || sm.whenToSell.length) ? (
        <div className="dash-row dash-row-plan">
          <Tile label="Entry condition">
            <div className="dash-sub">{c?.entryCondition ?? "—"}</div>
          </Tile>
          <Tile label="When to sell">
            <ul className="dash-list">
              {sm.whenToSell.slice(0, 3).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </Tile>
        </div>
      ) : null}

      <div className="dash-row dash-row-levels">
        <Levels label="Resistance" levels={sm.resistance} kind="resistance" />
        <Levels label="Support" levels={sm.support} kind="support" />
      </div>

      <div className="dash-row dash-row-facts">
        <Tile label={`Indices 15m · ${sm.cross?.label ?? "n/a"}`}>
          <div className="dash-facts">
            {Object.entries(s.indices ?? {}).map(([k, v]) => (
              <span key={k}>
                <b>{k}</b> <span className={`mono ${v.ret15 === null ? "" : v.ret15 >= 0 ? "pos" : "neg"}`}>{v.ret15 === null ? "—" : `${v.ret15 >= 0 ? "+" : ""}${(v.ret15 * 100).toFixed(2)}%`}</span>
              </span>
            ))}
            {!Object.keys(s.indices ?? {}).length ? <span className="muted">needs Schwab live</span> : null}
          </div>
        </Tile>
        <Tile label="Timeframes">
          <TimeframesCompact mtf={sm.timeframes} />
        </Tile>
        <Tile label="Market">
          <div className="dash-facts">
            <span><b>SPX</b> <span className="mono">{fmtNum(s.spx?.last ?? null, 2)}</span></span>
            <span><b>SPY</b> <span className="mono">{fmtNum(s.spy?.last ?? null)}</span></span>
            <span><b>TICK</b> <span className="mono">{s.tick ? `${s.tick.last > 0 ? "+" : ""}${Math.round(s.tick.last)}` : "n/a"}</span>{s.tickFeatures.avg10 !== null ? <span className="muted mono"> / {Math.round(s.tickFeatures.avg10)}</span> : null}</span>
            <span><b>VIX</b> <span className="mono">{fmtNum(s.vix?.last ?? null, 1)}</span></span>
            <span><b>γ</b> {s.regime?.gamma ?? "—"}</span>
            <span><b>Vol</b> {s.regime?.volatility ?? "—"}</span>
            <span><b>Trend</b> {s.regime?.trend ?? "—"}</span>
            <span><b>Partic.</b> {s.regime?.participation ?? "—"}</span>
            <span><b>Liq.</b> {s.regime?.liquidity ?? "—"}</span>
            <span><b>Data</b> {s.regime?.dataConfidence ?? "—"}</span>
          </div>
        </Tile>
      </div>

      {(closing || pos) && (
        <div className="dash-row dash-row-extra">
          {closing && (
            closing.subWindow === "pre" ? (
              <Tile label="Closing window" value="not open" sub={<span className="mono">opens 15:50 ET · σ to close {fmtPts(closing.remaining.sigmaUsedPts)}</span>} />
            ) : (
              <Tile label={`Closing window · ${closing.subWindow}`} className={`dash-closing state-${stateClass(closing.recommendation.state === "CALL SETUP" || closing.recommendation.state === "PUT SETUP" ? closing.recommendation.state : closing.recommendation.state === "WAIT" ? "WAIT" : "PASS")}`} value={closing.recommendation.state} sub={closing.recommendation.contract ? <span className="mono">{closing.recommendation.contract.osi.trim()} ≤ {fmtNum(closing.recommendation.contract.ask)} · {closing.recommendation.mode} · σ {fmtPts(closing.remaining.sigmaUsedPts)} · needs {fmtPts(closing.recommendation.contract.requiredMovePts)}</span> : closing.passReasons[0] ?? closing.recommendation.rationale[0] ?? ""} />
            )
          )}
          {pos && (
            <Tile label="Position" className="dash-position" value={<span className="mono">{pos.position.osi.trim()} ×{pos.position.qty}</span>} sub={<span className="mono">in {fmtNum(pos.position.entryPremium)} · bid {fmtNum(pos.mark?.bid ?? null)} · P&L {fmtUsd(pos.mark?.unrealizedUsd ?? null)}{pos.mark?.exitSignal ? ` · EXIT: ${pos.mark.exitSignal.reason}` : ""}</span>} />
          )}
        </div>
      )}
      <p className="dash-foot muted small">
        {sm.validation === "prospective" ? "prospective" : "unvalidated"} · as of {new Date(d.asOf).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false })} ET · decision v{d.version}
      </p>
    </div>
  );
}
