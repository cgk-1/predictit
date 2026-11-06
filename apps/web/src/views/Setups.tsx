import type { SetupCandidate, SetupLifecycle } from "@predictit/engine";
import { api } from "../api/client";
import { useServer, useServerNow } from "../api/context";
import { CandidateCard } from "../components/CandidateCard";
import { ContractsTable } from "../components/ContractsTable";
import { Empty, Panel } from "../components/Panel";
import { ModeBadge } from "../components/Badges";
import { useFetch } from "../lib/useFetch";
import { useLinkClick } from "../lib/router";
import { fmtTime, fmtUsd } from "../lib/format";

const ORDER: SetupLifecycle[] = ["triggered", "armed", "forming", "invalidated", "expired"];

export function SetupsView() {
  const { state: s } = useServer();
  const now = useServerNow();
  const grades = useFetch((sig) => api.grades(sig), "grades", 60_000);
  const toSettings = useLinkClick("/settings");
  const d = s?.decision ?? null;
  if (!s) return <Empty>Connecting…</Empty>;
  if (!d) return <Empty>No decision yet, so there are no candidates to show.</Empty>;
  const byFamily = grades.data?.summary.byFamily;
  const budget = s.settings.engine.maxPremiumPerContract;
  const groups = new Map<SetupLifecycle, SetupCandidate[]>();
  for (const c of d.candidates) groups.set(c.lifecycle, [...(groups.get(c.lifecycle) ?? []), c]);
  return (
    <>
      <div className="view-head">
        <h1>Setups</h1>
        <p className="panel-meta">
          <span>decision v{d.version}</span>
          <span>as of {fmtTime(d.asOf)} ET</span>
          <ModeBadge mode={d.mode} />
          <span>{d.candidates.length} candidates</span>
        </p>
      </div>
      {!d.candidates.length ? <Empty>No candidate setups in this frame. The reasons per family are listed below.</Empty> : null}
      {grades.error && !grades.data ? <p className="xs muted">Family grades unavailable: {grades.error}</p> : null}
      {ORDER.filter((l) => groups.has(l)).map((l) => (
        <section key={l} className="stack" aria-label={`${l} candidates`}>
          <h2 style={{ textTransform: "capitalize" }}>
            {l} <span className="muted" style={{ fontWeight: 400 }}>({groups.get(l)!.length})</span>
          </h2>
          <div className="grid-2">
            {groups.get(l)!.map((c) => (
              <CandidateCard key={c.id} c={c} now={now} grade={byFamily ? byFamily[c.family] ?? null : undefined} />
            ))}
          </div>
        </section>
      ))}
      <Panel title="Ranked contracts" meta={d.primary ? <span>for {d.primary.name} ({d.primary.direction}), ranked at {fmtTime(d.asOf)} ET</span> : <span>no primary setup</span>}>
        <p className="small muted">
          Budget: {fmtUsd(budget)} per contract (
          <a href="/settings" onClick={toSettings}>
            Settings
          </a>
          ). Contracts over it stay listed, dimmed, with the reason.
        </p>
        <ContractsTable contracts={d.contracts} asOf={d.asOf} budgetUsd={budget} />
        {d.rankingNotes.length > 0 && (
          <ul className="reasons small muted">
            {d.rankingNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        {d.rankingAssumptions.length > 0 && (
          <div>
            <div className="section-title">Ranking assumptions</div>
            <ul className="reasons small">
              {d.rankingAssumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
      <Panel title="Why no setup, per family" meta={<span>{d.waits.length} families reported</span>}>
        {!d.waits.length ? (
          <p className="muted small">Every applicable family produced a candidate, or the session is outside regular hours.</p>
        ) : (
          <dl className="kv">
            {d.waits.map((w, i) => (
              <div key={i} style={{ display: "contents" }}>
                <dt className="mono">{w.family}</dt>
                <dd className="prose">{w.reason}</dd>
              </div>
            ))}
          </dl>
        )}
      </Panel>
    </>
  );
}
