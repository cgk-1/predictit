/**
 * Chain-derived features: our own ATM implied vol (trading-time), expected move, liquidity/quote health, skew and
 * term structure. Every number here is "our inferred" (not observed) unless it is a raw bid/ask/size.
 */
import type { ChainSnapshot, DataQualityNote, OptionQuote } from "../types";
import { bsGreeks, impliedVol, sigmaFromStraddle } from "../pricing/bs";
import { expiryInstantMs, yearsToExpiry, TRADING_MINUTES_PER_YEAR } from "../pricing/tte";

export interface ExpiryVol {
  expiry: string;
  T: number;
  atmStrike: number;
  atmIv: number | null;
  /** (put25 IV − call25 IV), approximated with the strikes closest to ±0.25 delta */
  skew25: number | null;
  callIv25: number | null;
  putIv25: number | null;
  straddleMid: number | null;
  nContracts: number;
}

export interface Liquidity {
  atmSpread: number | null;
  atmSpreadPct: number | null;
  atmBidSize: number | null;
  atmAskSize: number | null;
  /** ms between asOf and the newest option quote time in the chain */
  quoteAgeMs: number;
  zeroBidShare: number;
}

export interface ChainFeatures {
  asOf: number;
  spot: number;
  expiries: ExpiryVol[];
  front: ExpiryVol | null;
  /** expected 1-sigma move in points over `minutesToClose` using the front expiry's ATM IV */
  expectedMoveToClose: number | null;
  /** E|move| to close implied directly by the 0DTE ATM straddle mid (risk-neutral; offset-adjusted); null unless today's expiry is the front */
  straddleAbsMoveToClose: number | null;
  liquidity: Liquidity;
  pcVolume0dte: number | null;
  pcOi0dte: number | null;
  notes: DataQualityNote[];
}

export function mid(o: OptionQuote): number | null {
  if (o.bid > 0 && o.ask > 0 && o.ask >= o.bid) return (o.bid + o.ask) / 2;
  return null;
}

function byExpiry(chain: ChainSnapshot): Map<string, OptionQuote[]> {
  const m = new Map<string, OptionQuote[]>();
  for (const o of chain.options) {
    const arr = m.get(o.expiry) ?? [];
    arr.push(o);
    m.set(o.expiry, arr);
  }
  return m;
}

export function expiryVol(options: OptionQuote[], spot: number, asOf: number, r = 0.04, q = 0.012): ExpiryVol | null {
  if (!options.length) return null;
  const expiry = options[0]!.expiry;
  const root = options[0]!.root;
  const T = yearsToExpiry(asOf, expiryInstantMs(root, expiry), "trading");
  if (T <= 0) return null;
  const strikes = [...new Set(options.map((o) => o.strike))].sort((a, b) => a - b);
  const atmStrike = strikes.reduce((a, b) => (Math.abs(b - spot) < Math.abs(a - spot) ? b : a));
  const call = options.find((o) => o.strike === atmStrike && o.right === "C");
  const put = options.find((o) => o.strike === atmStrike && o.right === "P");
  const ivOf = (o: OptionQuote | undefined) => {
    if (!o) return null;
    const m = mid(o);
    if (m === null) return null;
    return impliedVol(o.right, m, { S: spot, K: o.strike, T, r, q }).iv;
  };
  const ivc = ivOf(call);
  const ivp = ivOf(put);
  const atmIv = ivc !== null && ivp !== null ? (ivc + ivp) / 2 : ivc ?? ivp;
  let callIv25: number | null = null;
  let putIv25: number | null = null;
  if (atmIv) {
    let bestC: { d: number; iv: number } | null = null;
    let bestP: { d: number; iv: number } | null = null;
    for (const o of options) {
      const m = mid(o);
      if (m === null) continue;
      const g = bsGreeks(o.right, { S: spot, K: o.strike, T, sigma: atmIv, r, q });
      const target = o.right === "C" ? 0.25 : -0.25;
      const d = Math.abs(g.delta - target);
      if (d > 0.08) continue;
      const iv = impliedVol(o.right, m, { S: spot, K: o.strike, T, r, q }).iv;
      if (iv === null) continue;
      if (o.right === "C" && (!bestC || d < bestC.d)) bestC = { d, iv };
      if (o.right === "P" && (!bestP || d < bestP.d)) bestP = { d, iv };
    }
    callIv25 = bestC?.iv ?? null;
    putIv25 = bestP?.iv ?? null;
  }
  const cm = call ? mid(call) : null;
  const pm = put ? mid(put) : null;
  return {
    expiry,
    T,
    atmStrike,
    atmIv: atmIv ?? null,
    skew25: callIv25 !== null && putIv25 !== null ? putIv25 - callIv25 : null,
    callIv25,
    putIv25,
    straddleMid: cm !== null && pm !== null ? cm + pm : null,
    nContracts: options.length,
  };
}

export function liquidity(chain: ChainSnapshot, asOf: number, frontExpiry: string | null): Liquidity {
  const opts = frontExpiry ? chain.options.filter((o) => o.expiry === frontExpiry) : chain.options;
  let newest = 0;
  let zero = 0;
  for (const o of chain.options) {
    newest = Math.max(newest, o.quoteTime);
    if (o.bid <= 0) zero++;
  }
  let atm: OptionQuote | null = null;
  for (const o of opts) if (o.right === "C" && (!atm || Math.abs(o.strike - chain.spot) < Math.abs(atm.strike - chain.spot))) atm = o;
  const m = atm ? mid(atm) : null;
  return {
    atmSpread: atm ? atm.ask - atm.bid : null,
    atmSpreadPct: atm && m ? (atm.ask - atm.bid) / m : null,
    atmBidSize: atm?.bidSize ?? null,
    atmAskSize: atm?.askSize ?? null,
    quoteAgeMs: newest ? asOf - newest : Infinity,
    zeroBidShare: chain.options.length ? zero / chain.options.length : 1,
  };
}

export function chainFeatures(chain: ChainSnapshot, asOf: number, minutesToClose: number, today: string): ChainFeatures {
  const groups = byExpiry(chain);
  const expiries: ExpiryVol[] = [];
  for (const [exp, opts] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (exp < today) continue;
    // prefer PM-settled series when both SPX and SPXW exist for a date
    const pm = opts.filter((o) => o.settlement === "PM");
    const ev = expiryVol(pm.length ? pm : opts, chain.spot, asOf);
    if (ev) expiries.push(ev);
    if (expiries.length >= 8) break;
  }
  const front = expiries[0] ?? null;
  const expectedMoveToClose = front?.atmIv && minutesToClose > 0 ? chain.spot * front.atmIv * Math.sqrt(minutesToClose / TRADING_MINUTES_PER_YEAR) : null;
  // E|move| at spot = σ·√(2/π) with σ solved from the straddle at the nearest strike (offset-aware)
  const sigmaStraddle = front && front.expiry === today && front.straddleMid !== null ? sigmaFromStraddle(front.straddleMid, chain.spot - front.atmStrike) : null;
  const straddleAbsMoveToClose = sigmaStraddle !== null ? sigmaStraddle * Math.sqrt(2 / Math.PI) : null;
  const dte0 = chain.options.filter((o) => o.expiry === today);
  const cv = dte0.filter((o) => o.right === "C").reduce((a, o) => a + o.volume, 0);
  const pv = dte0.filter((o) => o.right === "P").reduce((a, o) => a + o.volume, 0);
  const co = dte0.filter((o) => o.right === "C").reduce((a, o) => a + o.openInterest, 0);
  const po = dte0.filter((o) => o.right === "P").reduce((a, o) => a + o.openInterest, 0);
  const liq = liquidity(chain, asOf, front?.expiry ?? null);
  const notes: DataQualityNote[] = [];
  if (liq.quoteAgeMs > 120_000) notes.push({ level: "warn", message: `Option quotes are ${Math.round(liq.quoteAgeMs / 1000)}s old.` });
  if (!front?.atmIv) notes.push({ level: "warn", message: "Could not solve an ATM implied vol for the front expiry." });
  return {
    asOf,
    spot: chain.spot,
    expiries,
    front,
    expectedMoveToClose,
    straddleAbsMoveToClose,
    liquidity: liq,
    pcVolume0dte: cv > 0 ? pv / cv : null,
    pcOi0dte: co > 0 ? po / co : null,
    notes,
  };
}
