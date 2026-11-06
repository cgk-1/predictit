/**
 * Charles Schwab Trader API — Market Data (https://api.schwabapi.com/marketdata/v1).
 * OAuth helpers + response normalizers. The Worker owns token storage; this module is runtime-agnostic.
 * Response shapes follow the public documentation and the schwab-py reference implementation; fields we have not
 * verified against live responses are read defensively.
 */
import {
  etDate,
  parseOptionSymbol,
  seriesSpec,
  underlyingOf,
  type Bar1m,
  type BarSeries,
  type ChainSnapshot,
  type IndexQuote,
  type OptionQuote,
  type SourceStamp,
  type Underlying,
} from "@predictit/engine";

export const SCHWAB = {
  authorize: "https://api.schwabapi.com/v1/oauth/authorize",
  token: "https://api.schwabapi.com/v1/oauth/token",
  marketData: "https://api.schwabapi.com/marketdata/v1",
  trader: "https://api.schwabapi.com/trader/v1",
} as const;

export interface SchwabTokens {
  access_token: string;
  refresh_token: string;
  /** ms epoch when access token expires */
  accessExpiresAt: number;
  /** ms epoch when the refresh token expires (7 days after issue) — re-login required after. */
  refreshExpiresAt: number;
  token_type: string;
  scope?: string;
  id_token?: string;
}

export function buildAuthorizeUrl(clientId: string, redirectUri: string): string {
  const u = new URL(SCHWAB.authorize);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  return u.toString();
}

/** Extract the authorization code from the full redirected URL the user pastes (code is URL-encoded and ends with '@'). */
export function extractCodeFromRedirect(redirectedUrl: string): string {
  const u = new URL(redirectedUrl.trim());
  const code = u.searchParams.get("code");
  if (!code) throw new Error("No 'code' parameter in the pasted URL");
  return code; // URLSearchParams already decoded %40 -> @
}

async function tokenRequest(body: URLSearchParams, clientId: string, clientSecret: string, fetchImpl: typeof fetch): Promise<SchwabTokens> {
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetchImpl(SCHWAB.token, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`schwab token ${res.status}: ${text.slice(0, 300)}`);
  const j = JSON.parse(text) as { access_token: string; refresh_token: string; expires_in: number; token_type: string; scope?: string; id_token?: string };
  const now = Date.now();
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    accessExpiresAt: now + (j.expires_in ?? 1800) * 1000 - 30_000,
    refreshExpiresAt: now + 7 * 86400_000,
    token_type: j.token_type,
    scope: j.scope,
    id_token: j.id_token,
  };
}

export function exchangeAuthCode(code: string, clientId: string, clientSecret: string, redirectUri: string, fetchImpl: typeof fetch = fetch) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  return tokenRequest(body, clientId, clientSecret, fetchImpl);
}

export async function refreshTokens(prev: SchwabTokens, clientId: string, clientSecret: string, fetchImpl: typeof fetch = fetch): Promise<SchwabTokens> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: prev.refresh_token });
  const t = await tokenRequest(body, clientId, clientSecret, fetchImpl);
  // Schwab does not extend the 7-day refresh lifetime on refresh; keep the original expiry unless a new refresh token was issued.
  t.refreshExpiresAt = t.refresh_token === prev.refresh_token ? prev.refreshExpiresAt : t.refreshExpiresAt;
  return t;
}

export interface SchwabClientOptions {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

async function getJson<T>(path: string, params: Record<string, string | number | boolean | undefined>, o: SchwabClientOptions): Promise<{ raw: T; receivedAt: number; status: number }> {
  const u = new URL(SCHWAB.marketData + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v));
  const f = o.fetchImpl ?? fetch;
  const res = await f(u.toString(), { headers: { Authorization: `Bearer ${o.accessToken}`, accept: "application/json" } });
  const receivedAt = Date.now();
  const text = await res.text();
  if (!res.ok) throw new SchwabHttpError(res.status, text.slice(0, 500));
  return { raw: JSON.parse(text) as T, receivedAt, status: res.status };
}

export class SchwabHttpError extends Error {
  constructor(public status: number, body: string) {
    super(`schwab ${status}: ${body}`);
  }
}

export const schwabApi = {
  quotes: (symbols: string[], o: SchwabClientOptions) => getJson<Record<string, any>>("/quotes", { symbols: symbols.join(","), indicative: false }, o),
  chain: (symbol: string, params: { strikeCount?: number; fromDate?: string; toDate?: string; contractType?: "CALL" | "PUT" | "ALL"; includeUnderlyingQuote?: boolean }, o: SchwabClientOptions) =>
    getJson<any>("/chains", { symbol, contractType: params.contractType ?? "ALL", strikeCount: params.strikeCount, fromDate: params.fromDate, toDate: params.toDate, includeUnderlyingQuote: params.includeUnderlyingQuote ?? true, strategy: "SINGLE" }, o),
  priceHistory: (symbol: string, params: { periodType?: string; period?: number; frequencyType?: string; frequency?: number; startDate?: number; endDate?: number; needExtendedHoursData?: boolean }, o: SchwabClientOptions) =>
    getJson<{ candles: Array<{ open: number; high: number; low: number; close: number; volume: number; datetime: number }>; symbol: string; empty: boolean }>("/pricehistory", { symbol, ...params }, o),
  marketHours: (markets: string[], date: string | undefined, o: SchwabClientOptions) => getJson<any>("/markets", { markets: markets.join(","), date }, o),
};

function liveStamp(receivedAt: number, observedAt: number, ref?: string): SourceStamp {
  return { source: "schwab", mode: "LIVE", observedAt, receivedAt, vendorRef: ref };
}

/** Normalize a /quotes response entry (index or equity) into an IndexQuote. */
export function parseSchwabQuote(symbolKey: string, entry: any, receivedAt: number): IndexQuote {
  const q = entry?.quote ?? {};
  const symbol: Underlying = symbolKey === "$SPX" ? "SPX" : symbolKey === "SPY" ? "SPY" : "ES";
  // index entries carry lastPrice + tradeTime (ms) and no bid/ask; equities carry quoteTime
  const quoteTime = Number(q.quoteTime ?? q.tradeTime ?? receivedAt);
  const isIndex = entry?.assetMainType === "INDEX" || symbolKey.startsWith("$");
  return {
    symbol,
    last: Number(q.lastPrice ?? q.mark ?? q.closePrice),
    bid: q.bidPrice !== undefined ? Number(q.bidPrice) : undefined,
    ask: q.askPrice !== undefined ? Number(q.askPrice) : undefined,
    bidSize: q.bidSize !== undefined ? Number(q.bidSize) : undefined,
    askSize: q.askSize !== undefined ? Number(q.askSize) : undefined,
    quoteTime,
    open: q.openPrice !== undefined ? Number(q.openPrice) : undefined,
    high: q.highPrice !== undefined ? Number(q.highPrice) : undefined,
    low: q.lowPrice !== undefined ? Number(q.lowPrice) : undefined,
    prevClose: q.closePrice !== undefined ? Number(q.closePrice) : undefined,
    volume: isIndex || symbol === "SPX" ? null : Number(q.totalVolume ?? 0),
    stamp: liveStamp(receivedAt, quoteTime),
  };
}

/** Normalize a /chains response (callExpDateMap/putExpDateMap keyed "YYYY-MM-DD:DTE") into a ChainSnapshot. */
export function parseSchwabChain(raw: any, receivedAt: number): ChainSnapshot {
  const underlying: Underlying = String(raw.symbol ?? "").includes("SPX") ? "SPX" : "SPY";
  const uq = raw.underlying ?? {};
  const spot = Number(uq.last ?? uq.mark ?? raw.underlyingPrice);
  const spotTime = Number(uq.quoteTime ?? uq.tradeTime ?? receivedAt);
  const options: OptionQuote[] = [];
  let latestQuote = 0;
  const walk = (map: Record<string, Record<string, any[]>> | undefined) => {
    if (!map) return;
    for (const expKey of Object.keys(map)) {
      const byStrike = map[expKey]!;
      for (const k of Object.keys(byStrike)) {
        for (const c of byStrike[k] ?? []) {
          let p;
          try {
            p = parseOptionSymbol(String(c.symbol));
          } catch {
            continue;
          }
          const spec = seriesSpec(p.root);
          const qt = Number(c.quoteTimeInLong ?? c.quoteTime ?? receivedAt);
          latestQuote = Math.max(latestQuote, qt);
          options.push({
            osi: p.osi,
            root: p.root,
            underlying: underlyingOf(p.root),
            expiry: p.expiry,
            right: p.right,
            strike: p.strike,
            settlement: c.settlementType === "A" ? "AM" : c.settlementType === "P" ? "PM" : spec.settlement,
            exercise: spec.exercise,
            multiplier: 100,
            bid: Number(c.bid ?? c.bidPrice ?? 0),
            ask: Number(c.ask ?? c.askPrice ?? 0),
            bidSize: Number(c.bidSize ?? 0),
            askSize: Number(c.askSize ?? 0),
            last: c.last !== undefined ? Number(c.last) : c.lastPrice !== undefined ? Number(c.lastPrice) : undefined,
            lastTradeTime: c.tradeTimeInLong ? Number(c.tradeTimeInLong) : undefined,
            volume: Number(c.totalVolume ?? 0),
            openInterest: Number(c.openInterest ?? 0),
            vendor: {
              iv: c.volatility !== undefined && Number(c.volatility) > 0 && Number(c.volatility) < 1e6 ? Number(c.volatility) / 100 : undefined,
              delta: num(c.delta),
              gamma: num(c.gamma),
              theta: num(c.theta),
              vega: num(c.vega),
              ivTimeConvention: "unknown",
            },
            quoteTime: qt,
          });
        }
      }
    }
  };
  walk(raw.callExpDateMap);
  walk(raw.putExpDateMap);
  return { underlying, spot, spotTime, options, stamp: liveStamp(receivedAt, latestQuote || spotTime) };
}

function num(x: unknown): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) && Math.abs(n) < 1e6 ? n : undefined;
}

export function parseSchwabHistory(raw: { candles: Array<{ open: number; high: number; low: number; close: number; volume: number; datetime: number }>; symbol: string }, receivedAt: number): BarSeries {
  const symbol: Underlying = raw.symbol === "$SPX" ? "SPX" : raw.symbol === "SPY" ? "SPY" : "ES";
  const bars: Bar1m[] = raw.candles.map((c) => ({ t: c.datetime, o: c.open, h: c.high, l: c.low, c: c.close, v: symbol === "SPX" ? null : c.volume }));
  const last = bars.length ? bars[bars.length - 1]!.t + 60_000 : receivedAt;
  return { symbol, bars, stamp: liveStamp(receivedAt, last) };
}

/** Helper for the chain request window: today's and the next N trading days' expiries. */
export function chainDateWindow(now: number, days: number): { fromDate: string; toDate: string } {
  const from = etDate(now);
  const to = new Date(now + days * 86400000).toISOString().slice(0, 10);
  return { fromDate: from, toDate: to };
}
