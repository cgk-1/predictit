import { useEffect, useMemo, useRef, useState } from "react";
import { etToMs, fmtGexUsd, type DecisionRecord } from "@predictit/engine";
import { api } from "../api/client";
import type { ReplayResponse } from "../api/types";
import { useServer, useServerNow } from "../api/context";
import { ChangesFeed } from "../components/ChangesFeed";
import { DecisionCard } from "../components/DecisionCard";
import { StateBadge } from "../components/Badges";
import { LevelsLadder } from "../components/LevelsLadder";
import { Empty, Panel, Stat } from "../components/Panel";
import { RegimePanel } from "../components/RegimePanel";
import { Button } from "../components/Form";
import { SummaryCard } from "../components/SummaryCard";
import { useFetch } from "../lib/useFetch";
import { clamp, fmtContract, fmtPts, fmtTime } from "../lib/format";

const SESSION_MIN = 405; // 09:30 → 16:15

export function ReplayView() {
  const dates = useFetch((sig) => api.dates(sig), "dates");
  const [date, setDate] = useState<string>("");
  const open = useMemo(() => (date ? etToMs(date, 9, 30) : 0), [date]);
  const end = open + SESSION_MIN * 60_000;
  const [at, setAt] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reqRef = useRef(0);
  const serverNow = useServerNow();
  const budgetUsd = useServer().state?.settings.engine.maxPremiumPerContract;

  useEffect(() => {
    if (!date && dates.data?.length) setDate(dates.data[0]!.date);
  }, [dates.data, date]);
  useEffect(() => {
    if (date) {
      setAt(etToMs(date, 9, 30) + 60 * 60_000);
      setResult(null);
      setPlaying(false);
    }
  }, [date]);

  // debounced as-of reconstruction
  useEffect(() => {
    if (!date || !at) return;
    const id = ++reqRef.current;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.replay(date, at, ac.signal);
        if (reqRef.current !== id) return;
        setResult(r);
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError" || reqRef.current !== id) return;
        setError((e as Error).message);
      } finally {
        if (reqRef.current === id) setBusy(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [date, at]);

  // play: one minute per second
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setAt((a) => {
        const next = a + 60_000;
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, end]);

  const decisions = useFetch((sig) => (date ? api.decisions(date, sig) : Promise.resolve([] as DecisionRecord[])), `decisions-${date}`);
  const changes = useFetch((sig) => (date ? api.changes(date, sig) : Promise.resolve([])), `changes-${date}`);

  if (dates.error) return <Empty>Cannot load recorded dates: {dates.error}</Empty>;
  if (!dates.data) return <Empty>Loading recorded dates…</Empty>;
  if (!dates.data.length) return <Empty>No recorded days yet. Replay needs stored snapshots; they accumulate while the collector runs.</Empty>;

  const step = (ms: number) => setAt((a) => clamp(a + ms, open, end));
  const sliderMin = Math.round((at - open) / 60_000);
  const d = result?.decision ?? null;
  const ctx = result?.ctx ?? null;
  const fs = result?.frameSummary ?? null;

  return (
    <>
      <div className="view-head">
        <h1>Replay</h1>
        <p>Reconstructs the engine's view at an instant from snapshots received at or before it. Nothing from later in the day is visible.</p>
      </div>
      <Panel title="Instant">
        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="replay-date">
              Date
            </label>
            <select id="replay-date" className="select" value={date} onChange={(e) => setDate(e.target.value)}>
              {dates.data.map((e) => (
                <option key={e.date} value={e.date}>
                  {e.date} — {e.snapshots} snapshots, {e.decisions} decisions{e.archived ? ", archived" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="replay-time">
              Time (ET): <span className="mono">{at ? fmtTime(at) : "—"}</span>
            </label>
            <input id="replay-time" className="slider" type="range" min={0} max={SESSION_MIN} step={1} value={sliderMin} onChange={(e) => setAt(open + Number(e.target.value) * 60_000)} />
            <span className="help">09:30 to 16:15 in one-minute steps</span>
          </div>
        </div>
        <div className="row">
          <Button small onClick={() => step(-10 * 60_000)}>
            −10 min
          </Button>
          <Button small onClick={() => step(-60_000)}>
            −1 min
          </Button>
          <Button small onClick={() => step(-10_000)}>
            −10 s
          </Button>
          <Button small onClick={() => step(10_000)}>
            +10 s
          </Button>
          <Button small onClick={() => step(60_000)}>
            +1 min
          </Button>
          <Button small onClick={() => step(10 * 60_000)}>
            +10 min
          </Button>
          <Button small kind="primary" onClick={() => setPlaying((p) => !p)} disabled={at >= end}>
            {playing ? "Pause" : "Play (1 min/s)"}
          </Button>
          {busy ? <span className="small muted">reconstructing…</span> : null}
          {error ? <span className="form-status form-status-err">{error}</span> : null}
        </div>
      </Panel>

      {result && d ? (
        <>
          <div className="banner banner-replay" role="status">
            <strong>REPLAY</strong>
            <span>reconstructed from data received at or before {fmtTime(at)} ET on {date}; no hindsight.</span>
            {fs ? (
              <span className="muted">
                SPX {fmtPts(fs.spx, 2)} at {fmtTime(fs.spotTime)}; chain observed {fmtTime(fs.chainObservedAt)}
              </span>
            ) : null}
          </div>
          <SummaryCard summary={d.summary} lean={d.lean} now={at} budgetUsd={budgetUsd} />
          <DecisionCard decision={d} now={at} id="replay-decision-record" />
          <div className="grid-2">
            <RegimePanel regime={ctx?.regime ?? null} now={at} />
            <LevelsLadder levels={ctx?.levels ?? []} spot={fs?.spx ?? null} spotTime={fs?.spotTime ?? null} />
          </div>
          <Panel title="GEX summary" meta={ctx?.gex ? <span>as of {fmtTime(ctx.gex.asOf)} ET; OI prior close; model {ctx.gex.config.dealerSign}</span> : undefined}>
            {ctx?.gex ? (
              <div className="stats">
                <Stat label="Net GEX (per 1 pt)" value={fmtGexUsd(ctx.gex.totals.net)} />
                <Stat label="Net 0DTE" value={fmtGexUsd(ctx.gex.totals.net0dte)} />
                <Stat label="Zero-gamma estimate" value={ctx.gex.flip.level !== null ? fmtPts(ctx.gex.flip.level, 0) : "n/a"} />
                <Stat label="Call wall / put wall" value={`${ctx.gex.walls.callWall ?? "n/a"} / ${ctx.gex.walls.putWall ?? "n/a"}`} />
                <Stat label="Largest 0DTE strike" value={ctx.gex.walls.largest0dte !== null ? String(ctx.gex.walls.largest0dte) : "n/a"} />
              </div>
            ) : (
              <p className="muted small">n/a — no chain in the frame at this instant.</p>
            )}
          </Panel>
        </>
      ) : (
        <Empty>{busy ? "Reconstructing…" : error ? `Reconstruction failed: ${error}` : "Move the scrubber to reconstruct an instant."}</Empty>
      )}

      <Panel title="Recorded decisions" meta={<span>immutable ledger for {date}; {decisions.data?.length ?? 0} records</span>}>
        {decisions.error ? <p className="form-status form-status-err">{decisions.error}</p> : null}
        {!decisions.data?.length ? (
          <p className="muted small">No decisions recorded for this date.</p>
        ) : (
          <div className="stack" style={{ gap: 0 }}>
            {decisions.data.map((r) => (
              <div key={r.id} className="timeline-row">
                <span className="mono muted">v{r.version}</span>
                <button type="button" className="timeline-btn" onClick={() => setAt(clamp(r.asOf, open, end))} title="Jump the scrubber to this instant">
                  {fmtTime(r.asOf)}
                </button>
                <StateBadge state={r.state} />
                <span className="small">
                  {r.primary ? `${r.primary.name} (${r.primary.direction}, ${r.primary.lifecycle})` : r.closing?.recommendation.contract ? "closing window" : "no primary"}
                  {r.contracts[0] ? <span className="mono muted"> · {fmtContract(r.contracts[0].osi)}</span> : r.closing?.recommendation.contract ? <span className="mono muted"> · {fmtContract(r.closing.recommendation.contract.osi)}</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <ChangesFeed changes={changes.data ?? []} title={`Change feed for ${date}`} limit={20} />
      <p className="xs muted">Server clock while you read this: {fmtTime(serverNow)} ET.</p>
    </>
  );
}
