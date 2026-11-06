/**
 * Adapter for Cboe's public delayed-quote JSON (15-minute delayed; personal, non-commercial use).
 *
 *   https://cdn-api.cboe.com/api/global/delayed_quotes/options/_SPX.json   (full SPX+SPXW chain)
 *   https://cdn-api.cboe.com/api/global/delayed_quotes/options/SPY.json
 *   https://cdn-api.cboe.com/api/global/delayed_quotes/charts/intraday/_SPX.json (1-min bars + options volume)
 *
 * Observed conventions (verified on live payloads 2026-11-06):
 *   - top-level "timestamp" is the file generation time in UTC ("YYYY-MM-DD HH:MM:SS");
 *   - inner "last_trade_time"/"datetime" strings are ET wall-clock without zone;
 *   - quotes are delayed ~15 minutes relative to generation time;
 *   - "iv" is annualized under CALENDAR time; greeks are vendor estimates.
 * The adapter never invents timestamps: observedAt = generation time − DELAY_MS, and this is labelled DELAYED.
 */
import {
  parseOptionSymbol,
  seriesSpec,
  underlyingOf,
  etLocalIsoToMs,
  utcLocalIsoToMs,
  type Bar1m,
  type BarSeries,
  type ChainSnapshot,
  type OptionQuote,
  type SourceStamp,
  type Underlying,
} from "@predictit/engine";

export const CBOE_DELAY_MS = 15 * 60 * 1000;
export const CBOE_URLS = {
  spxChain: "https://cdn-api.cboe.com/api/global/delayed_quotes/options/_SPX.json",
  spyChain: "https://cdn-api.cboe.com/api/global/delayed_quotes/options/SPY.json",
  spxIntraday: "https://cdn-api.cboe.com/api/global/delayed_quotes/charts/intraday/_SPX.json",
  spyIntraday: "https://cdn-api.cboe.com/api/global/delayed_quotes/charts/intraday/SPY.json",
} as const;

export interface CboeOptionRaw {
  option: string;
  bid: number;
  bid_size: number;
  ask: number;
  ask_size: number;
  iv: number;
  open_interest: number;
  volume: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  theo: number;
  last_trade_price: number;
  last_trade_time: string | null;
  prev_day_close: number;
}

export interface CboeChainRaw {
  timestamp: string;
  symbol: string;
  data: {
    symbol: string;
    security_type: string;
    current_price: number;
    bid: number;
    ask: number;
    open: number;
    high: number;
    low: number;
    close: number;
    prev_day_close: number;
    volume: number;
    iv30: number;
    last_trade_time: string;
    options: CboeOptionRaw[];
  };
}

export interface CboeIntradayRaw {
  timestamp: string;
  symbol: string;
  data: Array<{
    datetime: string;
    sequence_number: number;
    price: { open: number; high: number; low: number; close: number };
    volume: { stock_volume: number; calls_volume: number; puts_volume: number; total_options_volume: number };
  }>;
}

export interface CboeParseOptions {
  /** Keep only expiries within N calendar days (default: all). */
  maxDays?: number;
  /** Keep only strikes within ±pct of spot (default: all). */
  strikePct?: number;
  /** Date used for maxDays filtering (YYYY-MM-DD, ET). Defaults to the generation date. */
  today?: string;
}

function stampFor(raw: { timestamp: string }, receivedAt: number): SourceStamp {
  const gen = utcLocalIsoToMs(raw.timestamp);
  return { source: "cboe-delayed", mode: "DELAYED", observedAt: gen - CBOE_DELAY_MS, receivedAt, vendorRef: raw.timestamp };
}

export function parseCboeChain(raw: CboeChainRaw, receivedAt: number, opts: CboeParseOptions = {}): ChainSnapshot {
  const stamp = stampFor(raw, receivedAt);
  const spot = raw.data.current_price;
  const spotTime = raw.data.last_trade_time ? etLocalIsoToMs(raw.data.last_trade_time) : stamp.observedAt;
  const underlying: Underlying = raw.data.symbol === "^SPX" || raw.symbol === "_SPX" ? "SPX" : "SPY";
  const today = opts.today ?? new Date(stamp.observedAt).toISOString().slice(0, 10);
  const options: OptionQuote[] = [];
  for (const o of raw.data.options) {
    let p;
    try {
      p = parseOptionSymbol(o.option);
    } catch {
      continue; // unsupported root (e.g. binary/other series)
    }
    if (opts.maxDays !== undefined) {
      const days = (Date.parse(p.expiry) - Date.parse(today)) / 86400000;
      if (days > opts.maxDays || days < 0) continue;
    }
    if (opts.strikePct !== undefined && spot > 0 && Math.abs(p.strike / spot - 1) > opts.strikePct) continue;
    const spec = seriesSpec(p.root);
    options.push({
      osi: p.osi,
      root: p.root,
      underlying: underlyingOf(p.root),
      expiry: p.expiry,
      right: p.right,
      strike: p.strike,
      settlement: spec.settlement,
      exercise: spec.exercise,
      multiplier: 100,
      bid: o.bid,
      ask: o.ask,
      bidSize: o.bid_size,
      askSize: o.ask_size,
      last: o.last_trade_price || undefined,
      lastTradeTime: o.last_trade_time ? etLocalIsoToMs(o.last_trade_time) : undefined,
      volume: o.volume,
      openInterest: o.open_interest,
      vendor: { iv: o.iv, delta: o.delta, gamma: o.gamma, theta: o.theta, vega: o.vega, ivTimeConvention: "calendar" },
      quoteTime: stamp.observedAt,
    });
  }
  return { underlying, spot, spotTime, options, stamp };
}

/**
 * Cboe labels each 1-minute bar by its END minute (the first bar of the day is "09:31" and opens at the day's open).
 * We store bar START instants, so t = label − 60 s.
 */
export function parseCboeIntraday(raw: CboeIntradayRaw, receivedAt: number): BarSeries {
  const stamp = stampFor(raw, receivedAt);
  const symbol: Underlying = raw.symbol === "_SPX" ? "SPX" : "SPY";
  const bars: Bar1m[] = raw.data.map((b) => ({
    t: etLocalIsoToMs(b.datetime) - 60_000,
    o: b.price.open,
    h: b.price.high,
    l: b.price.low,
    c: b.price.close,
    v: symbol === "SPX" ? null : b.volume.stock_volume,
    callsVol: b.volume.calls_volume,
    putsVol: b.volume.puts_volume,
  }));
  return { symbol, bars, stamp };
}

export async function fetchCboeJson<T>(url: string, fetchImpl: typeof fetch = fetch): Promise<{ raw: T; receivedAt: number }> {
  const res = await fetchImpl(url, { headers: { accept: "application/json" }, redirect: "follow" });
  if (!res.ok) throw new Error(`cboe ${url} -> ${res.status}`);
  const raw = (await res.json()) as T;
  return { raw, receivedAt: Date.now() };
}
