/**
 * Builds the EngineContext for ONE instrument (SPX or SPY) from a MarketFrame: all derived features in one
 * as-of-safe bundle. The instrument is analysed natively from its own quote, bars, chain and levels; the other
 * index is only a companion used for sign agreement (never for level arithmetic — SPX and SPY diverge intraday).
 */
import type { MarketFrame, DataQualityNote, PaperPositionLike, IndexQuote, Bar1m, ChainSnapshot, BarSeries } from "../types";
import { sessionClock, type SessionClock } from "../time/session";
import { barFeatures, completedBars, type BarFeatures } from "../features/bars";
import { chainFeatures, type ChainFeatures } from "../features/chain";
import { gexSummary, type GexConfig, type GexSummary, DEFAULT_GEX_CONFIG } from "../gex/gex";
import { assessRegime, type RegimeAssessment } from "../regime/regime";
import type { PricePoint } from "../features/levels";
import { calendarFeatures, type CalendarFeatures } from "../features/calendar";
import { supportResistance, type SRLevel } from "../features/sr";
import { tickFeatures, type TickFeatures } from "../features/tick";
import { multiTimeframe, type MtfSummary } from "../features/mtf";
import { crossFeatures, type CrossFeatures, type IndexBars } from "../features/cross";
import { etDate } from "../time/et";

export type Instrument = "SPX" | "SPY";

export interface KeyLevel {
  level: number;
  kind: "prior-high" | "prior-low" | "prior-close" | "or-high" | "or-low" | "session-high" | "session-low" | "vwap" | "twap" | "gex-flip" | "call-wall" | "put-wall" | "round" | "largest-gex" | "gap-fill" | "prior-week-high" | "prior-week-low" | "high-oi-strike";
  label: string;
  source: string;
}

export interface EngineSettings {
  gex: GexConfig;
  /** maximum ATM spread as % of mid for a new entry */
  maxSpreadPct: number;
  /** maximum quote age (ms) for a new entry */
  maxQuoteAgeMs: number;
  minQuoteSize: number;
  /** per-contract premium budget in USD */
  maxPremiumPerContract: number;
  /** daily loss limit in USD (paper) */
  dailyLossLimit: number;
  /** earliest sub-window allowed for new closing-window entries (minutes before close) */
  closingWindowLastEntryMinutes: number;
  /** cost model */
  commissionPerContract: number;
  feesPerContract: number;
  /** vendor delay accepted for levels but never for execution */
  allowDelayedForLevels: boolean;
}

export const DEFAULT_SETTINGS: EngineSettings = {
  gex: DEFAULT_GEX_CONFIG,
  maxSpreadPct: 0.08,
  maxQuoteAgeMs: 15_000,
  minQuoteSize: 1,
  maxPremiumPerContract: 200,
  dailyLossLimit: 1000,
  closingWindowLastEntryMinutes: 1,
  commissionPerContract: 0.65,
  feesPerContract: 0.1,
  allowDelayedForLevels: true,
};

export interface Companion {
  instrument: Instrument;
  quote: IndexQuote | undefined;
  bars: BarFeatures | null;
  path: PricePoint[];
}

export interface EngineContext {
  asOf: number;
  today: string;
  clock: SessionClock;
  frame: MarketFrame;
  settings: EngineSettings;
  mode: "LIVE" | "DELAYED" | "REPLAY" | "NONE";
  instrument: Instrument;
  /** primary instrument series */
  quote: IndexQuote | undefined;
  rawBars: Bar1m[];
  bars: BarFeatures | null;
  chainSnapshot: ChainSnapshot | undefined;
  chain: ChainFeatures | null;
  path: PricePoint[];
  companion: Companion;
  gex: GexSummary | null;
  regime: RegimeAssessment;
  levels: KeyLevel[];
  calendar: CalendarFeatures | null;
  sr: { support: SRLevel[]; resistance: SRLevel[] };
  tick: TickFeatures;
  mtf: MtfSummary | null;
  cross: CrossFeatures;
  staleness: { quoteMs: number | null; chainMs: number | null; barsMs: number | null };
  notes: DataQualityNote[];
  positions: PaperPositionLike[];
}

/** Build a price path from completed bars (closes) plus the latest quote if newer. */
export function pricePath(series: BarSeries | undefined, quote: IndexQuote | undefined, asOf: number): PricePoint[] {
  const pts: PricePoint[] = [];
  if (series) for (const b of completedBars(series.bars, asOf)) pts.push({ t: b.t + 60_000, p: b.c });
  if (quote && quote.quoteTime <= asOf && (!pts.length || quote.quoteTime > pts[pts.length - 1]!.t)) pts.push({ t: quote.quoteTime, p: quote.last });
  return pts;
}

function seriesFor(frame: MarketFrame, inst: Instrument): { quote: IndexQuote | undefined; series: BarSeries | undefined; chain: ChainSnapshot | undefined } {
  return inst === "SPX" ? { quote: frame.spx, series: frame.spxBars, chain: frame.spxChain } : { quote: frame.spy, series: frame.spyBars, chain: frame.spyChain };
}

export function buildContext(frame: MarketFrame, settings: EngineSettings = DEFAULT_SETTINGS, positions: PaperPositionLike[] = [], instrument: Instrument = "SPX"): EngineContext {
  const asOf = frame.asOf;
  const clock = sessionClock(asOf);
  const today = clock.date;
  const notes: DataQualityNote[] = [];
  const me = seriesFor(frame, instrument);
  const other: Instrument = instrument === "SPX" ? "SPY" : "SPX";
  const co = seriesFor(frame, other);
  const modes = [me.quote?.stamp.mode, me.chain?.stamp.mode, me.series?.stamp.mode].filter(Boolean) as string[];
  const mode: EngineContext["mode"] = modes.length === 0 ? "NONE" : modes.includes("REPLAY") ? "REPLAY" : modes.includes("DELAYED") ? "DELAYED" : "LIVE";
  const bars = me.series ? barFeatures(me.series.bars, asOf, today, clock.session.openMs) : null;
  const coBars = co.series ? barFeatures(co.series.bars, asOf, today, clock.session.openMs) : null;
  const chain = me.chain ? chainFeatures(me.chain, asOf, clock.minutesToClose, today) : null;
  let gex: GexSummary | null = null;
  const broad = instrument === "SPX" ? frame.spxChainBroad : frame.spyChainBroad;
  // GEX uses the broad chain when it is reasonably fresh (≤ 10 min), else the near execution chain
  const gexChain = broad && asOf - broad.stamp.observedAt <= 10 * 60_000 ? { ...broad, spot: me.chain?.spot ?? broad.spot } : me.chain;
  if (gexChain) {
    try {
      gex = gexSummary(gexChain, asOf, settings.gex);
    } catch (e) {
      notes.push({ level: "warn", message: `GEX computation failed: ${(e as Error).message}` });
    }
  }
  const staleness = {
    quoteMs: me.quote ? asOf - me.quote.quoteTime : null,
    chainMs: me.chain ? asOf - me.chain.stamp.observedAt : null,
    barsMs: me.series ? asOf - me.series.stamp.observedAt : null,
  };
  const tick = tickFeatures(frame.tickBars?.bars, frame.tick, asOf);
  const mtf = me.series ? multiTimeframe(me.series.bars, asOf) : null;
  const indexBars: IndexBars = { ...(frame.indices ?? {}) };
  if (frame.spyBars) indexBars["SPY"] = { bars: frame.spyBars.bars, last: frame.spy?.last };
  if (frame.vix) indexBars["VIX"] = indexBars["VIX"] ?? { bars: [], last: frame.vix.last };
  const cross = crossFeatures(instrument, me.series?.bars, indexBars, asOf, today);
  const regime = assessRegime({ clock, bars, companionBars: coBars, companionName: other, chain, gex, events: frame.events ?? [], staleness, mode, tick, mtf, cross });
  const priorCloseRef = frame.priorDay?.close ?? (instrument === "SPX" ? frame.priorClose : undefined) ?? me.chain?.prevClose ?? null;
  const calendar = me.series ? calendarFeatures(me.series.bars, asOf, priorCloseRef) : null;
  const levels = keyLevels(instrument, me.quote, me.chain, frame.priorDay, bars, gex, calendar);
  const path = pricePath(me.series, me.quote, asOf);
  const spot = me.quote?.last ?? bars?.last ?? null;
  const sr = spot ? supportResistance(levels, spot, path, asOf) : { support: [], resistance: [] };
  if (!me.chain) notes.push({ level: "warn", message: `No ${instrument} option chain in this frame.` });
  if (!me.series) notes.push({ level: "warn", message: `No ${instrument} 1-minute bars in this frame.` });
  if (calendar && calendar.coverageDays < 2) notes.push({ level: "info", message: "Only today's bars available: prior-day, gap and weekly features are n/a until multi-day history is loaded (Schwab price history)." });
  return {
    asOf,
    today,
    clock,
    frame,
    settings,
    mode,
    instrument,
    quote: me.quote,
    rawBars: me.series?.bars ?? [],
    bars,
    chainSnapshot: me.chain,
    chain,
    path,
    companion: { instrument: other, quote: co.quote, bars: coBars, path: pricePath(co.series, co.quote, asOf) },
    gex,
    regime,
    levels,
    calendar,
    sr,
    tick,
    mtf,
    cross,
    staleness,
    notes: [...notes, ...regime.notes, ...(chain?.notes ?? []), ...(gex?.notes ?? [])],
    positions,
  };
}

export function keyLevels(instrument: Instrument, quote: IndexQuote | undefined, chain: ChainSnapshot | undefined, priorDay: MarketFrame["priorDay"], b: BarFeatures | null, gex: GexSummary | null, cal: CalendarFeatures | null = null): KeyLevel[] {
  const L: KeyLevel[] = [];
  if (cal?.priorWeek) {
    if (cal.priorWeek.high) L.push({ level: cal.priorWeek.high, kind: "prior-week-high", label: "Prior week high", source: `${instrument} bars` });
    if (cal.priorWeek.low) L.push({ level: cal.priorWeek.low, kind: "prior-week-low", label: "Prior week low", source: `${instrument} bars` });
  }
  if (cal?.today.gapFillLevel && cal.today.gapFilled === false) L.push({ level: cal.today.gapFillLevel, kind: "gap-fill", label: `Gap fill (${cal.today.gapPts! > 0 ? "gap up" : "gap down"} ${cal.today.gapPts!.toFixed(instrument === "SPY" ? 2 : 1)})`, source: "prior close" });
  if (cal?.prior) {
    L.push({ level: cal.prior.high, kind: "prior-high", label: "Prior day high", source: `bars ${cal.prior.date}` });
    L.push({ level: cal.prior.low, kind: "prior-low", label: "Prior day low", source: `bars ${cal.prior.date}` });
    L.push({ level: cal.prior.close, kind: "prior-close", label: "Prior close", source: `bars ${cal.prior.date}` });
  } else if (priorDay && instrument === "SPX") {
    L.push({ level: priorDay.high, kind: "prior-high", label: "Prior day high", source: `bars ${priorDay.date}` });
    L.push({ level: priorDay.low, kind: "prior-low", label: "Prior day low", source: `bars ${priorDay.date}` });
    L.push({ level: priorDay.close, kind: "prior-close", label: "Prior close", source: `bars ${priorDay.date}` });
  } else if (chain?.prevClose) L.push({ level: chain.prevClose, kind: "prior-close", label: "Prior close", source: "vendor prev_day_close" });
  if (b?.or30?.complete) {
    L.push({ level: b.or30.high, kind: "or-high", label: "Opening range high (30m)", source: `${instrument} bars` });
    L.push({ level: b.or30.low, kind: "or-low", label: "Opening range low (30m)", source: `${instrument} bars` });
  }
  if (b?.sessHigh !== null && b?.sessHigh !== undefined) L.push({ level: b.sessHigh, kind: "session-high", label: "Session high", source: `${instrument} bars` });
  if (b?.sessLow !== null && b?.sessLow !== undefined) L.push({ level: b.sessLow, kind: "session-low", label: "Session low", source: `${instrument} bars` });
  if (b?.vwap !== null && b?.vwap !== undefined) L.push({ level: b.vwap, kind: "vwap", label: `${instrument} VWAP`, source: `${instrument} bars (volume)` });
  else if (b?.twap !== null && b?.twap !== undefined) L.push({ level: b.twap, kind: "twap", label: `${instrument} TWAP (no volume: time-weighted proxy)`, source: `${instrument} bars` });
  if (gex) {
    if (gex.flip.level) L.push({ level: gex.flip.level, kind: "gex-flip", label: `Zero-gamma estimate (${gex.config.dealerSign})`, source: "GEX (prior-close OI)" });
    if (gex.walls.callWall) L.push({ level: gex.walls.callWall, kind: "call-wall", label: "Call wall (largest call gamma above)", source: "GEX" });
    if (gex.walls.putWall) L.push({ level: gex.walls.putWall, kind: "put-wall", label: "Put wall (largest put gamma below)", source: "GEX" });
    if (gex.walls.largest0dte) L.push({ level: gex.walls.largest0dte, kind: "largest-gex", label: "Largest 0DTE gamma strike", source: "GEX 0DTE" });
    const near = gex.byStrike.filter((r) => Math.abs(r.strike / gex.spot - 1) <= 0.015).sort((a, b2) => b2.callOi + b2.putOi - (a.callOi + a.putOi)).slice(0, 2);
    for (const r of near) if (!L.some((l) => l.level === r.strike)) L.push({ level: r.strike, kind: "high-oi-strike", label: `High-OI strike (${Math.round((r.callOi + r.putOi) / 1000)}k)`, source: "chain OI (prior close)" });
  }
  if (quote) {
    const step = instrument === "SPY" ? 5 : 50;
    const r = Math.round(quote.last / step) * step;
    for (const lvl of [r - step, r, r + step]) L.push({ level: lvl, kind: "round", label: `Round ${lvl}`, source: "arith" });
  }
  return L.sort((a, b2) => a.level - b2.level);
}
