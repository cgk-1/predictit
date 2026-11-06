/**
 * Formatting helpers. Every helper accepts null/undefined/NaN and renders "n/a" rather than a fabricated number.
 * Times are always ET (via the engine's Intl-based helpers).
 */
import { fmtEt, fmtEtTime, parseOptionSymbol } from "@predictit/engine";

export const NA = "n/a";

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Index points with 1–2 decimals. */
export function fmtPts(x: number | null | undefined, dp = 1): string {
  if (!isNum(x)) return NA;
  return x.toFixed(dp);
}

/** Signed points, e.g. "+3.2" / "−1.5" (true minus sign). */
export function fmtSignedPts(x: number | null | undefined, dp = 1): string {
  if (!isNum(x)) return NA;
  const s = x.toFixed(dp);
  if (x > 0) return `+${s}`;
  if (x < 0) return `−${s.slice(1)}`;
  return s;
}

export function fmtNum(x: number | null | undefined, dp = 2): string {
  if (!isNum(x)) return NA;
  return x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Option premium in points, 2 decimals. */
export function fmtPremium(x: number | null | undefined): string {
  return fmtPts(x, 2);
}

export function fmtUsd(x: number | null | undefined, dp = 0): string {
  if (!isNum(x)) return NA;
  const a = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return x < 0 ? `−$${a}` : `$${a}`;
}

export function fmtSignedUsd(x: number | null | undefined, dp = 0): string {
  if (!isNum(x)) return NA;
  const a = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return x > 0 ? `+$${a}` : x < 0 ? `−$${a}` : `$${a}`;
}

/** Fraction (0.123) → "12.3%". */
export function fmtPct(x: number | null | undefined, dp = 1): string {
  if (!isNum(x)) return NA;
  return `${(x * 100).toFixed(dp)}%`;
}

export function fmtSignedPct(x: number | null | undefined, dp = 1): string {
  if (!isNum(x)) return NA;
  const v = (x * 100).toFixed(dp);
  return x > 0 ? `+${v}%` : x < 0 ? `−${v.slice(1)}%` : `${v}%`;
}

/** Milliseconds → "120ms" / "1.2s" / "45s" / "2m 10s". */
export function fmtMs(ms: number | null | undefined): string {
  if (!isNum(ms)) return NA;
  const a = Math.max(0, ms);
  if (a < 1000) return `${Math.round(a)}ms`;
  if (a < 10_000) return `${(a / 1000).toFixed(1)}s`;
  if (a < 60_000) return `${Math.round(a / 1000)}s`;
  const s = Math.round(a / 1000);
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60 ? ` ${s % 60}s` : ""}`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
}

/** "ago" phrasing for a positive age in ms. Future (negative) ages render as "in …". */
export function fmtAgo(ms: number | null | undefined): string {
  if (!isNum(ms)) return NA;
  if (ms < -999) return `in ${fmtMs(-ms)}`;
  return `${fmtMs(ms)} ago`;
}

/** Seconds → "m:ss" (or "h:mm:ss"). Negative values clamp to 0:00. */
export function fmtClock(sec: number | null | undefined): string {
  if (!isNum(sec)) return NA;
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** ET wall time "HH:MM:SS". */
export function fmtTime(ms: number | null | undefined): string {
  if (!isNum(ms)) return NA;
  return fmtEtTime(ms, true);
}

/** ET wall time "HH:MM". */
export function fmtTimeShort(ms: number | null | undefined): string {
  if (!isNum(ms)) return NA;
  return fmtEtTime(ms, false);
}

/** "YYYY-MM-DD HH:MM:SS ET". */
export function fmtDateTime(ms: number | null | undefined): string {
  if (!isNum(ms)) return NA;
  return fmtEt(ms);
}

/** Human-readable contract from an OSI symbol: "SPXW 2026-11-06 7400 C". Falls back to the trimmed symbol. */
export function fmtContract(osi: string | null | undefined): string {
  if (!osi) return NA;
  try {
    const p = parseOptionSymbol(osi);
    return `${p.root} ${p.expiry} ${fmtStrike(p.strike)} ${p.right}`;
  } catch {
    return osi.trim();
  }
}

export function fmtStrike(k: number | null | undefined): string {
  if (!isNum(k)) return NA;
  return Number.isInteger(k) ? String(k) : k.toFixed(2).replace(/\.?0+$/, "");
}

export function fmtDelta(d: number | null | undefined): string {
  if (!isNum(d)) return NA;
  return d.toFixed(2);
}

/** Ratio like reward:risk → "1.8×". */
export function fmtRatio(x: number | null | undefined, dp = 2): string {
  if (!isNum(x)) return NA;
  return `${x.toFixed(dp)}×`;
}

/** Change-feed texts carry a leading "HH:MM " prefix; strip it when the time is shown in its own column. */
export function stripTimePrefix(text: string): string {
  return text.replace(/^\d{2}:\d{2}(?::\d{2})?\s+/, "");
}

/** Sentence-case a dashed label: "trend-up" → "trend up". */
export function undash(s: string | null | undefined): string {
  if (!s) return NA;
  return s.replace(/-/g, " ");
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
