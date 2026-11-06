import { PHASE_LABEL } from "@predictit/engine";
import type { ServerState } from "../api/types";
import type { ServerConnection } from "../api/useServerState";
import { ModeBadge } from "./Badges";
import { useInstrument } from "../api/context";

export function InstrumentToggle() {
  const [inst, setInst] = useInstrument();
  return (
    <div className="segmented" role="group" aria-label="Instrument">
      {(["SPX", "SPY"] as const).map((i) => (
        <button key={i} type="button" className={inst === i ? "active" : undefined} aria-pressed={inst === i} onClick={() => setInst(i)}>
          {i}
        </button>
      ))}
    </div>
  );
}
import { FeedChips } from "./FeedHealth";
import { fmtAgo, fmtMs, fmtTime } from "../lib/format";

/** Age beyond which the engine is considered stuck: 30 s, or twice the configured cadence for the current mode if that is longer. */
export function staleThresholdMs(state: ServerState): number {
  const cadenceSec = state.mode === "LIVE" ? state.settings.pollSec.live : state.mode === "DELAYED" ? state.settings.pollSec.delayed : state.clock.isRegularSession ? state.settings.pollSec.delayed : state.settings.pollSec.idle;
  return Math.max(30_000, 2 * (cadenceSec || 0) * 1000);
}

export function isStale(state: ServerState, now: number): { stale: boolean; reason: string | null } {
  if (state.evaluatedAt === null) return { stale: true, reason: "the engine has not evaluated a frame yet" };
  const age = now - state.evaluatedAt;
  if (age > staleThresholdMs(state)) return { stale: true, reason: `last evaluation ${fmtAgo(age)} (${fmtTime(state.evaluatedAt)} ET)` };
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
        <InstrumentToggle />
        <ModeBadge mode={s?.mode ?? "NONE"} />
        <span className="clock" title={`Server time (ET), corrected for a client clock offset of ${Math.round(conn.offsetMs)} ms`}>
          <span>{fmtTime(now)}</span>
          <span className="faint xs">ET</span>
          {s ? (
            <span className="clock-phase">
              {PHASE_LABEL[s.clock.phase]}
              {s.clock.isRegularSession ? `, ${Math.max(0, Math.floor(s.clock.minutesToClose))} min to close` : ""}
            </span>
          ) : null}
        </span>
      </div>
      <div className="statusbar-group">
        {s ? <FeedChips feeds={s.feeds} now={now} /> : null}
        {s?.lastTick ? (
          <span className="feedchip feedchip-tick" title={`Last engine tick ${fmtTime(s.lastTick.at)} ET, ${fmtMs(s.lastTick.durationMs)} (${s.lastTick.mode}); ${s.tickStats.n} ticks, avg ${fmtMs(s.tickStats.avgMs)}`}>
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
