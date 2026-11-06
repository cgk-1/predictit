/**
 * Calendar and multi-day context features: day of week, prior-day behaviour (return, closing strength, last-30-minute
 * drift), overnight gap and gap-fill state, week-to-date and prior-week returns, time-of-day bucket, and whether today
 * is a monthly OPEX / early close. Multi-day inputs require bars from prior sessions (Schwab price history);
 * with today-only feeds every multi-day field is null and `coverageDays` says how much history was available.
 */
import type { Bar1m } from "../types";
import { etParts, etDate } from "../time/et";
import { sessionInfo, isTradingDay, thirdFriday } from "../time/calendar";
import { completedBars } from "./bars";

export interface DaySummary {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** close at ~15:30 ET (bar close), if available */
  at1530: number | null;
  /** (close − low) / (high − low): 1 = closed at the high */
  closeLocation: number | null;
  /** close vs 15:30 in points (closing-drive direction) */
  last30Drift: number | null;
  ret: number | null;
}

export interface CalendarFeatures {
  date: string;
  dayOfWeek: number;
  dayName: string;
  isMonthlyOpex: boolean;
  isEarlyClose: boolean;
  /** 'open' 09:30-10:30, 'mid' 10:30-14:00, 'late' 14:00-15:30, 'close' 15:30-16:00 */
  timeBucket: "pre" | "open" | "mid" | "late" | "close" | "post";
  coverageDays: number;
  prior: DaySummary | null;
  today: { open: number | null; gapPts: number | null; gapPct: number | null; gapFilled: boolean | null; gapFillLevel: number | null } ;
  weekToDatePct: number | null;
  priorWeek: { ret: number | null; high: number | null; low: number | null; close: number | null } | null;
  daysSinceSession: number | null;
}

export function summarizeDay(bars: Bar1m[], date: string): DaySummary | null {
  const b = bars.filter((x) => etDate(x.t) === date);
  if (!b.length) return null;
  const s = sessionInfo(date);
  const at1530Min = s.equityCloseMin - 30;
  const bar1530 = [...b].reverse().find((x) => etParts(x.t).minuteOfDay + 1 <= at1530Min);
  const high = Math.max(...b.map((x) => x.h));
  const low = Math.min(...b.map((x) => x.l));
  const close = b[b.length - 1]!.c;
  const open = b[0]!.o;
  return {
    date,
    open,
    high,
    low,
    close,
    at1530: bar1530?.c ?? null,
    closeLocation: high > low ? (close - low) / (high - low) : null,
    last30Drift: bar1530 ? close - bar1530.c : null,
    ret: null,
  };
}

export function calendarFeatures(allBars: Bar1m[], asOf: number, priorClose?: number | null): CalendarFeatures {
  const p = etParts(asOf);
  const date = p.date;
  const bars = completedBars(allBars, asOf);
  const dates = [...new Set(bars.map((b) => etDate(b.t)))].sort();
  const prevDates = dates.filter((d) => d < date);
  const todayBars = bars.filter((b) => etDate(b.t) === date);
  const s = sessionInfo(date);
  const m = p.minuteOfDay;
  const timeBucket: CalendarFeatures["timeBucket"] = m < s.equityOpenMin ? "pre" : m < s.equityOpenMin + 60 ? "open" : m < s.equityCloseMin - 120 ? "mid" : m < s.equityCloseMin - 30 ? "late" : m < s.equityCloseMin ? "close" : "post";
  // prior day
  let prior: DaySummary | null = null;
  if (prevDates.length) {
    const pd = prevDates[prevDates.length - 1]!;
    prior = summarizeDay(bars, pd);
    const pp = prevDates.length >= 2 ? summarizeDay(bars, prevDates[prevDates.length - 2]!) : null;
    if (prior && pp) prior.ret = prior.close / pp.close - 1;
  }
  const refPriorClose = prior?.close ?? priorClose ?? null;
  const open = todayBars[0]?.o ?? null;
  const gapPts = open !== null && refPriorClose !== null ? open - refPriorClose : null;
  let gapFilled: boolean | null = null;
  if (gapPts !== null && refPriorClose !== null && todayBars.length) {
    gapFilled = gapPts > 0 ? todayBars.some((b) => b.l <= refPriorClose) : gapPts < 0 ? todayBars.some((b) => b.h >= refPriorClose) : true;
  }
  // week to date / prior week (ISO week by ET date)
  const weekKey = (d: string) => {
    const [y, mo, da] = d.split("-").map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, mo - 1, da));
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
    return `${dt.getUTCFullYear()}-${Math.ceil(((dt.getTime() - yearStart) / 86400000 + 1) / 7)}`;
  };
  const wk = weekKey(date);
  const thisWeekPrev = prevDates.filter((d) => weekKey(d) === wk);
  const lastWeekDates = prevDates.filter((d) => weekKey(d) !== wk);
  const lastWk = lastWeekDates.length ? weekKey(lastWeekDates[lastWeekDates.length - 1]!) : null;
  const priorWeekDates = lastWk ? prevDates.filter((d) => weekKey(d) === lastWk) : [];
  let weekToDatePct: number | null = null;
  const last = todayBars.length ? todayBars[todayBars.length - 1]!.c : null;
  if (last !== null) {
    const anchorDate = thisWeekPrev.length ? (priorWeekDates.length ? priorWeekDates[priorWeekDates.length - 1]! : null) : prevDates.length ? prevDates[prevDates.length - 1]! : null;
    // anchor = close of the last session of the prior week (if we have it), else prior session close
    const anchor = anchorDate ? summarizeDay(bars, anchorDate)?.close ?? null : refPriorClose;
    if (anchor) weekToDatePct = last / anchor - 1;
  }
  let priorWeek: CalendarFeatures["priorWeek"] = null;
  if (priorWeekDates.length) {
    const ds = priorWeekDates.map((d) => summarizeDay(bars, d)!).filter(Boolean);
    const before = prevDates.filter((d) => d < priorWeekDates[0]!);
    const baseClose = before.length ? summarizeDay(bars, before[before.length - 1]!)?.close ?? null : null;
    priorWeek = { ret: baseClose ? ds[ds.length - 1]!.close / baseClose - 1 : null, high: Math.max(...ds.map((d) => d.high)), low: Math.min(...ds.map((d) => d.low)), close: ds[ds.length - 1]!.close };
  }
  const y = Number(date.slice(0, 4));
  const mo = Number(date.slice(5, 7));
  let daysSinceSession: number | null = null;
  if (prevDates.length) {
    const pd = prevDates[prevDates.length - 1]!;
    daysSinceSession = Math.round((Date.parse(date) - Date.parse(pd)) / 86400000);
  }
  return {
    date,
    dayOfWeek: p.weekday,
    dayName: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][p.weekday]!,
    isMonthlyOpex: thirdFriday(y, mo) === date,
    isEarlyClose: s.isEarlyClose,
    timeBucket,
    coverageDays: dates.length,
    prior,
    today: { open, gapPts, gapPct: gapPts !== null && refPriorClose ? gapPts / refPriorClose : null, gapFilled, gapFillLevel: gapPts !== null && gapPts !== 0 ? refPriorClose : null },
    weekToDatePct,
    priorWeek,
    daysSinceSession,
  };
}

export { isTradingDay };
