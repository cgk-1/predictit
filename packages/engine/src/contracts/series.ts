/**
 * Series rules for SPX (standard monthly, AM-settled to SET), SPXO (AM-settled weekdays, launched 2026-11-09,
 * settling to SET), SPXW (PM-settled weeklies/dailies, settling to the official S&P 500 close), XSP and SPY.
 * Facts are sourced in docs/research/contracts.md. Settlement style is ALWAYS derived from the root symbol.
 * Anything that could change by rule filing is centralised here so a single edit updates the whole platform.
 */
import type { ExerciseStyle, OptionRoot, SettlementStyle } from "../types";
import { etToMs } from "../time/et";
import { sessionInfo, thirdFriday } from "../time/calendar";

export const MULTIPLIER = 100 as const;

export interface SeriesSpec {
  root: OptionRoot;
  settlement: SettlementStyle;
  exercise: ExerciseStyle;
  delivery: "cash" | "physical";
  multiplier: 100;
}

export function seriesSpec(root: OptionRoot): SeriesSpec {
  switch (root) {
    case "SPX":
    case "SPXO":
      return { root, settlement: "AM", exercise: "european", delivery: "cash", multiplier: MULTIPLIER };
    case "SPXW":
    case "XSP":
      return { root, settlement: "PM", exercise: "european", delivery: "cash", multiplier: MULTIPLIER };
    case "SPY":
      return { root, settlement: "PM", exercise: "american", delivery: "physical", multiplier: MULTIPLIER };
  }
}

/** Is this date the standard monthly (3rd Friday) expiration? */
export function isStandardMonthly(expiry: string): boolean {
  const y = Number(expiry.slice(0, 4));
  const m = Number(expiry.slice(5, 7));
  return thirdFriday(y, m) === expiry;
}

/**
 * Last instant a contract can trade in the regular session (ms).
 *  - PM-settled SPXW/XSP expiring today stop at the equity close (16:00 ET; 13:00 on early-close days).
 *  - Non-expiring SPX/SPXW/SPXO/XSP series trade to 16:15 ET (13:15 on early-close days).
 *  - AM-settled SPX/SPXO expire at the open; they do not trade on expiration day (RTH).
 *  - SPY options trade to 16:15 ET including expiration day (ETF exception), 13:15 on early-close days.
 */
export function lastTradeMs(root: OptionRoot, expiry: string, onDate: string): number {
  const s = sessionInfo(onDate);
  const spec = seriesSpec(root);
  if (spec.settlement === "AM" && expiry === onDate) return s.openMs;
  if (root === "SPY") return s.spxOptionsCloseMs;
  if (expiry === onDate) return s.closeMs; // PM-settled expiring today
  return s.spxOptionsCloseMs;
}

/** True when this contract is PM-settled and expires today — the only kind eligible for the closing-window module. */
export function isPmExpiringToday(root: OptionRoot, expiry: string, today: string): boolean {
  return expiry === today && seriesSpec(root).settlement === "PM";
}

/**
 * Enumerate PM-settled SPXW expirations within the next N trading days (daily Mon-Fri listings).
 * Holidays shift an expiration to the preceding business day — handled by the calendar.
 */
export function upcomingSpxwExpiries(today: string, maxDays: number): string[] {
  const out: string[] = [];
  let d = today;
  for (let i = 0; i < maxDays * 2 + 5 && out.length < maxDays; i++) {
    if (sessionInfo(d).isTradingDay) out.push(d);
    const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
    const t = new Date(Date.UTC(y, m - 1, dd) + 86400000);
    d = t.toISOString().slice(0, 10);
  }
  return out;
}

/** Settlement instant for a PM-settled contract: the equity close of expiry (official close computed shortly after). */
export function pmSettlementMs(expiry: string): number {
  return sessionInfo(expiry).closeMs;
}

/** Settlement instant for an AM-settled contract (SET is derived from opening prices on expiry). */
export function amSettlementMs(expiry: string): number {
  return etToMs(expiry, 9, 30);
}
