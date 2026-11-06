/**
 * Time-to-expiry conventions.
 *
 * Vendors (e.g. Cboe delayed quotes) quote IV using CALENDAR time (hours/8760). For intraday decisions we use
 * TRADING time: remaining regular-session minutes / (252 * 390). Under trading time the annualized IV of a 0DTE
 * ATM option is comparable to VIX-like numbers; under calendar time it is inflated by ~sqrt(5.3) ≈ 2.3x on a day
 * with 5 hours left. Everything in this package states which convention it uses.
 */
import { etParts } from "../time/et";
import { sessionInfo, tradingDaysBetween } from "../time/calendar";
import { pmSettlementMs, amSettlementMs, seriesSpec } from "../contracts/series";
import type { OptionRoot } from "../types";

export type TimeConvention = "trading" | "calendar";

export const TRADING_MINUTES_PER_YEAR = 252 * 390;
export const CALENDAR_MINUTES_PER_YEAR = 365 * 24 * 60;

const EXP_CACHE = new Map<string, number>();

export function expiryInstantMs(root: OptionRoot, expiry: string): number {
  const key = `${root}|${expiry}`;
  const c = EXP_CACHE.get(key);
  if (c !== undefined) return c;
  const v = seriesSpec(root).settlement === "AM" ? amSettlementMs(expiry) : pmSettlementMs(expiry);
  if (EXP_CACHE.size > 5000) EXP_CACHE.clear();
  EXP_CACHE.set(key, v);
  return v;
}

/** Remaining regular-session minutes from `now` until `expiryMs` (both ms). Non-session time is ignored. */
const TMR_CACHE = new Map<string, number>();

export function tradingMinutesRemaining(now: number, expiryMs: number): number {
  if (expiryMs <= now) return 0;
  const key = `${now}|${expiryMs}`;
  const hit = TMR_CACHE.get(key);
  if (hit !== undefined) return hit;
  const v = computeTradingMinutesRemaining(now, expiryMs);
  if (TMR_CACHE.size > 20000) TMR_CACHE.clear();
  TMR_CACHE.set(key, v);
  return v;
}

function computeTradingMinutesRemaining(now: number, expiryMs: number): number {
  const p = etParts(now);
  const today = sessionInfo(p.date);
  const pe = etParts(expiryMs);
  const expirySession = sessionInfo(pe.date);
  // minutes left today
  const closeToday = today.isTradingDay ? today.equityCloseMin : today.equityOpenMin;
  let total = 0;
  if (pe.date === p.date) {
    const endMin = Math.min(pe.minuteOfDay, closeToday);
    total = Math.max(0, endMin - Math.max(p.minuteOfDay, today.equityOpenMin));
    return total;
  }
  if (today.isTradingDay) total += Math.max(0, closeToday - Math.max(p.minuteOfDay, today.equityOpenMin));
  // full days strictly between
  const between = tradingDaysBetween(p.date, pe.date) - (expirySession.isTradingDay ? 1 : 0);
  total += Math.max(0, between) * 390; // approximation: early-close days between count as full days (rare)
  // expiry day minutes
  if (expirySession.isTradingDay) {
    total += Math.max(0, Math.min(pe.minuteOfDay, expirySession.equityCloseMin) - expirySession.equityOpenMin);
  }
  return total;
}

/** Years to expiry under the chosen convention. */
export function yearsToExpiry(now: number, expiryMs: number, convention: TimeConvention = "trading"): number {
  if (expiryMs <= now) return 0;
  if (convention === "calendar") return (expiryMs - now) / 60000 / CALENDAR_MINUTES_PER_YEAR;
  return tradingMinutesRemaining(now, expiryMs) / TRADING_MINUTES_PER_YEAR;
}

/** Convert an annualized sigma to the standard deviation of log return over `minutes` of trading time. */
export function sigmaOverMinutes(annualSigma: number, minutes: number, convention: TimeConvention = "trading"): number {
  const per = convention === "trading" ? TRADING_MINUTES_PER_YEAR : CALENDAR_MINUTES_PER_YEAR;
  return annualSigma * Math.sqrt(Math.max(0, minutes) / per);
}
