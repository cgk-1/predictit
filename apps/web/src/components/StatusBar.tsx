import { PHASE_LABEL } from "@predictit/engine";
import type { ServerState } from "../api/types";
import type { ServerConnection } from "../api/useServerState";
import { ModeBadge } from "./Badges";
import { FeedChips } from "./FeedHealth";
import { fmtAgo, fmtMs, fmtTime } from "../lib/format";

export function isStale(state: ServerState, now: number): { stale: boolean; reason: string | null } {
  if (state.evaluatedAt === null) return { stale: true, reason: "the engine has not evaluated a frame yet" };
  const age = now - state.evaluatedAt;
  if (age > 30_000) return { stale: true, reason: `last evaluation ${fmtAgo(age)} (${fmtTime(state.evaluatedAt)} ET)` };
  if (state.decision && now > state.decision.expiresAt) return { stale: true, reason: `decision expired at ${fmtTime(state.decision.expiresAt)} ET` };
  return { stale: false, reason: null };
}

export function StatusBar({ conn, now, menuOpen, onToggleMenu }: { conn: ServerConnection; now: number; menuOpen: boolean; onToggleMenu: () => void }) {
  const s = conn.state;
  const stale = s ? isStale(s, now) : null;
  return (
    <header className="statusbar">
      <button type="button" className="btn btn-sm menu-btn" aria-expanded={menuOpen} aria-controls="rail" onClick={onToggleMenu}>
        {menuOpen ? "Close" : "Menu"}
      </button>
      <span className="topbar-brand">predictit</span>
      <div className="statusbar-group">
        <ModeBadge mode={s?.mode ?? "NONE"} />
        <span className="clock" title={`Server time (ET), corrected for a client clock offset of ${Math.round(conn.offsetMs)} ms`}>
          <span>{fmtTime(now)}</span>
          <span className="faint xs">ET</span>
          {s ? (
            <span className="clock-phase">
              {PHASE_LABEL[s.clock.phase]}
              {s.clock.isRegularSession ? ` · ${Math.max(0, Math.floor(s.clock.minutesToClose))} min to close` : ""}
            </span>
          ) : null}
        </span>
      </div>
      <div className="statusbar-group">
        {s ? <FeedChips feeds={s.feeds} now={now} /> : null}
        {s?.lastTick ? (
          <span className="feedchip" title={`Last engine tick ${fmtTime(s.lastTick.at)} ET, ${fmtMs(s.lastTick.durationMs)} (${s.lastTick.mode}); ${s.tickStats.n} ticks, avg ${fmtMs(s.tickStats.avgMs)}`}>
            <span>tick {fmtAgo(now - s.lastTick.at)}</span>
          </span>
        ) : null}
        {stale?.stale ? (
          <span className="chip chip-wait" title={stale.reason ?? undefined}>
            stale
          </span>
        ) : null}
        {conn.consecutiveErrors > 0 ? <span className="chip chip-bad">reconnecting</span> : null}
      </div>
    </header>
  );
}
