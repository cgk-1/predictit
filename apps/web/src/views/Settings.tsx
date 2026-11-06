import { useEffect, useState, type ReactNode } from "react";
import { etParts, etToMs, type ScheduledEvent } from "@predictit/engine";
import { api, type SettingsPatch } from "../api/client";
import { useServer, useServerNow } from "../api/context";
import type { AppSettings, SchwabStatus } from "../api/types";
import { Button, FormStatus, NumberField, SelectField, TextField, Toggle, type FormStatusValue } from "../components/Form";
import { FeedHealthTable } from "../components/FeedHealth";
import { Empty, Panel } from "../components/Panel";
import type { Theme } from "../lib/theme";
import { useFetch } from "../lib/useFetch";
import { fmtAgo, fmtDateTime, fmtMs, fmtTime } from "../lib/format";

type Saver = (patch: SettingsPatch) => Promise<void>;

function useSection<T>(init: T, save: Saver, toPatch: (d: T) => SettingsPatch): { draft: T; set: (p: Partial<T>) => void; replace: (d: T) => void; submit: () => Promise<void>; status: FormStatusValue; reset: () => void } {
  const [draft, setDraft] = useState<T>(init);
  const [status, setStatus] = useState<FormStatusValue>({ kind: "idle" });
  const set = (p: Partial<T>) => setDraft((d) => ({ ...d, ...p }));
  const submit = async () => {
    setStatus({ kind: "busy", text: "Saving…" });
    try {
      await save(toPatch(draft));
      setStatus({ kind: "ok", text: "Saved." });
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message });
    }
  };
  return { draft, set, replace: setDraft, submit, status, reset: () => setDraft(init) };
}

function Actions({ onSave, onReset, status, children }: { onSave: () => void; onReset: () => void; status: FormStatusValue; children?: ReactNode }) {
  return (
    <div className="form-actions">
      <Button kind="primary" onClick={onSave} disabled={status.kind === "busy"}>
        Save changes
      </Button>
      <Button kind="ghost" onClick={onReset}>
        Reset
      </Button>
      <FormStatus status={status} />
      {children}
    </div>
  );
}

function Budgets({ s, save }: { s: AppSettings; save: Saver }) {
  const f = useSection({ maxPremiumPerContract: s.engine.maxPremiumPerContract, maxOpenRiskUsd: s.maxOpenRiskUsd, dailyLossLimit: s.engine.dailyLossLimit }, save, (d) => ({ engine: { maxPremiumPerContract: d.maxPremiumPerContract, dailyLossLimit: d.dailyLossLimit }, maxOpenRiskUsd: d.maxOpenRiskUsd }));
  return (
    <Panel title="Budgets">
      <div className="form-grid">
        <NumberField label="Max premium per contract (USD)" value={f.draft.maxPremiumPerContract} onChange={(v) => f.set({ maxPremiumPerContract: v ?? 0 })} min={0} step={1} />
        <NumberField label="Max open risk (USD)" value={f.draft.maxOpenRiskUsd} onChange={(v) => f.set({ maxOpenRiskUsd: v ?? 0 })} min={0} step={1} help="Sum of premium × 100 × qty across open positions." />
        <NumberField label="Daily loss limit (USD)" value={f.draft.dailyLossLimit} onChange={(v) => f.set({ dailyLossLimit: v ?? 0 })} min={0} step={1} help="Reaching it turns the decision to PASS; no loss-recovery sizing." />
      </div>
      <Actions onSave={() => void f.submit()} onReset={f.reset} status={f.status} />
    </Panel>
  );
}

function Execution({ s, save }: { s: AppSettings; save: Saver }) {
  const f = useSection({ maxSpreadPct: s.engine.maxSpreadPct * 100, maxQuoteAgeMs: s.engine.maxQuoteAgeMs, minQuoteSize: s.engine.minQuoteSize, closingWindowLastEntryMinutes: s.engine.closingWindowLastEntryMinutes, allowDelayedForLevels: s.engine.allowDelayedForLevels }, save, (d) => ({ engine: { maxSpreadPct: d.maxSpreadPct / 100, maxQuoteAgeMs: d.maxQuoteAgeMs, minQuoteSize: d.minQuoteSize, closingWindowLastEntryMinutes: d.closingWindowLastEntryMinutes, allowDelayedForLevels: d.allowDelayedForLevels } }));
  return (
    <Panel title="Execution limits">
      <div className="form-grid">
        <NumberField label="Max spread (% of mid)" value={f.draft.maxSpreadPct} onChange={(v) => f.set({ maxSpreadPct: v ?? 0 })} min={0} step={0.5} />
        <NumberField label="Max quote age (ms)" value={f.draft.maxQuoteAgeMs} onChange={(v) => f.set({ maxQuoteAgeMs: v ?? 0 })} min={0} step={500} help={`= ${fmtMs(f.draft.maxQuoteAgeMs)}`} />
        <NumberField label="Min quote size (contracts)" value={f.draft.minQuoteSize} onChange={(v) => f.set({ minQuoteSize: v ?? 0 })} min={0} step={1} />
        <NumberField label="Closing window: last entry (min before close)" value={f.draft.closingWindowLastEntryMinutes} onChange={(v) => f.set({ closingWindowLastEntryMinutes: v ?? 0 })} min={0} step={1} />
        <Toggle label="Allow DELAYED data for levels" checked={f.draft.allowDelayedForLevels} onChange={(v) => f.set({ allowDelayedForLevels: v })} help="Never for execution." />
      </div>
      <Actions onSave={() => void f.submit()} onReset={f.reset} status={f.status} />
    </Panel>
  );
}

function Costs({ s, save }: { s: AppSettings; save: Saver }) {
  const f = useSection({ commissionPerContract: s.engine.commissionPerContract, feesPerContract: s.engine.feesPerContract, closingCommission: s.closing.costs.commissionPerContract, closingFees: s.closing.costs.feesPerContract }, save, (d) => ({ engine: { commissionPerContract: d.commissionPerContract, feesPerContract: d.feesPerContract }, closing: { costs: { ...s.closing.costs, commissionPerContract: d.closingCommission, feesPerContract: d.closingFees } } }));
  return (
    <Panel title="Costs" meta={<span>per contract, per side, USD</span>}>
      <div className="form-grid">
        <NumberField label="Commission (ranking and positions)" value={f.draft.commissionPerContract} onChange={(v) => f.set({ commissionPerContract: v ?? 0 })} min={0} step={0.01} />
        <NumberField label="Fees (ranking and positions)" value={f.draft.feesPerContract} onChange={(v) => f.set({ feesPerContract: v ?? 0 })} min={0} step={0.01} />
        <NumberField label="Commission (closing module)" value={f.draft.closingCommission} onChange={(v) => f.set({ closingCommission: v ?? 0 })} min={0} step={0.01} />
        <NumberField label="Fees (closing module)" value={f.draft.closingFees} onChange={(v) => f.set({ closingFees: v ?? 0 })} min={0} step={0.01} help="SPX index options carry higher exchange fees than SPY." />
      </div>
      <Actions onSave={() => void f.submit()} onReset={f.reset} status={f.status} />
    </Panel>
  );
}

function Closing({ s, save }: { s: AppSettings; save: Saver }) {
  const c = s.closing;
  const f = useSection({ entryDelaySec: c.entryDelaySec, minResaleWindowSec: c.minResaleWindowSec, noNewEntrySec: c.noNewEntrySec, maxSpreadPts: c.maxSpreadPts, maxSpreadPct: c.maxSpreadPct * 100, minSize: c.minSize, maxQuoteAgeMs: c.maxQuoteAgeMs, seasonalityMultiplier: c.seasonalityMultiplier, settlementNoisePts: c.settlementNoisePts, driftPersistence: c.driftPersistence, minEdgePts: c.minEdgePts, strikeStep: c.strikeStep, ladderHalfWidth: c.ladderHalfWidth }, save, (d) => ({ closing: { ...d, maxSpreadPct: d.maxSpreadPct / 100 } }));
  const n = (k: keyof typeof f.draft, label: string, help?: string, step = 1) => <NumberField key={k} label={label} value={f.draft[k]} onChange={(v) => f.set({ [k]: v ?? 0 } as Partial<typeof f.draft>)} step={step} help={help} />;
  return (
    <Panel title="Closing window">
      <div className="form-grid">
        {n("entryDelaySec", "Entry delay (s)", "decision → fill acknowledgement")}
        {n("minResaleWindowSec", "Min resale window (s)", "time left after entry for a resale to count as feasible")}
        {n("noNewEntrySec", "No new entries within (s)")}
        {n("maxSpreadPts", "Max spread (pts)", undefined, 0.05)}
        {n("maxSpreadPct", "Max spread (% of mid)", undefined, 1)}
        {n("minSize", "Min ask size")}
        {n("maxQuoteAgeMs", "Max quote age (ms)", undefined, 500)}
        {n("seasonalityMultiplier", "Seasonality multiplier", "applied to realized vol in the last minutes", 0.1)}
        {n("settlementNoisePts", "Settlement noise σ (pts)", "official settlement vs last tick", 0.1)}
        {n("driftPersistence", "Drift persistence (0–1)", "fraction of the 3-min speed assumed to persist", 0.05)}
        {n("minEdgePts", "Min edge (pts)", "modelled edge over the ask required to recommend", 0.05)}
        {n("strikeStep", "Strike step (pts)")}
        {n("ladderHalfWidth", "Ladder half-width (strikes)")}
      </div>
      <Actions onSave={() => void f.submit()} onReset={f.reset} status={f.status} />
    </Panel>
  );
}

function Polling({ s, save }: { s: AppSettings; save: Saver }) {
  const f = useSection({ live: s.pollSec.live, delayed: s.pollSec.delayed, idle: s.pollSec.idle, retentionDays: s.retentionDays, archiveCboe: s.archiveCboe }, save, (d) => ({ pollSec: { live: d.live, delayed: d.delayed, idle: d.idle }, retentionDays: d.retentionDays, archiveCboe: d.archiveCboe }));
  return (
    <Panel title="Polling and storage">
      <div className="form-grid">
        <NumberField label="Poll cadence, live (s)" value={f.draft.live} onChange={(v) => f.set({ live: v ?? 1 })} min={1} step={1} />
        <NumberField label="Poll cadence, delayed (s)" value={f.draft.delayed} onChange={(v) => f.set({ delayed: v ?? 1 })} min={1} step={1} />
        <NumberField label="Poll cadence, idle (s)" value={f.draft.idle} onChange={(v) => f.set({ idle: v ?? 1 })} min={1} step={1} help="Outside the session." />
        <NumberField label="Retention (days)" value={f.draft.retentionDays} onChange={(v) => f.set({ retentionDays: v ?? 1 })} min={1} step={1} help="Snapshots older than this are pruned." />
        <Toggle label="Archive Cboe delayed data" checked={f.draft.archiveCboe} onChange={(v) => f.set({ archiveCboe: v })} help="Cboe's site terms restrict storing its delayed data. Leave off unless you have confirmed your use is permitted; when off, delayed data is held in memory only." />
      </div>
      <Actions onSave={() => void f.submit()} onReset={f.reset} status={f.status} />
    </Panel>
  );
}

interface EventRow {
  label: string;
  date: string;
  time: string;
  severity: ScheduledEvent["severity"];
}

function toRow(e: ScheduledEvent): EventRow {
  const p = etParts(e.at);
  return { label: e.label, date: p.date, time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`, severity: e.severity };
}

function fromRow(r: EventRow): ScheduledEvent | null {
  const m = /^(\d{2}):(\d{2})$/.exec(r.time);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !r.label.trim()) return null;
  return { at: etToMs(r.date, Number(m[1]), Number(m[2])), label: r.label.trim(), severity: r.severity };
}

function Events({ s, save, today }: { s: AppSettings; save: Saver; today: string }) {
  const [rows, setRows] = useState<EventRow[]>(() => s.events.map(toRow));
  const [status, setStatus] = useState<FormStatusValue>({ kind: "idle" });
  const update = (i: number, p: Partial<EventRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const submit = async () => {
    const events: ScheduledEvent[] = [];
    for (const r of rows) {
      const e = fromRow(r);
      if (!e) {
        setStatus({ kind: "err", text: "Every event needs a label, a date (YYYY-MM-DD) and a time (HH:MM ET)." });
        return;
      }
      events.push(e);
    }
    events.sort((a, b) => a.at - b.at);
    setStatus({ kind: "busy", text: "Saving…" });
    try {
      await save({ events });
      setStatus({ kind: "ok", text: `Saved ${events.length} events.` });
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message });
    }
  };
  return (
    <Panel title="Scheduled events" meta={<span>times in ET; event risk uses the next upcoming event</span>}>
      {!rows.length ? <p className="muted small">No events. Add FOMC, CPI, payrolls and similar releases so the regime panel can flag event risk.</p> : null}
      <div className="stack">
        {rows.map((r, i) => (
          <div key={i} className="form-grid" style={{ alignItems: "end" }}>
            <TextField label="Label" value={r.label} onChange={(v) => update(i, { label: v })} />
            <TextField label="Date" value={r.date} onChange={(v) => update(i, { date: v })} mono placeholder={today} />
            <TextField label="Time (ET, HH:MM)" value={r.time} onChange={(v) => update(i, { time: v })} mono placeholder="14:00" />
            <SelectField
              label="Severity"
              value={r.severity}
              onChange={(v) => update(i, { severity: v })}
              options={[
                { value: "low", label: "low" },
                { value: "medium", label: "medium" },
                { value: "high", label: "high" },
              ]}
            />
            <div className="field">
              <Button kind="danger" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="form-actions">
        <Button onClick={() => setRows((rs) => [...rs, { label: "", date: today, time: "14:00", severity: "high" }])}>Add event</Button>
        <Button kind="primary" onClick={() => void submit()} disabled={status.kind === "busy"}>
          Save events
        </Button>
        <Button kind="ghost" onClick={() => setRows(s.events.map(toRow))}>
          Reset
        </Button>
        <FormStatus status={status} />
      </div>
    </Panel>
  );
}

function Schwab({ status: st, now, onChanged }: { status: SchwabStatus; now: number; onChanged: () => void }) {
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [fs, setFs] = useState<FormStatusValue>({ kind: "idle" });
  const [credId, setCredId] = useState("");
  const [credSecret, setCredSecret] = useState("");
  const [credStatus, setCredStatus] = useState<FormStatusValue>({ kind: "idle" });

  const connect = async () => {
    setFs({ kind: "busy", text: "Fetching the Schwab login URL…" });
    // open the tab synchronously (popup blockers) and point it at the URL once we have it
    const w = window.open("about:blank", "_blank");
    try {
      const { url } = await api.schwabAuthUrl();
      setAuthUrl(url);
      if (w) w.location.href = url;
      setFs({ kind: "ok", text: w ? "Login opened in a new tab." : "Popup blocked — use the link below." });
    } catch (e) {
      w?.close();
      setFs({ kind: "err", text: (e as Error).message });
    }
  };
  const submitCallback = async () => {
    if (!pasted.trim()) {
      setFs({ kind: "err", text: "Paste the full redirected URL first." });
      return;
    }
    setFs({ kind: "busy", text: "Exchanging the code…" });
    try {
      const r = await api.schwabCallback(pasted.trim());
      setFs({ kind: "ok", text: r.connected ? "Connected." : `Not connected${r.lastError ? `: ${r.lastError}` : ""}.` });
      setPasted("");
      onChanged();
    } catch (e) {
      setFs({ kind: "err", text: (e as Error).message });
    }
  };
  const disconnect = async () => {
    setFs({ kind: "busy", text: "Disconnecting…" });
    try {
      await api.schwabDisconnect();
      setFs({ kind: "ok", text: "Disconnected; tokens removed." });
      onChanged();
    } catch (e) {
      setFs({ kind: "err", text: (e as Error).message });
    }
  };
  const saveCredentials = async () => {
    if (!credId.trim() || !credSecret) {
      setCredStatus({ kind: "err", text: "Both the client ID and the secret are required." });
      return;
    }
    setCredStatus({ kind: "busy", text: "Saving…" });
    try {
      const r = await api.schwabCredentials(credId.trim(), credSecret);
      setCredStatus({ kind: "ok", text: `Saved server-side (credential source: ${r.credentialSource ?? "none"}).` });
      setCredId("");
      setCredSecret("");
      onChanged();
    } catch (e) {
      setCredStatus({ kind: "err", text: (e as Error).message });
    }
  };
  const refreshLeft = st.refreshExpiresAt !== null ? st.refreshExpiresAt - now : null;
  return (
    <Panel title="Schwab">
      <dl className="kv">
        <dt>Credentials</dt>
        <dd className="prose">
          {st.configured ? <span className="chip chip-ok">configured</span> : <span className="chip chip-bad">not configured</span>} <span className="small muted">source: {st.credentialSource ?? "none"}</span>
        </dd>
        <dt>Connection</dt>
        <dd className="prose">{st.connected ? <span className="chip chip-ok">connected</span> : <span className="chip chip-bad">not connected</span>}</dd>
        <dt>Access token</dt>
        <dd>{st.accessExpiresAt !== null ? `${st.accessExpiresAt > now ? "valid, refreshes" : "expired"} ${fmtAgo(now - st.accessExpiresAt)}` : "n/a"}</dd>
        <dt>Re-login needed by</dt>
        <dd>{st.refreshExpiresAt !== null && refreshLeft !== null ? `${fmtDateTime(st.refreshExpiresAt)} (${refreshLeft > 0 ? `in ${fmtMs(refreshLeft)}` : "expired — reconnect now"})` : "n/a — not connected"}</dd>
        <dt>Last refresh</dt>
        <dd>{st.lastRefreshAt !== null ? `${fmtTime(st.lastRefreshAt)} ET (${fmtAgo(now - st.lastRefreshAt)})` : "never"}</dd>
        {st.lastError ? (
          <>
            <dt>Last error</dt>
            <dd className="prose form-status-err">{st.lastError}</dd>
          </>
        ) : null}
      </dl>
      <div className="row">
        <Button kind="primary" onClick={() => void connect()} disabled={!st.configured}>
          Connect Schwab
        </Button>
        <Button kind="danger" onClick={() => void disconnect()} disabled={!st.connected}>
          Disconnect
        </Button>
        <FormStatus status={fs} />
      </div>
      {authUrl ? (
        <p className="small">
          <a href={authUrl} target="_blank" rel="noopener noreferrer">
            Open the Schwab login
          </a>{" "}
          <span className="muted">(if the tab did not open)</span>
        </p>
      ) : null}
      <p className="small" style={{ maxWidth: "72ch" }}>
        After logging in, Schwab redirects to <code>https://127.0.0.1:8182/?code=…</code> which will show a browser error — copy the FULL URL from the address bar within 30 seconds and paste it below.
      </p>
      <div className="form-grid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <TextField label="Redirected URL" value={pasted} onChange={setPasted} mono placeholder="https://127.0.0.1:8182/?code=…&session=…" autoComplete="off" />
      </div>
      <div className="form-actions">
        <Button onClick={() => void submitCallback()} disabled={!st.configured}>
          Submit redirected URL
        </Button>
      </div>
      <div className="stack" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <h3>Client credentials</h3>
        <p className="small muted" style={{ maxWidth: "72ch" }}>
          Use this if the credentials deployed as secrets are wrong or missing (credential source above shows which is active). Stored server-side, never displayed.
        </p>
        <div className="form-grid">
          <TextField label="Client ID" type="password" value={credId} onChange={setCredId} mono autoComplete="off" />
          <TextField label="Client secret" type="password" value={credSecret} onChange={setCredSecret} mono autoComplete="off" />
        </div>
        <div className="form-actions">
          <Button onClick={() => void saveCredentials()} disabled={credStatus.kind === "busy"}>
            Save credentials
          </Button>
          <FormStatus status={credStatus} />
        </div>
      </div>
    </Panel>
  );
}

function Account() {
  const me = useFetch((sig) => api.me(sig), "me");
  const [status, setStatus] = useState<FormStatusValue>({ kind: "idle" });
  const logout = async () => {
    setStatus({ kind: "busy", text: "Signing out…" });
    try {
      await api.logout();
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message });
      return;
    }
    window.location.reload();
  };
  return (
    <Panel title="Account">
      <div className="row">
        <span>
          Signed in as <span className="mono">{me.data?.sub ?? (me.error ? `unknown (${me.error})` : "…")}</span>
        </span>
        <Button onClick={() => void logout()}>Sign out</Button>
        <FormStatus status={status} />
      </div>
    </Panel>
  );
}

export function SettingsView({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const conn = useServer();
  const now = useServerNow();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gen, setGen] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .getSettings()
      .then((s) => {
        if (!alive) return;
        setSettings(s);
        setLoadError(null);
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [gen]);

  const save: Saver = async (patch) => {
    const next = await api.putSettings(patch);
    setSettings(next);
    conn.refresh();
  };
  const s = conn.state;
  const today = s?.clock.date ?? new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="view-head">
        <h1>Settings</h1>
        <p className="panel-meta">
          <span>stored on the server; each section saves independently</span>
        </p>
      </div>
      <Panel title="Appearance">
        <div className="segmented" role="group" aria-label="Theme">
          <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>
            Dark
          </button>
          <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>
            Light
          </button>
        </div>
        <p className="xs muted">Only the theme choice is kept in this browser; nothing else is stored locally.</p>
      </Panel>
      {s ? <Schwab status={s.schwab} now={now} onChanged={() => conn.refresh()} /> : null}
      <Panel title="Feed health" meta={s ? <span>server time {fmtTime(s.serverTime)} ET</span> : undefined}>
        {s ? <FeedHealthTable feeds={s.feeds} now={now} /> : <p className="muted small">Waiting for state…</p>}
        {s?.lastTick ? (
          <p className="small muted">
            Last engine tick {fmtTime(s.lastTick.at)} ET, {fmtMs(s.lastTick.durationMs)} ({s.lastTick.mode}); {s.tickStats.n} ticks, average {fmtMs(s.tickStats.avgMs)}.
          </p>
        ) : null}
      </Panel>
      {loadError && !settings ? <Empty>Cannot load settings: {loadError}</Empty> : null}
      {settings ? (
        <div key={gen} className="stack" style={{ gap: 16 }}>
          <Budgets s={settings} save={save} />
          <Execution s={settings} save={save} />
          <Costs s={settings} save={save} />
          <Closing s={settings} save={save} />
          <Polling s={settings} save={save} />
          <Events s={settings} save={save} today={today} />
          <div className="row">
            <Button kind="ghost" onClick={() => setGen((g) => g + 1)}>
              Reload all sections from the server
            </Button>
          </div>
        </div>
      ) : !loadError ? (
        <Empty>Loading settings…</Empty>
      ) : null}
      <Account />
    </>
  );
}
