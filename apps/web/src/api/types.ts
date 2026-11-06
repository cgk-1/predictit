/**
 * Shape of GET /api/state as returned by apps/worker/src/market.ts (MarketSession.state()).
 * Kept in sync by hand; engine types are imported directly.
 */
import type {
  SessionClock,
  IndexQuote,
  DecisionRecord,
  RegimeAssessment,
  KeyLevel,
  BarFeatures,
  ChainFeatures,
  GexSummary,
  ClosingAssessment,
  PaperPosition,
  PositionMark,
  ChangeEvent,
  EngineSettings,
  ClosingSettings,
  ScheduledEvent,
  DataQualityNote,
  BarSeries,
  ChainSnapshot,
  ReplayTrade,
  PerformanceReport,
} from "@predictit/engine";

export interface FeedHealth {
  source: "schwab" | "cboe-delayed";
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  consecutiveErrors: number;
}

export interface SchwabStatus {
  configured: boolean;
  connected: boolean;
  accessExpiresAt: number | null;
  refreshExpiresAt: number | null;
  lastRefreshAt: number | null;
  lastError: string | null;
}

export interface AppSettings {
  engine: EngineSettings;
  closing: ClosingSettings;
  events: ScheduledEvent[];
  maxOpenRiskUsd: number;
  pollSec: { live: number; delayed: number; idle: number };
  retentionDays: number;
  archiveCboe: boolean;
}

export interface ServerState {
  serverTime: number;
  clock: SessionClock;
  mode: "LIVE" | "DELAYED" | "REPLAY" | "NONE";
  feeds: Record<string, FeedHealth>;
  schwab: SchwabStatus;
  lastTick: { at: number; durationMs: number; mode: string } | null;
  tickStats: { n: number; avgMs: number | null };
  spx: IndexQuote | null;
  spy: IndexQuote | null;
  decision: DecisionRecord | null;
  decisionAgeMs: number | null;
  regime: RegimeAssessment | null;
  levels: KeyLevel[];
  bars: BarFeatures | null;
  chainFeatures: ChainFeatures | null;
  gex: GexSummary | null;
  closing: ClosingAssessment | null;
  positions: Array<{ position: PaperPosition; mark: PositionMark | null }>;
  realizedToday: number;
  changes: ChangeEvent[];
  settings: AppSettings;
  notes: DataQualityNote[];
  evaluatedAt: number | null;
}

export interface ReplayResponse {
  decision: DecisionRecord;
  ctx: { regime: RegimeAssessment; levels: KeyLevel[]; spxBars: BarFeatures | null; spxChain: ChainFeatures | null; mode: ServerState["mode"]; staleness: { spxMs: number | null; chainMs: number | null; barsMs: number | null }; gex: GexSummary | null };
  frameSummary: { spx: number | null; spotTime: number | null; chainObservedAt: number | null };
}

export interface DateEntry { date: string; snapshots: number; decisions: number; archived: boolean }

export interface PerformanceResponse { trades: ReplayTrade[]; report: PerformanceReport; ledger: { decisions: number; byState: Record<string, number> } }

export type BarsResponse = BarSeries | null;
export type ChainResponse = ChainSnapshot | null;

/** API surface (all same-origin, JSON, cookie/Access authenticated):
 *  GET  /api/state                      → ServerState
 *  GET  /api/health
 *  GET  /api/bars?symbol=SPX|SPY        → BarsResponse (today's 1-minute bars)
 *  GET  /api/chain?pct=0.03&days=10     → ChainResponse (near-money SPX chain slice)
 *  GET  /api/decisions?date=YYYY-MM-DD  → DecisionRecord[] (immutable ledger)
 *  GET  /api/changes?date=              → ChangeEvent[]
 *  GET  /api/dates                      → DateEntry[]
 *  GET  /api/replay?date=&at=<ms>       → ReplayResponse (as-of reconstruction, no hindsight)
 *  GET  /api/performance                → PerformanceResponse
 *  GET  /api/positions?date=            → PaperPosition[]
 *  POST /api/positions                  { osi, qty, entryPremium, entryAt?, note?, invalidationLevel?, horizonMinutes?, profitTargetPremium?, trail?, mode?, decisionId?, strategyId? } → PaperPosition
 *  POST /api/positions/:id/close        { premium, reason? } → PaperPosition
 *  GET  /api/settings / PUT /api/settings (partial AppSettings) → AppSettings
 *  GET  /api/schwab/status → SchwabStatus; GET /api/schwab/auth-url → { url, redirectUri }
 *  POST /api/schwab/callback { redirectedUrl } → SchwabStatus; POST /api/schwab/disconnect
 *  POST /api/explain { decisionId } → { text, model?, disabled? }
 *  POST /api/auth/login { passphrase } ; POST /api/auth/logout ; GET /api/auth/me → { sub } ; GET /api/auth/config
 */
export const API_DOC = true;
