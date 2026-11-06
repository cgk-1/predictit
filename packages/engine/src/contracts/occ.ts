import type { OptionRoot, Right, Underlying } from "../types";

export interface ParsedOption {
  root: OptionRoot;
  /** YYYY-MM-DD */
  expiry: string;
  right: Right;
  strike: number;
  /** canonical 21-char OSI symbol */
  osi: string;
}

const ROOTS: OptionRoot[] = ["SPXW", "SPXO", "SPX", "SPY", "XSP"];

function toRoot(s: string): OptionRoot {
  const r = s.trim().toUpperCase();
  if ((ROOTS as string[]).includes(r)) return r as OptionRoot;
  throw new Error(`unsupported option root: ${s}`);
}

/**
 * Parse any of:
 *  - OSI:    "SPXW  261106C07400000" (root padded to 6)
 *  - Cboe:   "SPXW261106C07400000" (no padding)
 *  - Schwab: "SPXW  261106C07400000" (same as OSI)
 */
export function parseOptionSymbol(sym: string): ParsedOption {
  const s = sym.trim();
  const m = /^([A-Z]{1,6}?)\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(s);
  if (!m) throw new Error(`cannot parse option symbol: ${sym}`);
  const root = toRoot(m[1]!);
  const expiry = `20${m[2]}-${m[3]}-${m[4]}`;
  const right = m[5] as Right;
  const strike = Number(m[6]) / 1000;
  return { root, expiry, right, strike, osi: formatOsi(root, expiry, right, strike) };
}

export function formatOsi(root: OptionRoot, expiry: string, right: Right, strike: number): string {
  const yymmdd = expiry.slice(2, 4) + expiry.slice(5, 7) + expiry.slice(8, 10);
  const k = Math.round(strike * 1000).toString().padStart(8, "0");
  return `${root.padEnd(6, " ")}${yymmdd}${right}${k}`;
}

export function formatCboe(root: OptionRoot, expiry: string, right: Right, strike: number): string {
  return formatOsi(root, expiry, right, strike).replace(/\s+/g, "");
}

export function underlyingOf(root: OptionRoot): Underlying {
  return root === "SPY" ? "SPY" : "SPX";
}

export function humanContract(p: { root: OptionRoot; expiry: string; right: Right; strike: number }): string {
  return `${p.root} ${p.expiry} ${p.strike}${p.right}`;
}
