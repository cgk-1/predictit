import type { Direction, Evidence, SetupLifecycle, DataQualityNote } from "../types";
import type { SessionPhase } from "../time/session";

export type StrategyFamily =
  | "trend-pullback"
  | "orb"
  | "range-rejection"
  | "compression-expansion"
  | "level-reclaim-reject"
  | "momentum-participation"
  | "afternoon-continuation-reversal"
  | "eod-auction"
  | "strike-flip";

export interface StrategyMeta {
  family: StrategyFamily;
  name: string;
  phases: SessionPhase[];
  /** Validation status is recorded in docs/EVIDENCE-LEDGER.md and surfaced in the UI. */
  validation: "unvalidated" | "in-sample-only" | "out-of-sample";
  hypothesis: string;
  dataRequirements: string[];
}

export interface SetupCandidate {
  /** stable id for the setup instance (family + direction + level/anchor + date) */
  id: string;
  family: StrategyFamily;
  name: string;
  direction: Direction;
  lifecycle: SetupLifecycle;
  /** Why this candidate exists (observed facts with timestamps). */
  evidence: Evidence[];
  /** What must happen for the entry to trigger (shown even when triggered, for the record). */
  triggerCondition: string;
  /** Underlying zone where entry is still valid (points). */
  entryZone: { low: number; high: number } | null;
  /** Underlying level whose breach invalidates the idea. */
  invalidationLevel: number;
  invalidationText: string;
  /** Underlying target level if any. */
  targetLevel: number | null;
  /** Intended holding horizon in minutes from trigger. */
  horizonMinutes: number;
  exitRules: string[];
  /** Preferred expiry class for contract ranking. */
  preferredExpiry: "0DTE" | "1-3DTE" | "weekly";
  counterargument: string;
  dataNotes: DataQualityNote[];
  /** ms: after this time the candidate must be re-evaluated or dropped. */
  expiresAt: number;
  /** Sort priority among candidates (not a score; lifecycle first, then family order). */
  priority: number;
  validation: StrategyMeta["validation"];
}

export interface WaitReason {
  family: StrategyFamily;
  reason: string;
}

export interface StrategyOutput {
  candidates: SetupCandidate[];
  waits: WaitReason[];
}
