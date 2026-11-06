/**
 * Gamma exposure (GEX) estimation with explicit, switchable assumptions.
 *
 * Per contract:  GEX_1pt = sign × Γ × OI × 100 × S          [USD of dealer delta change per 1 index point]
 *                GEX_1pct = GEX_1pt × S / 100                 [per 1% move]
 * where Γ is gamma per share of the underlying. Γ comes from our own Black-Scholes using an IV solved from
 * the quote midpoint (trading-time convention), falling back to the vendor IV (converted from calendar time)
 * when the mid has no time value. OI is the exchange's prior-close open interest: it does not change intraday,
 * so intraday GEX changes are driven only by spot and vol, never by new positioning (which we cannot observe).
 *
 * Dealer-sign models ("who is short gamma?"):
 *   naive          dealers long calls / short puts  -> call GEX > 0, put GEX < 0 (SqueezeMetrics / SpotGamma convention)
 *   inverted-0dte  naive for >0DTE, flipped for 0DTE (hypothesis: 0DTE buyers dominate, dealers short both)
 *   all-short      dealers short every option (both signs negative)
 *   all-long       dealers long every option (both positive)
 * No model is "true". The summary therefore carries a sensitivity table across models.
 */
import type { ChainSnapshot, DataQualityNote, OptionQuote } from "../types";
import { bsGreeks, impliedVol } from "../pricing/bs";
import { expiryInstantMs, yearsToExpiry, type TimeConvention, CALENDAR_MINUTES_PER_YEAR } from "../pricing/tte";
import { etDate } from "../time/et";

export type DealerSignModel = "naive" | "naive-ex-0dte" | "inverted-0dte" | "all-short" | "all-long";

export const DEALER_SIGN_MODELS: Array<{ id: DealerSignModel; label: string; description: string }> = [
  { id: "naive-ex-0dte", label: "Naive, 0DTE excluded (default)", description: "Dealers long calls / short puts for >0DTE; 0DTE flows treated as balanced (Cboe 2023/2025 reports) and shown unsigned." },
  { id: "naive", label: "Naive (SqueezeMetrics/SpotGamma)", description: "Dealers long all calls and short all puts, including 0DTE." },
  { id: "inverted-0dte", label: "Inverted 0DTE", description: "Naive for >0DTE; sign flipped for 0DTE (dealers short calls / long puts)." },
  { id: "all-short", label: "Dealers short everything", description: "Worst-case negative gamma." },
  { id: "all-long", label: "Dealers long everything", description: "Best-case positive gamma." },
];

export interface GexConfig {
  dealerSign: DealerSignModel;
  gammaSource: "own-bs" | "vendor";
  timeConvention: TimeConvention;
  r: number;
  q: number;
  strikeWindowPct: number;
  maxDays: number;
  profilePct: number;
  profileSteps: number;
}

export const DEFAULT_GEX_CONFIG: GexConfig = {
  dealerSign: "naive-ex-0dte",
  gammaSource: "own-bs",
  timeConvention: "trading",
  r: 0.04,
  q: 0.012,
  strikeWindowPct: 0.1,
  maxDays: 95,
  profilePct: 0.04,
  profileSteps: 41,
};

export interface ContractGex {
  osi: string;
  expiry: string;
  right: "C" | "P";
  strike: number;
  oi: number;
  volume: number;
  is0dte: boolean;
  T: number;
  iv: number;
  ivSource: "own" | "vendor" | "none";
  gamma: number;
  /** signed USD per 1 index point under the configured dealer-sign model */
  gex1pt: number;
  /** unsigned USD per 1 pt of gamma that traded today (volume-based; direction unknown) */
  volGamma1pt: number;
}

export interface StrikeRow {
  strike: number;
  callOi: number;
  putOi: number;
  callVol: number;
  putVol: number;
  callGex: number;
  putGex: number;
  net: number;
  net0dte: number;
  /** unsigned 0DTE gamma (|Γ|·OI·100·S) — concentration regardless of sign assumption */
  abs0dte: number;
  volGamma0dte: number;
}

export interface GexSummary {
  asOf: number;
  spot: number;
  today: string;
  config: GexConfig;
  contractsUsed: number;
  byStrike: StrikeRow[];
  byExpiry: Array<{ expiry: string; is0dte: boolean; net: number; callOi: number; putOi: number }>;
  totals: { net: number; call: number; put: number; net0dte: number; netEx0dte: number; volGamma0dte: number; netPer1pct: number };
  flip: { level: number | null; profile: Array<{ spot: number; net: number }>; profile0dte: Array<{ spot: number; net: number }>; level0dte: number | null };
  walls: { callWall: number | null; putWall: number | null; largestAbs: number | null; largest0dte: number | null };
  nearSpot: { within1pctShare: number; strikes: StrikeRow[] };
  sensitivity: Array<{ model: DealerSignModel; net: number; net0dte: number; flip: number | null }>;
  notes: DataQualityNote[];
}

function signFor(model: DealerSignModel, right: "C" | "P", is0dte: boolean): number {
  switch (model) {
    case "naive":
      return right === "C" ? 1 : -1;
    case "naive-ex-0dte":
      return is0dte ? 0 : right === "C" ? 1 : -1;
    case "inverted-0dte":
      return is0dte ? (right === "C" ? -1 : 1) : right === "C" ? 1 : -1;
    case "all-short":
      return -1;
    case "all-long":
      return 1;
  }
}

function vendorIvToConvention(ivCal: number, now: number, expMs: number, convention: TimeConvention): number {
  if (convention === "calendar") return ivCal;
  const tCal = (expMs - now) / 60000 / CALENDAR_MINUTES_PER_YEAR;
  const tTr = yearsToExpiry(now, expMs, "trading");
  if (tTr <= 0 || tCal <= 0) return ivCal;
  // total variance preserved: σ_cal² T_cal = σ_tr² T_tr
  return ivCal * Math.sqrt(tCal / tTr);
}

/** Compute per-contract gamma inputs once; sign models are applied afterwards (cheap). */
export function contractGammas(chain: ChainSnapshot, asOf: number, cfg: GexConfig = DEFAULT_GEX_CONFIG): ContractGex[] {
  const today = etDate(asOf);
  const todayMs = Date.parse(today);
  const S = chain.spot;
  const out: ContractGex[] = [];
  const tCache = new Map<string, { expMs: number; T: number }>();
  for (const o of chain.options) {
    if (!(o.openInterest > 0) && !(o.volume > 0)) continue;
    if (Math.abs(o.strike / S - 1) > cfg.strikeWindowPct) continue;
    const days = (Date.parse(o.expiry) - todayMs) / 86400000;
    if (days < 0 || days > cfg.maxDays) continue;
    const tk = `${o.root}|${o.expiry}`;
    let tc = tCache.get(tk);
    if (!tc) {
      const expMs = expiryInstantMs(o.root, o.expiry);
      tc = { expMs, T: yearsToExpiry(asOf, expMs, cfg.timeConvention) };
      tCache.set(tk, tc);
    }
    const { expMs, T } = tc;
    if (T <= 0) continue;
    const is0dte = o.expiry === today;
    let iv = 0;
    let ivSource: ContractGex["ivSource"] = "none";
    let gamma = 0;
    if (cfg.gammaSource === "vendor" && o.vendor?.gamma !== undefined) {
      gamma = o.vendor.gamma;
      iv = o.vendor.iv ?? 0;
      ivSource = "vendor";
    } else {
      const mid = o.bid > 0 && o.ask > 0 ? (o.bid + o.ask) / 2 : o.ask > 0 ? o.ask / 2 : 0;
      const solved = mid > 0 ? impliedVol(o.right, mid, { S, K: o.strike, T, r: cfg.r, q: cfg.q }) : { iv: null as number | null };
      if (solved.iv && solved.iv > 0.005) {
        iv = solved.iv;
        ivSource = "own";
      } else if (o.vendor?.iv && o.vendor.iv > 0) {
        iv = o.vendor.ivTimeConvention === "calendar" ? vendorIvToConvention(o.vendor.iv, asOf, expMs, cfg.timeConvention) : o.vendor.iv;
        ivSource = "vendor";
      }
      gamma = iv > 0 ? bsGreeks(o.right, { S, K: o.strike, T, sigma: iv, r: cfg.r, q: cfg.q }).gamma : 0;
    }
    const base = gamma * 100 * S;
    out.push({
      osi: o.osi,
      expiry: o.expiry,
      right: o.right,
      strike: o.strike,
      oi: o.openInterest,
      volume: o.volume,
      is0dte,
      T,
      iv,
      ivSource,
      gamma,
      gex1pt: signFor(cfg.dealerSign, o.right, is0dte) * base * o.openInterest,
      volGamma1pt: base * o.volume,
    });
  }
  return out;
}

/** Contracts that matter for the flip profile: OI > 0, within ±6% of spot, ≤ ~45 trading days. */
function profileSet(cgs: ContractGex[], spot: number): ContractGex[] {
  return cgs.filter((c) => c.oi > 0 && c.iv > 0 && Math.abs(c.strike / spot - 1) <= 0.06 && c.T <= 45 / 252);
}

function profileAt(cgs: ContractGex[], spot: number, model: DealerSignModel, cfg: GexConfig, only0dte: boolean): number {
  let net = 0;
  for (const c of cgs) {
    if (only0dte && !c.is0dte) continue;
    const g = bsGreeks(c.right, { S: spot, K: c.strike, T: c.T, sigma: c.iv, r: cfg.r, q: cfg.q }).gamma;
    net += signFor(model, c.right, c.is0dte) * g * 100 * spot * c.oi;
  }
  return net;
}

function zeroCrossNearest(profile: Array<{ spot: number; net: number }>, spot: number): number | null {
  let best: number | null = null;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]!;
    const b = profile[i]!;
    if ((a.net <= 0 && b.net > 0) || (a.net >= 0 && b.net < 0)) {
      const x = a.spot + ((0 - a.net) * (b.spot - a.spot)) / (b.net - a.net);
      if (best === null || Math.abs(x - spot) < Math.abs(best - spot)) best = x;
    }
  }
  return best;
}

export function gexSummary(chain: ChainSnapshot, asOf: number, cfg: GexConfig = DEFAULT_GEX_CONFIG): GexSummary {
  const S = chain.spot;
  const today = etDate(asOf);
  const cgs = contractGammas(chain, asOf, cfg);
  const rows = new Map<number, StrikeRow>();
  const byExp = new Map<string, { expiry: string; is0dte: boolean; net: number; callOi: number; putOi: number }>();
  let call = 0;
  let put = 0;
  let net0 = 0;
  let volGamma0 = 0;
  for (const c of cgs) {
    const r = rows.get(c.strike) ?? { strike: c.strike, callOi: 0, putOi: 0, callVol: 0, putVol: 0, callGex: 0, putGex: 0, net: 0, net0dte: 0, abs0dte: 0, volGamma0dte: 0 };
    if (c.right === "C") {
      r.callOi += c.oi;
      r.callVol += c.volume;
      r.callGex += c.gex1pt;
      call += c.gex1pt;
    } else {
      r.putOi += c.oi;
      r.putVol += c.volume;
      r.putGex += c.gex1pt;
      put += c.gex1pt;
    }
    r.net += c.gex1pt;
    if (c.is0dte) {
      r.net0dte += c.gex1pt;
      r.abs0dte += c.gamma * 100 * S * c.oi;
      r.volGamma0dte += c.volGamma1pt;
      net0 += c.gex1pt;
      volGamma0 += c.volGamma1pt;
    }
    rows.set(c.strike, r);
    const e = byExp.get(c.expiry) ?? { expiry: c.expiry, is0dte: c.is0dte, net: 0, callOi: 0, putOi: 0 };
    e.net += c.gex1pt;
    if (c.right === "C") e.callOi += c.oi;
    else e.putOi += c.oi;
    byExp.set(c.expiry, e);
  }
  const byStrike = [...rows.values()].sort((a, b) => a.strike - b.strike);
  const net = call + put;
  // flip profile
  const grid: number[] = [];
  for (let i = 0; i < cfg.profileSteps; i++) grid.push(S * (1 - cfg.profilePct + (2 * cfg.profilePct * i) / (cfg.profileSteps - 1)));
  const pset = profileSet(cgs, S);
  const profile = grid.map((s) => ({ spot: s, net: profileAt(pset, s, cfg.dealerSign, cfg, false) }));
  const pset0 = pset.filter((c) => c.is0dte);
  const profile0dte = grid.map((s) => ({ spot: s, net: profileAt(pset0, s, cfg.dealerSign, cfg, true) }));
  const flipLevel = zeroCrossNearest(profile, S);
  const flip0 = zeroCrossNearest(profile0dte, S);
  // walls
  // walls: largest call-gamma strike at/above spot and largest put-gamma strike at/below spot (within ±5%)
  const above = byStrike.filter((r) => r.strike >= S && r.strike / S - 1 <= 0.05);
  const below = byStrike.filter((r) => r.strike <= S && 1 - r.strike / S <= 0.05);
  const callWall = above.length ? above.reduce((a, b) => (Math.abs(b.callGex) > Math.abs(a.callGex) ? b : a)).strike : null;
  const putWall = below.length ? below.reduce((a, b) => (Math.abs(b.putGex) > Math.abs(a.putGex) ? b : a)).strike : null;
  const largestAbs = byStrike.length ? byStrike.reduce((a, b) => (Math.abs(b.net) > Math.abs(a.net) ? b : a)).strike : null;
  const largest0dte = byStrike.length ? byStrike.reduce((a, b) => (b.abs0dte > a.abs0dte ? b : a)).strike : null;
  const totalAbs = byStrike.reduce((a, r) => a + Math.abs(r.net), 0);
  const near = byStrike.filter((r) => Math.abs(r.strike / S - 1) <= 0.01);
  const within1pctShare = totalAbs > 0 ? near.reduce((a, r) => a + Math.abs(r.net), 0) / totalAbs : 0;
  // sensitivity across sign models (coarser grid for speed)
  const models: DealerSignModel[] = ["naive-ex-0dte", "naive", "inverted-0dte", "all-short", "all-long"];
  const coarse = grid.filter((_, i) => i % 2 === 0);
  const sensitivity = models.map((m) => {
    let n = 0;
    let n0 = 0;
    for (const c of cgs) {
      const v = signFor(m, c.right, c.is0dte) * c.gamma * 100 * S * c.oi;
      n += v;
      if (c.is0dte) n0 += v;
    }
    const prof = m === cfg.dealerSign ? profile : coarse.map((s) => ({ spot: s, net: profileAt(pset, s, m, cfg, false) }));
    return { model: m, net: n, net0dte: n0, flip: zeroCrossNearest(prof, S) };
  });
  const notes: DataQualityNote[] = [
    { level: "info", message: `Open interest is the exchange's prior-close OI (${today}); intraday positioning is not observable.` },
    { level: "info", message: `Gamma from ${cfg.gammaSource === "own-bs" ? "our Black-Scholes using mid-implied vol (trading-time)" : "vendor greeks"}; dealer sign model "${cfg.dealerSign}".` },
  ];
  if (chain.stamp.mode === "DELAYED") notes.push({ level: "warn", message: `Chain is DELAYED (observed ${new Date(chain.stamp.observedAt).toISOString()}).` });
  const ownShare = cgs.length ? cgs.filter((c) => c.ivSource === "own").length / cgs.length : 0;
  if (ownShare < 0.7) notes.push({ level: "warn", message: `Only ${(ownShare * 100).toFixed(0)}% of contracts had a solvable mid-implied vol; vendor IV used for the rest.` });
  return {
    asOf,
    spot: S,
    today,
    config: cfg,
    contractsUsed: cgs.length,
    byStrike,
    byExpiry: [...byExp.values()].sort((a, b) => a.expiry.localeCompare(b.expiry)),
    totals: { net, call, put, net0dte: net0, netEx0dte: net - net0, volGamma0dte: volGamma0, netPer1pct: (net * S) / 100 },
    flip: { level: flipLevel, profile, profile0dte, level0dte: flip0 },
    walls: { callWall, putWall, largestAbs, largest0dte },
    nearSpot: { within1pctShare, strikes: near },
    sensitivity,
    notes,
  };
}

/** Human-readable regime label from the configured model; explicitly a hypothesis, not a forecast. */
export function gexRegimeLabel(s: GexSummary): { label: "positive" | "negative" | "near-flip"; text: string } {
  const flipDist = s.flip.level ? (s.spot - s.flip.level) / s.spot : null;
  if (flipDist !== null && Math.abs(flipDist) < 0.0025) return { label: "near-flip", text: `Spot within 0.25% of the estimated zero-gamma level (${s.flip.level!.toFixed(0)}).` };
  if (s.totals.net > 0) return { label: "positive", text: `Net dealer gamma positive under "${s.config.dealerSign}" (hypothesis: hedging dampens moves).` };
  return { label: "negative", text: `Net dealer gamma negative under "${s.config.dealerSign}" (hypothesis: hedging amplifies moves).` };
}

export function fmtGexUsd(x: number): string {
  const a = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

export function selectNearStrikes(options: OptionQuote[], spot: number, pct: number): OptionQuote[] {
  return options.filter((o) => Math.abs(o.strike / spot - 1) <= pct);
}
