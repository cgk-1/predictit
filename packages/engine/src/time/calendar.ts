/**
 * US equity/index-option exchange calendar (NYSE / Cboe). Holidays and early closes are listed
 * explicitly per year with their sources (see docs/research/contracts.md). Unknown years fall back to
 * weekday-only logic and are flagged `calendarVerified: false` so the UI can warn.
 *
 * Regular session: 09:30-16:00 ET. SPX/SPXW options regular session: 09:30-16:15 ET, EXCEPT that
 * PM-settled contracts stop trading at 16:00 ET on their expiration day (Cboe rule; see memo).
 * Early-close days: equities close 13:00 ET; SPX options 13:15 ET (expiring PM-settled: 13:00).
 */
import { addDays, etToMs, weekdayOf } from "./et";

export interface Holiday { date: string; name: string }

// Full-day closures. Sources: NYSE holidays & hours page and Cboe holiday calendar (accessed 2026-11-06).
const HOLIDAYS: Record<number, Holiday[]> = {
  2024: [
    { date: "2024-01-01", name: "New Year's Day" }, { date: "2024-01-15", name: "Martin Luther King Jr. Day" },
    { date: "2024-02-19", name: "Presidents' Day" }, { date: "2024-03-29", name: "Good Friday" },
    { date: "2024-05-27", name: "Memorial Day" }, { date: "2024-06-19", name: "Juneteenth" },
    { date: "2024-07-04", name: "Independence Day" }, { date: "2024-09-02", name: "Labor Day" },
    { date: "2024-11-28", name: "Thanksgiving Day" }, { date: "2024-12-25", name: "Christmas Day" },
  ],
  2025: [
    { date: "2025-01-01", name: "New Year's Day" }, { date: "2025-01-09", name: "National Day of Mourning (Carter)" },
    { date: "2025-01-20", name: "Martin Luther King Jr. Day" }, { date: "2025-02-17", name: "Presidents' Day" },
    { date: "2025-04-18", name: "Good Friday" }, { date: "2025-05-26", name: "Memorial Day" },
    { date: "2025-06-19", name: "Juneteenth" }, { date: "2025-07-04", name: "Independence Day" },
    { date: "2025-09-01", name: "Labor Day" }, { date: "2025-11-27", name: "Thanksgiving Day" },
    { date: "2025-12-25", name: "Christmas Day" },
  ],
  2026: [
    { date: "2026-01-01", name: "New Year's Day" }, { date: "2026-01-19", name: "Martin Luther King Jr. Day" },
    { date: "2026-02-16", name: "Presidents' Day" }, { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-05-25", name: "Memorial Day" }, { date: "2026-06-19", name: "Juneteenth" },
    { date: "2026-07-03", name: "Independence Day (observed)" }, { date: "2026-09-07", name: "Labor Day" },
    { date: "2026-11-26", name: "Thanksgiving Day" }, { date: "2026-12-25", name: "Christmas Day" },
  ],
  2027: [
    { date: "2027-01-01", name: "New Year's Day" }, { date: "2027-01-18", name: "Martin Luther King Jr. Day" },
    { date: "2027-02-15", name: "Presidents' Day" }, { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-05-31", name: "Memorial Day" }, { date: "2027-06-18", name: "Juneteenth (observed)" },
    { date: "2027-07-05", name: "Independence Day (observed)" }, { date: "2027-09-06", name: "Labor Day" },
    { date: "2027-11-25", name: "Thanksgiving Day" }, { date: "2027-12-24", name: "Christmas Day (observed)" },
  ],
};

// 13:00 ET equity close days.
const EARLY_CLOSES: Record<number, Holiday[]> = {
  2024: [{ date: "2024-07-03", name: "Day before Independence Day" }, { date: "2024-11-29", name: "Day after Thanksgiving" }, { date: "2024-12-24", name: "Christmas Eve" }],
  2025: [{ date: "2025-07-03", name: "Day before Independence Day" }, { date: "2025-11-28", name: "Day after Thanksgiving" }, { date: "2025-12-24", name: "Christmas Eve" }],
  2026: [{ date: "2026-11-27", name: "Day after Thanksgiving" }, { date: "2026-12-24", name: "Christmas Eve" }],
  2027: [{ date: "2027-11-26", name: "Day after Thanksgiving" }],
};

export interface SessionInfo {
  date: string;
  isTradingDay: boolean;
  isEarlyClose: boolean;
  holidayName?: string;
  calendarVerified: boolean;
  /** ET minutes-of-day for equity/index regular session */
  equityOpenMin: number;
  equityCloseMin: number;
  /** SPX options regular-session close (non-expiring series). */
  spxOptionsCloseMin: number;
  /** Close for PM-settled contracts expiring this day. */
  expiringPmCloseMin: number;
  /** Absolute instants (ms) */
  openMs: number;
  closeMs: number;
  spxOptionsCloseMs: number;
}

export function holidayFor(date: string): Holiday | undefined {
  const y = Number(date.slice(0, 4));
  return HOLIDAYS[y]?.find((h) => h.date === date);
}

export function earlyCloseFor(date: string): Holiday | undefined {
  const y = Number(date.slice(0, 4));
  return EARLY_CLOSES[y]?.find((h) => h.date === date);
}

export function isCalendarYearVerified(year: number): boolean {
  return year in HOLIDAYS;
}

const SESSION_CACHE = new Map<string, SessionInfo>();

export function sessionInfo(date: string): SessionInfo {
  const cached = SESSION_CACHE.get(date);
  if (cached) return cached;
  const info = computeSessionInfo(date);
  if (SESSION_CACHE.size > 5000) SESSION_CACHE.clear();
  SESSION_CACHE.set(date, info);
  return info;
}

function computeSessionInfo(date: string): SessionInfo {
  const wd = weekdayOf(date);
  const hol = holidayFor(date);
  const early = earlyCloseFor(date);
  const isTradingDay = wd >= 1 && wd <= 5 && !hol;
  const equityOpenMin = 9 * 60 + 30;
  const equityCloseMin = early ? 13 * 60 : 16 * 60;
  const spxOptionsCloseMin = equityCloseMin + 15;
  const expiringPmCloseMin = equityCloseMin;
  return {
    date,
    isTradingDay,
    isEarlyClose: !!early,
    holidayName: hol?.name ?? early?.name,
    calendarVerified: isCalendarYearVerified(Number(date.slice(0, 4))),
    equityOpenMin,
    equityCloseMin,
    spxOptionsCloseMin,
    expiringPmCloseMin,
    openMs: etToMs(date, 9, 30),
    closeMs: etToMs(date, Math.floor(equityCloseMin / 60), equityCloseMin % 60),
    spxOptionsCloseMs: etToMs(date, Math.floor(spxOptionsCloseMin / 60), spxOptionsCloseMin % 60),
  };
}

export function isTradingDay(date: string): boolean {
  return sessionInfo(date).isTradingDay;
}

export function nextTradingDay(date: string): string {
  let d = addDays(date, 1);
  for (let i = 0; i < 15; i++) {
    if (isTradingDay(d)) return d;
    d = addDays(d, 1);
  }
  throw new Error("no trading day found");
}

export function prevTradingDay(date: string): string {
  let d = addDays(date, -1);
  for (let i = 0; i < 15; i++) {
    if (isTradingDay(d)) return d;
    d = addDays(d, -1);
  }
  throw new Error("no trading day found");
}

/** Number of trading days strictly after `from` up to and including `to`. */
export function tradingDaysBetween(from: string, to: string): number {
  if (to <= from) return 0;
  let n = 0;
  let d = addDays(from, 1);
  while (d <= to) {
    if (isTradingDay(d)) n++;
    d = addDays(d, 1);
  }
  return n;
}

/** Third Friday of a month (standard monthly expiration), moved to the prior trading day if a holiday. */
export function thirdFriday(year: number, month: number): string {
  const first = `${year}-${month < 10 ? "0" + month : month}-01`;
  const wd = weekdayOf(first);
  const offset = (5 - wd + 7) % 7;
  let d = addDays(first, offset + 14);
  while (!isTradingDay(d)) d = addDays(d, -1);
  return d;
}
