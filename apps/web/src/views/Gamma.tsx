import { useEffect, useState } from "react";
import { DEALER_SIGN_MODELS, fmtGexUsd, type DealerSignModel } from "@predictit/engine";
import { api } from "../api/client";
import { useFetch } from "../lib/useFetch";
import { useInstrument, useServer, useServerNow } from "../api/context";
import { ModeBadge } from "../components/Badges";
import { FormStatus, type FormStatusValue } from "../components/Form";
import { GexChart } from "../components/GexChart";
import { GexProfile } from "../components/GexProfile";
import { Notes } from "../components/Notes";
import { Empty, Panel, Stat } from "../components/Panel";
import { fmtAgo, fmtPct, fmtPts, fmtTime } from "../lib/format";

export function GammaView() {
  const conn = useServer();
  const s = conn.state;
  const now = useServerNow();
  const [pending, setPending] = useState<DealerSignModel | null>(null);
  const [status, setStatus] = useState<FormStatusValue>({ kind: "idle" });
  const configured = s?.settings.engine.gex.dealerSign ?? null;
  const [inst] = useInstrument();
  const detail = useFetch((sig) => api.gex(inst, sig), `gex-${inst}`, 15_000);
  const g = detail.data ?? s?.gex ?? null;

  useEffect(() => {
    if (pending && configured === pending && g?.config.dealerSign === pending) setPending(null);
  }, [pending, configured, g]);

  if (!s) return <Empty>Connecting…</Empty>;

  const choose = async (m: DealerSignModel) => {
    setPending(m);
    setStatus({ kind: "busy", text: "Saving…" });
    try {
      await api.putSettings({ engine: { gex: { ...s.settings.engine.gex, dealerSign: m } } });
      setStatus({ kind: "ok", text: "Saved. The chart updates on the next engine evaluation." });
      conn.refresh();
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message });
      setPending(null);
    }
  };

  const selector = (
    <Panel title="Dealer-sign model" meta={<span>configured: {configured}</span>}>
      <div className="segmented" role="group" aria-label="Dealer sign model">
        {DEALER_SIGN_MODELS.map((m) => (
          <button key={m.id} type="button" aria-pressed={(pending ?? configured) === m.id} onClick={() => void choose(m.id)} title={m.description}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="small muted">{DEALER_SIGN_MODELS.find((m) => m.id === (pending ?? configured))?.description}</p>
      <div className="row">
        <FormStatus status={status} />
        {g && g.config.dealerSign !== configured ? <span className="small muted">Chart below still shows "{g.config.dealerSign}" until the next evaluation (poll cadence).</span> : null}
      </div>
      <p className="xs muted">No model is "true": the sensitivity table shows how the net figure and the zero-gamma estimate move across models.</p>
    </Panel>
  );

  if (!g) {
    return (
      <>
        <div className="view-head">
          <h1>Gamma exposure</h1>
          <p>n/a — no SPX option chain has been evaluated yet{s.mode === "NONE" ? " (no market data)" : ""}.</p>
        </div>
        {selector}
      </>
    );
  }

  const chainMode = s.chainFeatures ? s.mode : g.config ? s.mode : "NONE";
  return (
    <>
      <div className="view-head">
        <h1>Gamma exposure</h1>
        <p className="panel-meta">
          <span>as of {fmtTime(g.asOf)} ET ({fmtAgo(now - g.asOf)})</span>
          <ModeBadge mode={chainMode} />
          <span>spot {fmtPts(g.spot, 2)}</span>
          <span>OI as of prior close ({g.today})</span>
          <span>{g.contractsUsed} contracts</span>
        </p>
      </div>
      <div className="banner" role="note">
        <strong>Our inferred exposure.</strong>
        <span>Open interest is the exchange's prior-close OI; gamma is {g.config.gammaSource === "own-bs" ? "our Black-Scholes from mid-implied vol" : "vendor greeks"} ({g.config.timeConvention} time); signs follow the "{g.config.dealerSign}" model. Intraday changes come only from spot and vol, never from new positioning.</span>
      </div>
      <div className="stats">
        <Stat label="Net GEX (per 1 pt)" value={fmtGexUsd(g.totals.net)} meta={`${g.config.dealerSign}`} />
        <Stat label="Call GEX" value={fmtGexUsd(g.totals.call)} />
        <Stat label="Put GEX" value={fmtGexUsd(g.totals.put)} />
        <Stat label="Net 0DTE" value={fmtGexUsd(g.totals.net0dte)} meta={g.config.dealerSign === "naive-ex-0dte" ? "0DTE unsigned under this model" : undefined} />
        <Stat label="Net ex-0DTE" value={fmtGexUsd(g.totals.netEx0dte)} />
        <Stat label="Net per 1% move" value={fmtGexUsd(g.totals.netPer1pct)} />
        <Stat label="0DTE volume gamma (unsigned)" value={fmtGexUsd(g.totals.volGamma0dte)} meta="direction of today's flow unknown" />
        <Stat label="Zero-gamma estimate" value={g.flip.level !== null ? fmtPts(g.flip.level, 0) : "n/a"} meta={g.flip.level0dte !== null ? `0DTE-only crossing ${fmtPts(g.flip.level0dte, 0)}` : "0DTE-only crossing n/a"} />
        <Stat label="Call wall / put wall" value={`${g.walls.callWall ?? "n/a"} / ${g.walls.putWall ?? "n/a"}`} meta={`largest 0DTE ${g.walls.largest0dte ?? "n/a"}; largest |net| ${g.walls.largestAbs ?? "n/a"}`} />
        <Stat label="Share within ±1% of spot" value={fmtPct(g.nearSpot.within1pctShare, 0)} meta="of total |net| GEX" />
      </div>
      <Panel title="GEX by strike" meta={<span>±5% of spot; signed per 1 index point</span>}>
        <GexChart rows={g.byStrike} spot={g.spot} flip={g.flip.level} callWall={g.walls.callWall} putWall={g.walls.putWall} largest0dte={g.walls.largest0dte} />
      </Panel>
      <div className="grid-2">
        <Panel title="Gamma profile" meta={<span>net dealer gamma if spot were at x</span>}>
          <GexProfile profile={g.flip.profile} profile0dte={g.flip.profile0dte} spot={g.spot} flip={g.flip.level} flip0dte={g.flip.level0dte} />
        </Panel>
        {selector}
      </div>
      <div className="grid-2">
        <Panel title="Sensitivity across sign models">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col" className="num">
                    net
                  </th>
                  <th scope="col" className="num">
                    net 0DTE
                  </th>
                  <th scope="col" className="num">
                    zero crossing
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.sensitivity.map((r) => (
                  <tr key={r.model} className={r.model === g.config.dealerSign ? "row-hi" : ""}>
                    <td>{DEALER_SIGN_MODELS.find((m) => m.id === r.model)?.label ?? r.model}</td>
                    <td className={`num ${r.net > 0 ? "pos" : "neg"}`}>{fmtGexUsd(r.net)}</td>
                    <td className="num">{fmtGexUsd(r.net0dte)}</td>
                    <td className="num">{r.flip !== null ? fmtPts(r.flip, 0) : "none in ±4%"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="By expiry" meta={<span>OI as of prior close</span>}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Expiry</th>
                  <th scope="col" className="num">
                    net GEX
                  </th>
                  <th scope="col" className="num">
                    call OI
                  </th>
                  <th scope="col" className="num">
                    put OI
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.byExpiry.map((e) => (
                  <tr key={e.expiry}>
                    <td className="mono">
                      {e.expiry}
                      {e.is0dte ? <span className="chip chip-neutral" style={{ marginLeft: 6 }}>0DTE</span> : null}
                    </td>
                    <td className={`num ${e.net > 0 ? "pos" : e.net < 0 ? "neg" : ""}`}>{fmtGexUsd(e.net)}</td>
                    <td className="num">{e.callOi.toLocaleString("en-US")}</td>
                    <td className="num">{e.putOi.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      <Panel title="Assumptions and notes">
        <dl className="kv">
          <dt>Dealer sign</dt>
          <dd>{g.config.dealerSign}</dd>
          <dt>Gamma source</dt>
          <dd>{g.config.gammaSource}</dd>
          <dt>Time convention</dt>
          <dd>{g.config.timeConvention}</dd>
          <dt>Rates (r, q)</dt>
          <dd>
            {fmtPct(g.config.r, 1)}, {fmtPct(g.config.q, 1)}
          </dd>
          <dt>Strike window / max days</dt>
          <dd>
            ±{fmtPct(g.config.strikeWindowPct, 0)}, {g.config.maxDays} days
          </dd>
          <dt>Profile grid</dt>
          <dd>
            ±{fmtPct(g.config.profilePct, 0)} in {g.config.profileSteps} steps
          </dd>
        </dl>
        <Notes notes={g.notes} />
      </Panel>
    </>
  );
}
