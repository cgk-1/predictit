import { useMemo, useState } from "react";
import { realizedPnl, type PaperPosition } from "@predictit/engine";
import { api, type OpenPositionInput } from "../api/client";
import { useServer, useServerNow } from "../api/context";
import { recommendedContract } from "../components/DecisionCard";
import { Button, FormStatus, NumberField, SelectField, TextField, type FormStatusValue } from "../components/Form";
import { Empty, Panel, Stat } from "../components/Panel";
import { useFetch } from "../lib/useFetch";
import { fmtAgo, fmtClock, fmtContract, fmtDateTime, fmtMs, fmtPremium, fmtPts, fmtSignedPct, fmtSignedUsd, fmtTime, fmtUsd } from "../lib/format";

function localDatetimeValue(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Draft {
  osi: string;
  qty: number | null;
  entryPremium: number | null;
  entryAt: string;
  note: string;
  invalidationLevel: number | null;
  horizonMinutes: number | null;
  profitTargetPremium: number | null;
  trailActivateAt: number | null;
  trailPts: number | null;
  mode: "paper" | "manual";
  decisionId: string | null;
  strategyId: string | null;
}

function emptyDraft(nowMs: number): Draft {
  return { osi: "", qty: 1, entryPremium: null, entryAt: localDatetimeValue(nowMs), note: "", invalidationLevel: null, horizonMinutes: null, profitTargetPremium: null, trailActivateAt: null, trailPts: null, mode: "paper", decisionId: null, strategyId: null };
}

export function PositionsView() {
  const conn = useServer();
  const s = conn.state;
  const now = useServerNow();
  const today = s?.clock.date ?? "";
  const closedQ = useFetch((sig) => api.positions(today || undefined, sig), `positions-${today}`, 15_000);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(Date.now()));
  const [status, setStatus] = useState<FormStatusValue>({ kind: "idle" });
  const costs = useMemo(() => (s ? { commissionPerContract: s.settings.engine.commissionPerContract, feesPerContract: s.settings.engine.feesPerContract } : undefined), [s]);

  if (!s) return <Empty>Connecting…</Empty>;
  const open = s.positions;
  const openRisk = open.reduce((a, p) => a + p.position.entryPremium * 100 * p.position.qty, 0);
  const closed = (closedQ.data ?? []).filter((p) => p.status === "closed").sort((a, b) => (b.exit?.at ?? 0) - (a.exit?.at ?? 0));
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const prefill = () => {
    const d = s.decision;
    if (!d) return;
    const c = recommendedContract(d);
    if (!c) {
      setStatus({ kind: "err", text: "The current decision has no recommended contract." });
      return;
    }
    const usingClosing = c.source === "closing";
    patch({
      osi: c.osi,
      entryPremium: c.ask,
      entryAt: localDatetimeValue(Date.now()),
      invalidationLevel: usingClosing ? d.closing?.recommendation.strike ?? null : d.primary?.invalidationLevel ?? null,
      horizonMinutes: usingClosing ? null : d.primary?.horizonMinutes ?? null,
      decisionId: d.id,
      strategyId: usingClosing ? "strike-flip" : d.primary?.family ?? null,
      note: usingClosing ? `closing-window ${d.closing?.recommendation.mode ?? ""}` : d.primary?.name ?? "",
    });
    setStatus({ kind: "idle" });
  };

  const submit = async () => {
    if (!draft.osi.trim() || draft.qty === null || draft.entryPremium === null) {
      setStatus({ kind: "err", text: "Contract, quantity and entry premium are required." });
      return;
    }
    const entryAt = draft.entryAt ? new Date(draft.entryAt).getTime() : NaN;
    const body: OpenPositionInput = {
      osi: draft.osi.trim(),
      qty: draft.qty,
      entryPremium: draft.entryPremium,
      entryAt: Number.isFinite(entryAt) ? entryAt : undefined,
      note: draft.note || undefined,
      invalidationLevel: draft.invalidationLevel,
      horizonMinutes: draft.horizonMinutes,
      profitTargetPremium: draft.profitTargetPremium,
      trail: draft.trailActivateAt !== null && draft.trailPts !== null ? { activateAt: draft.trailActivateAt, trailPts: draft.trailPts } : null,
      mode: draft.mode,
      decisionId: draft.decisionId,
      strategyId: draft.strategyId,
    };
    setStatus({ kind: "busy", text: "Opening…" });
    try {
      const p = await api.openPosition(body);
      setStatus({ kind: "ok", text: `Opened ${fmtContract(p.osi)} ×${p.qty} at ${fmtPremium(p.entryPremium)}.` });
      setDraft(emptyDraft(Date.now()));
      conn.refresh();
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message });
    }
  };

  const entryAtMs = draft.entryAt ? new Date(draft.entryAt).getTime() : NaN;

  return (
    <>
      <div className="view-head">
        <h1>Positions</h1>
        <p className="panel-meta">
          <span>marks at the executable bid; server time {fmtTime(s.serverTime)} ET</span>
        </p>
      </div>
      <div className="stats">
        <Stat label="Realized today" value={fmtSignedUsd(s.realizedToday)} meta={`after costs; daily loss limit ${fmtUsd(s.settings.engine.dailyLossLimit)}`} />
        <Stat label="Open risk" value={fmtUsd(openRisk)} meta={`of ${fmtUsd(s.settings.maxOpenRiskUsd)} limit`} />
        <Stat label="Per-contract budget" value={fmtUsd(s.settings.engine.maxPremiumPerContract)} meta="maximum premium × 100" />
        <Stat label="Open positions" value={String(open.length)} />
      </div>

      <Panel title="Open positions" meta={<span>{open.length} open</span>}>
        {!open.length ? (
          <p className="muted small">No open positions. Open one below or prefill from the current decision.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Contract</th>
                  <th scope="col" className="num">
                    qty
                  </th>
                  <th scope="col" className="num">
                    entry
                  </th>
                  <th scope="col" className="num">
                    bid / ask
                  </th>
                  <th scope="col" className="num">
                    mark
                  </th>
                  <th scope="col" className="num">
                    unrealized
                  </th>
                  <th scope="col" className="num">
                    intrinsic now
                  </th>
                  <th scope="col" className="num">
                    to expiry
                  </th>
                  <th scope="col">alerts / exit signal</th>
                  <th scope="col">close</th>
                </tr>
              </thead>
              <tbody>
                {open.map(({ position: p, mark: m }) => (
                  <tr key={p.id} className={m?.exitSignal ? "row-hi" : ""}>
                    <td>
                      <div className="mono" title={p.osi}>
                        {fmtContract(p.osi)}
                      </div>
                      <div className="xs muted">
                        {p.mode}
                        {p.strategyId ? ` · ${p.strategyId}` : ""}
                        {p.note ? ` · ${p.note}` : ""}
                      </div>
                    </td>
                    <td className="num">{p.qty}</td>
                    <td className="num">
                      {fmtPremium(p.entryPremium)}
                      <div className="xs muted">{fmtTime(p.entryAt)}</div>
                    </td>
                    <td className="num">
                      {m ? `${fmtPremium(m.bid)} / ${fmtPremium(m.ask)}` : "n/a"}
                      <div className="xs muted">{m?.quoteAgeMs !== null && m?.quoteAgeMs !== undefined ? `${fmtMs(m.quoteAgeMs)} old` : "no quote"}</div>
                    </td>
                    <td className="num">{m ? fmtPremium(m.markValue) : "n/a"}</td>
                    <td className={`num ${m?.unrealizedUsd !== null && m?.unrealizedUsd !== undefined ? (m.unrealizedUsd >= 0 ? "pos" : "neg") : ""}`}>
                      {m ? fmtSignedUsd(m.unrealizedUsd) : "n/a"}
                      <div className="xs muted">{m ? fmtSignedPct(m.unrealizedPct, 0) : ""}</div>
                    </td>
                    <td className="num">{m ? fmtPts(m.intrinsicNow, 2) : "n/a"}</td>
                    <td className="num">{m ? fmtClock(m.secondsToExpiry - (now - s.serverTime) / 1000) : "n/a"}</td>
                    <td className="wrap">
                      {m?.alerts.map((a, i) => (
                        <div key={i} className={`note note-${a.level === "action" ? "action" : a.level}`} style={{ marginBottom: 2 }}>
                          {a.text}
                        </div>
                      ))}
                      {!m?.alerts.length ? <span className="muted">—</span> : null}
                    </td>
                    <td>
                      <CloseForm p={p} mark={m?.bid ?? null} onClosed={() => conn.refresh()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Open a paper or manual position">
        <div className="row">
          <Button onClick={prefill} disabled={!s.decision}>
            Use recommended contract
          </Button>
          <span className="small muted">{s.decision ? `from decision v${s.decision.version} (${s.decision.state})` : "no decision yet"}</span>
        </div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="form-grid">
            <TextField label="Contract (OSI)" value={draft.osi} onChange={(v) => patch({ osi: v })} mono placeholder="SPXW  261106C07400000" help="OSI/OCC symbol; Cboe style without padding is accepted." />
            <NumberField label="Quantity" value={draft.qty} onChange={(v) => patch({ qty: v })} min={1} step={1} />
            <NumberField label="Entry premium" value={draft.entryPremium} onChange={(v) => patch({ entryPremium: v })} min={0} step={0.01} help="Per contract, in points (×100 = USD)." />
            <TextField label="Entry time (your local clock)" type="datetime-local" value={draft.entryAt} onChange={(v) => patch({ entryAt: v })} mono help={Number.isFinite(entryAtMs) ? `= ${fmtDateTime(entryAtMs)}` : "defaults to server time"} />
            <SelectField
              label="Mode"
              value={draft.mode}
              onChange={(v) => patch({ mode: v })}
              options={[
                { value: "paper", label: "paper" },
                { value: "manual", label: "manual (record of a real fill)" },
              ]}
            />
            <NumberField label="Invalidation level (SPX)" value={draft.invalidationLevel} onChange={(v) => patch({ invalidationLevel: v })} step={0.1} help="Exit signal when SPX trades beyond it." />
            <NumberField label="Horizon (minutes)" value={draft.horizonMinutes} onChange={(v) => patch({ horizonMinutes: v })} min={1} step={1} help="Time stop from entry." />
            <NumberField label="Profit target premium" value={draft.profitTargetPremium} onChange={(v) => patch({ profitTargetPremium: v })} min={0} step={0.01} />
            <NumberField label="Trail: activate at bid ≥" value={draft.trailActivateAt} onChange={(v) => patch({ trailActivateAt: v })} min={0} step={0.01} />
            <NumberField label="Trail: points" value={draft.trailPts} onChange={(v) => patch({ trailPts: v })} min={0} step={0.01} help="Exit when bid ≤ highest bid − points." />
            <TextField label="Note" value={draft.note} onChange={(v) => patch({ note: v })} />
          </div>
          <div className="form-actions">
            <Button type="submit" kind="primary" disabled={status.kind === "busy"}>
              Open position
            </Button>
            <FormStatus status={status} />
            {draft.decisionId ? <span className="xs muted">linked to decision {draft.decisionId}</span> : null}
          </div>
        </form>
        <p className="xs muted">The server checks the per-contract budget, open-risk limit and daily loss limit before accepting. Paper fills are recorded at the premium you enter — no fill is guaranteed.</p>
      </Panel>

      <Panel title="Closed today" meta={closedQ.fetchedAt ? <span>{closed.length} closed; fetched {fmtAgo(Date.now() - closedQ.fetchedAt)}</span> : undefined}>
        {closedQ.error ? <p className="form-status form-status-err">{closedQ.error}</p> : null}
        {!closed.length ? (
          <p className="muted small">No closed positions today.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Contract</th>
                  <th scope="col" className="num">
                    qty
                  </th>
                  <th scope="col" className="num">
                    entry
                  </th>
                  <th scope="col" className="num">
                    exit
                  </th>
                  <th scope="col">reason</th>
                  <th scope="col" className="num">
                    realized
                  </th>
                </tr>
              </thead>
              <tbody>
                {closed.map((p) => {
                  const r = realizedPnl(p, costs);
                  return (
                    <tr key={p.id}>
                      <td className="mono">{fmtContract(p.osi)}</td>
                      <td className="num">{p.qty}</td>
                      <td className="num">
                        {fmtPremium(p.entryPremium)} <span className="xs muted">{fmtTime(p.entryAt)}</span>
                      </td>
                      <td className="num">
                        {p.exit ? fmtPremium(p.exit.premium) : "n/a"} <span className="xs muted">{p.exit ? fmtTime(p.exit.at) : ""}</span>
                      </td>
                      <td className="wrap">{p.exit?.reason ?? "—"}</td>
                      <td className={`num ${r !== null ? (r >= 0 ? "pos" : "neg") : ""}`}>{fmtSignedUsd(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function CloseForm({ p, mark, onClosed }: { p: PaperPosition; mark: number | null; onClosed: () => void }) {
  const [premium, setPremium] = useState<number | null>(mark);
  const [reason, setReason] = useState("manual");
  const [status, setStatus] = useState<FormStatusValue>({ kind: "idle" });
  const go = async () => {
    if (premium === null) {
      setStatus({ kind: "err", text: "premium required" });
      return;
    }
    setStatus({ kind: "busy", text: "closing…" });
    try {
      await api.closePosition(p.id, premium, reason || "manual");
      setStatus({ kind: "ok", text: "closed" });
      onClosed();
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message });
    }
  };
  return (
    <div className="stack" style={{ gap: 4, minWidth: 160 }}>
      <label className="vis-hidden" htmlFor={`close-prem-${p.id}`}>
        Exit premium
      </label>
      <input id={`close-prem-${p.id}`} className="input" type="number" step={0.01} min={0} placeholder="exit premium" value={premium ?? ""} onChange={(e) => setPremium(e.target.value === "" ? null : Number(e.target.value))} />
      <label className="vis-hidden" htmlFor={`close-reason-${p.id}`}>
        Reason
      </label>
      <input id={`close-reason-${p.id}`} className="input input-text" type="text" placeholder="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="row" style={{ gap: 6 }}>
        <Button small kind="danger" onClick={() => void go()} disabled={status.kind === "busy"}>
          Close
        </Button>
        <FormStatus status={status} />
      </div>
      {mark !== null ? <span className="xs muted">bid {fmtPremium(mark)} prefilled</span> : <span className="xs muted">no bid to prefill</span>}
    </div>
  );
}
