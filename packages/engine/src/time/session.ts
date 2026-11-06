import { etParts } from "./et";
import { sessionInfo, type SessionInfo } from "./calendar";

export type SessionPhase =
  | "closed"
  | "premarket"
  | "opening"
  | "morning"
  | "midday"
  | "afternoon"
  | "final-hour"
  | "final-ten"
  | "post-close";

export interface SessionClock {
  now: number;
  date: string;
  session: SessionInfo;
  phase: SessionPhase;
  /** minutes since ET midnight (fractional) */
  minuteOfDay: number;
  /** minutes until equity close (negative after close) */
  minutesToClose: number;
  /** seconds until equity close */
  secondsToClose: number;
  /** minutes since open (negative before) */
  minutesSinceOpen: number;
  /** fraction of the regular session elapsed, clamped 0..1 */
  sessionFraction: number;
  isRegularSession: boolean;
  /** True from close-10min to close on trading days. */
  inClosingWindow: boolean;
}

/**
 * Phase boundaries are defined relative to the actual open/close so early-close days keep their shape.
 * Regular day: opening 9:30-9:45, morning 9:45-11:30, midday 11:30-14:00, afternoon 14:00-15:00,
 * final-hour 15:00-15:50, final-ten 15:50-16:00.
 */
export function sessionClock(now: number): SessionClock {
  const p = etParts(now);
  const session = sessionInfo(p.date);
  const m = p.minuteOfDay;
  const open = session.equityOpenMin;
  const close = session.equityCloseMin;
  const len = close - open;
  let phase: SessionPhase = "closed";
  if (session.isTradingDay) {
    if (m < open) phase = m >= 4 * 60 ? "premarket" : "closed";
    else if (m >= close) phase = m < close + 60 ? "post-close" : "closed";
    else if (m >= close - 10) phase = "final-ten";
    else if (m >= close - 60) phase = "final-hour";
    else if (m < open + 15) phase = "opening";
    else {
      // scale interior phases to session length (regular: 390 min)
      const f = (m - open) / len;
      if (f < 120 / 390) phase = "morning";
      else if (f < 270 / 390) phase = "midday";
      else phase = "afternoon";
    }
  }
  const minutesToClose = close - m;
  return {
    now,
    date: p.date,
    session,
    phase,
    minuteOfDay: m,
    minutesToClose,
    secondsToClose: Math.round(minutesToClose * 60),
    minutesSinceOpen: m - open,
    sessionFraction: Math.min(1, Math.max(0, (m - open) / len)),
    isRegularSession: session.isTradingDay && m >= open && m < close,
    inClosingWindow: session.isTradingDay && m >= close - 10 && m < close,
  };
}

export const PHASE_LABEL: Record<SessionPhase, string> = {
  closed: "Closed",
  premarket: "Premarket",
  opening: "Opening (first 15m)",
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  "final-hour": "Final hour",
  "final-ten": "Final ten minutes",
  "post-close": "Post-close",
};
