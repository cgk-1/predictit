/**
 * Cross-market features from other indices/ETFs (Schwab quotes → 1-minute bars): NDX, RUT, DJI, QQQ, IWM, RSP
 * (equal-weight S&P: RSP/SPY ratio is a breadth proxy), VIX. Everything is relative to the primary instrument's
 * 15/30-minute returns; agreement counts how many indices move with it. Null-safe: missing symbols are reported.
 */
import type { Bar1m } from "../types";
import { completedBars, sessionBars, ret } from "./bars";

export interface CrossIndex {
  symbol: string;
  last: number | null;
  ret15: number | null;
  ret30: number | null;
  /** 15-minute return minus the primary's 15-minute return (relative strength, fraction) */
  rs15: number | null;
  agrees15: boolean | null;
}

export interface CrossFeatures {
  asOf: number;
  primary: string;
  primaryRet15: number | null;
  indices: CrossIndex[];
  /** share of available indices whose 15-minute sign matches the primary (null when none) */
  agreement15: number | null;
  /** RSP vs SPY 15-minute relative return: >0 = equal-weight leading (broad), <0 = cap-weight leading (narrow) */
  breadthRs15: number | null;
  /** IWM vs primary 15-minute relative return (small caps confirm/diverge) */
  smallCapRs15: number | null;
  /** NDX vs primary 15-minute relative return */
  nasdaqRs15: number | null;
  vix: { last: number | null; change15: number | null } | null;
  label: "broad-confirm" | "narrow" | "divergent" | "n/a";
  text: string;
}

export type IndexBars = Record<string, { bars: Bar1m[]; last?: number }>;

export function crossFeatures(primary: "SPX" | "SPY", primaryBars: Bar1m[] | undefined, indexBars: IndexBars, asOf: number, date: string): CrossFeatures {
  const pb = primaryBars ? sessionBars(completedBars(primaryBars, asOf), date) : [];
  const primaryRet15 = ret(pb, 15);
  const out: CrossIndex[] = [];
  const want = ["NDX", "RUT", "DJI", "QQQ", "IWM", "RSP"];
  for (const sym of want) {
    const b = indexBars[sym];
    const sb = b ? sessionBars(completedBars(b.bars, asOf), date) : [];
    const r15 = ret(sb, 15);
    const r30 = ret(sb, 30);
    out.push({ symbol: sym, last: b?.last ?? (sb.length ? sb[sb.length - 1]!.c : null), ret15: r15, ret30: r30, rs15: r15 !== null && primaryRet15 !== null ? r15 - primaryRet15 : null, agrees15: r15 !== null && primaryRet15 !== null && Math.abs(primaryRet15) > 0.0003 ? Math.sign(r15) === Math.sign(primaryRet15) : null });
  }
  const avail = out.filter((x) => x.agrees15 !== null);
  const agreement15 = avail.length ? avail.filter((x) => x.agrees15).length / avail.length : null;
  const spyRet = (() => {
    // breadth ratio uses SPY (cap-weight) vs RSP (equal-weight); when the primary is SPY use its own bars
    const sb = indexBars["SPY"] ? sessionBars(completedBars(indexBars["SPY"].bars, asOf), date) : primary === "SPY" ? pb : [];
    return ret(sb, 15);
  })();
  const rsp = out.find((x) => x.symbol === "RSP");
  const breadthRs15 = rsp?.ret15 !== null && rsp?.ret15 !== undefined && spyRet !== null ? rsp.ret15 - spyRet : null;
  const iwm = out.find((x) => x.symbol === "IWM");
  const ndx = out.find((x) => x.symbol === "NDX");
  const vixB = indexBars["VIX"];
  const vsb = vixB ? sessionBars(completedBars(vixB.bars, asOf), date) : [];
  const vix = vixB ? { last: vixB.last ?? (vsb.length ? vsb[vsb.length - 1]!.c : null), change15: vsb.length > 15 ? vsb[vsb.length - 1]!.c - vsb[vsb.length - 16]!.c : null } : null;
  let label: CrossFeatures["label"] = "n/a";
  let text = "Cross-market indices need the Schwab live feed.";
  if (agreement15 !== null && primaryRet15 !== null) {
    if (Math.abs(primaryRet15) <= 0.0003) {
      label = "narrow";
      text = `${primary} flat over 15m; ${Math.round(agreement15 * 100)}% of indices agree in sign.`;
    } else if (agreement15 >= 0.75 && (breadthRs15 === null || Math.sign(breadthRs15) === Math.sign(primaryRet15) || Math.abs(breadthRs15) < 0.0005)) {
      label = "broad-confirm";
      text = `${Math.round(agreement15 * 100)}% of indices move with ${primary} over 15m${breadthRs15 !== null ? `; equal-weight ${breadthRs15 >= 0 ? "leads" : "lags"} by ${(breadthRs15 * 100).toFixed(2)}%` : ""}.`;
    } else if (agreement15 <= 0.4) {
      label = "divergent";
      text = `Only ${Math.round(agreement15 * 100)}% of indices move with ${primary} over 15m — divergent.`;
    } else {
      label = "narrow";
      text = `${Math.round(agreement15 * 100)}% agreement; ${breadthRs15 !== null && breadthRs15 < -0.0005 ? "cap-weight leading (narrow)" : "mixed leadership"}.`;
    }
  }
  return { asOf, primary, primaryRet15, indices: out, agreement15, breadthRs15, smallCapRs15: iwm?.rs15 ?? null, nasdaqRs15: ndx?.rs15 ?? null, vix, label, text };
}
