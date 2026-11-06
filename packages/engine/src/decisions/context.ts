/**
 * Builds the EngineContext from a MarketFrame: all derived features in one as-of-safe bundle.
 */
import type { MarketFrame, DataQualityNote, PaperPositionLike } from "../types";
import { sessionClock, type SessionClock } from "../time/session";
import { barFeatures, completedBars, type BarFeatures } from "../features/bars";
import { chainFeatures, type ChainFeatures } from "../features/chain";
import { gexSummary, type GexConfig, type GexSummary, DEFAULT_GEX_CONFIG } from "../gex/gex";
import { assessRegime, type RegimeAssessment } from "../regime/regime";
import type { PricePoint } from "../features/levels";
import { etDate } from "../time/et";

export interface KeyLevel {
  level: number;
  kind: "prior-high" | "prior-low" | "prior-close" | "or-high" | "or-low" | "session-high" | "session-low" | "vwap" | "twap" | "gex-flip" | "call-wall" | "put-wall" | "round" | "largest-gex";
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
  maxPremiumPerContract: 1500,
  dailyLossLimit: 1000,
  closingWindowLastEntryMinutes: 1,
  commissionPerContract: 0.65,
  feesPerContract: 0.1,
  allowDelayedForLevels: true,
};

export interface EngineContext {
  asOf: number;
  today: string;
  clock: SessionClock;
  frame: MarketFrame;
  settings: EngineSettings;
  mode: "LIVE" | "DELAYED" | "REPLAY" | "NONE";
  spxBars: BarFeatures | null;
  spyBars: BarFeatures | null;
  spxPath: PricePoint[];
  spxChain: ChainFeatures | null;
  gex: GexSummary | null;
  regime: RegimeAssessment;
  levels: KeyLevel[];
  staleness: { spxMs: number | null; chainMs: number | null; barsMs: number | null };
  notes: DataQualityNote[];
  positions: PaperPositionLike[];
}

/** Build a price path from completed bars (closes) plus the latest quote if newer. */
export function pricePath(frame: MarketFrame, asOf: number): PricePoint[] {
  const pts: PricePoint[] = [];
  if (frame.spxBars) for (const b of completedBars(frame.spxBars.bars, asOf)) pts.push({ t: b.t + 60_000, p: b.c });
  if (frame.spx && frame.spx.quoteTime <= asOf && (!pts.length || frame.spx.quoteTime > pts[pts.length - 1]!.t)) pts.push({ t: frame.spx.quoteTime, p: frame.spx.last });
  return pts;
}

export function buildContext(frame: MarketFrame, settings: EngineSettings = DEFAULT_SETTINGS, positions: PaperPositionLike[] = []): EngineContext {
  const asOf = frame.asOf;
  const clock = sessionClock(asOf);
  const today = clock.date;
  const notes: DataQualityNote[] = [];
  const modes = [frame.spx?.stamp.mode, frame.spxChain?.stamp.mode, frame.spxBars?.stamp.mode].filter(Boolean) as string[];
  const mode: EngineContext["mode"] = modes.length === 0 ? "NONE" : modes.includes("REPLAY") ? "REPLAY" : modes.includes("DELAYED") ? "DELAYED" : "LIVE";
  const spxBars = frame.spxBars ? barFeatures(frame.spxBars.bars, asOf, today, clock.session.openMs) : null;
  const spyBars = frame.spyBars ? barFeatures(frame.spyBars.bars, asOf, today, clock.session.openMs) : null;
  const spxChain = frame.spxChain ? chainFeatures(frame.spxChain, asOf, clock.minutesToClose, today) : null;
  let gex: GexSummary | null = null;
  if (frame.spxChain) {
    try {
      gex = gexSummary(frame.spxChain, asOf, settings.gex);
    } catch (e) {
      notes.push({ level: "warn", message: `GEX computation failed: ${(e as Error).message}` });
    }
  }
  const staleness = {
    spxMs: frame.spx ? asOf - frame.spx.quoteTime : null,
    chainMs: frame.spxChain ? asOf - frame.spxChain.stamp.observedAt : null,
    barsMs: frame.spxBars ? asOf - frame.spxBars.stamp.observedAt : null,
  };
  const regime = assessRegime({ clock, spxBars, spyBars, spxChain, gex, events: frame.events ?? [], staleness, mode });
  const levels = keyLevels(frame, spxBars, spyBars, gex);
  if (!frame.spxChain) notes.push({ level: "warn", message: "No SPX option chain in this frame." });
  if (!frame.spxBars) notes.push({ level: "warn", message: "No SPX 1-minute bars in this frame." });
  return { asOf, today, clock, frame, settings, mode, spxBars, spyBars, spxPath: pricePath(frame, asOf), spxChain, gex, regime, levels, staleness, notes: [...notes, ...regime.notes, ...(spxChain?.notes ?? []), ...(gex?.notes ?? [])], positions };
}

export function keyLevels(frame: MarketFrame, spx: BarFeatures | null, spy: BarFeatures | null, gex: GexSummary | null): KeyLevel[] {
  const L: KeyLevel[] = [];
  if (frame.priorDay) {
    L.push({ level: frame.priorDay.high, kind: "prior-high", label: "Prior day high", source: `bars ${frame.priorDay.date}` });
    L.push({ level: frame.priorDay.low, kind: "prior-low", label: "Prior day low", source: `bars ${frame.priorDay.date}` });
    L.push({ level: frame.priorDay.close, kind: "prior-close", label: "Prior close", source: `bars ${frame.priorDay.date}` });
  }
  if (spx?.or30?.complete) {
    L.push({ level: spx.or30.high, kind: "or-high", label: "Opening range high (30m)", source: "SPX bars" });
    L.push({ level: spx.or30.low, kind: "or-low", label: "Opening range low (30m)", source: "SPX bars" });
  }
  if (spx?.sessHigh !== null && spx?.sessHigh !== undefined) L.push({ level: spx.sessHigh, kind: "session-high", label: "Session high", source: "SPX bars" });
  if (spx?.sessLow !== null && spx?.sessLow !== undefined) L.push({ level: spx.sessLow, kind: "session-low", label: "Session low", source: "SPX bars" });
  if (spx?.twap !== null && spx?.twap !== undefined) L.push({ level: spx.twap, kind: "twap", label: "SPX TWAP (no volume: time-weighted proxy)", source: "SPX bars" });
  if (spy?.vwap && frame.spx && frame.spy) {
    // map SPY VWAP into SPX points via the current ratio (explicit proxy)
    const ratio = frame.spx.last / frame.spy.last;
    L.push({ level: spy.vwap * ratio, kind: "vwap", label: "SPY VWAP (mapped to SPX by current ratio)", source: "SPY bars" });
  }
  if (gex) {
    if (gex.flip.level) L.push({ level: gex.flip.level, kind: "gex-flip", label: `Zero-gamma estimate (${gex.config.dealerSign})`, source: "GEX (prior-close OI)" });
    if (gex.walls.callWall) L.push({ level: gex.walls.callWall, kind: "call-wall", label: "Call wall (largest call gamma above)", source: "GEX" });
    if (gex.walls.putWall) L.push({ level: gex.walls.putWall, kind: "put-wall", label: "Put wall (largest put gamma below)", source: "GEX" });
    if (gex.walls.largest0dte) L.push({ level: gex.walls.largest0dte, kind: "largest-gex", label: "Largest 0DTE gamma strike", source: "GEX 0DTE" });
  }
  if (frame.spx) {
    const r = Math.round(frame.spx.last / 50) * 50;
    for (const lvl of [r - 50, r, r + 50]) L.push({ level: lvl, kind: "round", label: `Round ${lvl}`, source: "arith" });
  }
  return L.sort((a, b) => a.level - b.level);
}
