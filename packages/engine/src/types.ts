/**
 * Timestamped data contracts shared by adapters, the live engine, the replay harness and the UI.
 *
 * Every observation carries a SourceStamp so that nothing downstream can confuse
 *   - when the vendor says the data was true (observedAt),
 *   - when we actually received it (receivedAt), and
 *   - how the data was obtained (mode: LIVE / DELAYED / REPLAY).
 * There is deliberately no "DEMO" mode: the platform never fabricates market data.
 */

export type DataMode = "LIVE" | "DELAYED" | "REPLAY";
export type SourceId = "schwab" | "cboe-delayed" | "manual" | "replay";

export interface SourceStamp {
  source: SourceId;
  mode: DataMode;
  /** Vendor's as-of time (ms since epoch, UTC). For delayed feeds this is the delayed time, not receipt. */
  observedAt: number;
  /** When our process received the payload (ms since epoch, UTC). */
  receivedAt: number;
  /** Optional vendor sequence or generation timestamp for audit. */
  vendorRef?: string;
}

export type Underlying = "SPX" | "SPY" | "ES" | "TICK" | "VIX";
export type Right = "C" | "P";
export type OptionRoot = "SPX" | "SPXW" | "SPXO" | "SPY" | "XSP";
export type SettlementStyle = "AM" | "PM";
export type ExerciseStyle = "european" | "american";

export interface IndexQuote {
  symbol: Underlying;
  last: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  /** Vendor trade/quote time (ms). */
  quoteTime: number;
  open?: number;
  high?: number;
  low?: number;
  prevClose?: number;
  /** Traded volume. Always null for SPX (an index has no volume). */
  volume: number | null;
  stamp: SourceStamp;
}

export interface OptionQuote {
  /** Canonical OSI/OCC symbol, e.g. "SPXW  261106C07400000". */
  osi: string;
  root: OptionRoot;
  underlying: Underlying;
  /** ISO date YYYY-MM-DD of expiration. */
  expiry: string;
  right: Right;
  strike: number;
  settlement: SettlementStyle;
  exercise: ExerciseStyle;
  multiplier: 100;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  last?: number;
  lastTradeTime?: number;
  volume: number;
  openInterest: number;
  /** Vendor-supplied IV/greeks (if any). Treated as provider estimates, never as observed data. */
  vendor?: { iv?: number; delta?: number; gamma?: number; theta?: number; vega?: number; ivTimeConvention?: "calendar" | "unknown" };
  /** Vendor quote time (ms). */
  quoteTime: number;
}

export interface ChainSnapshot {
  underlying: Underlying;
  spot: number;
  /** Spot quote time (ms). */
  spotTime: number;
  /** Vendor-reported prior session close of the underlying, if provided. */
  prevClose?: number;
  options: OptionQuote[];
  stamp: SourceStamp;
}

export interface Bar1m {
  /** Bar start, ms since epoch (UTC instant of the ET minute). */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Traded volume; null for SPX. */
  v: number | null;
  /** Optional per-minute options volume (Cboe intraday feed). */
  callsVol?: number;
  putsVol?: number;
}

export interface BarSeries {
  symbol: Underlying;
  bars: Bar1m[];
  stamp: SourceStamp;
}

/** A point-in-time bundle the engine evaluates. Contains only data observed at or before `asOf`. */
export interface MarketFrame {
  /** Evaluation instant (ms). Server-authoritative. */
  asOf: number;
  spx?: IndexQuote;
  spy?: IndexQuote;
  es?: IndexQuote;
  /** NYSE TICK (Schwab $TICK): breadth/participation proxy; absent on delayed feeds */
  tick?: IndexQuote;
  vix?: IndexQuote;
  spxBars?: BarSeries;
  spyBars?: BarSeries;
  /** 1-minute TICK bars built from quotes (h/l = max/min TICK in the minute) */
  tickBars?: BarSeries;
  spxChain?: ChainSnapshot;
  spyChain?: ChainSnapshot;
  /** Prior-day reference levels (observed before today's open). */
  priorDay?: { date: string; high: number; low: number; close: number; settlementSET?: number };
  /** Prior close alone (when a full prior-day summary is not available). */
  priorClose?: number;
  /** Event calendar entries for today (user-entered or static). */
  events?: ScheduledEvent[];
}

export interface ScheduledEvent {
  /** ms since epoch */
  at: number;
  label: string;
  severity: "low" | "medium" | "high";
}

export type DecisionState = "CALL SETUP" | "PUT SETUP" | "WAIT" | "PASS" | "MANAGE EXISTING POSITION";
export type SetupLifecycle = "forming" | "armed" | "triggered" | "invalidated" | "expired";
export type Direction = "call" | "put";

export interface Evidence {
  label: string;
  value: string;
  /** ms since epoch of the observation supporting this evidence. */
  at: number;
  source: SourceId;
  mode: DataMode;
}

export interface DataQualityNote {
  level: "info" | "warn" | "block";
  message: string;
}

/** Minimal shape of a paper/manual position the engine needs (full type in positions/). */
export interface PaperPositionLike {
  id: string;
  osi: string;
  root: OptionRoot;
  expiry: string;
  right: Right;
  strike: number;
  qty: number;
  entryPremium: number;
  entryAt: number;
  status: "open" | "closed";
  strategyId?: string | null;
  invalidationLevel?: number | null;
  horizonEndsAt?: number | null;
}
