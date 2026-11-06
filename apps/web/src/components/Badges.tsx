import type { DecisionState, Direction, SetupLifecycle } from "@predictit/engine";
import type { ServerState } from "../api/types";

export type Mode = ServerState["mode"];

export function ModeBadge({ mode, title }: { mode: Mode; title?: string }) {
  const cls = mode === "LIVE" ? "badge-live" : mode === "DELAYED" ? "badge-delayed" : mode === "REPLAY" ? "badge-replay" : "badge-none";
  const hint = title ?? (mode === "LIVE" ? "Live data (Schwab)" : mode === "DELAYED" ? "Delayed data (15 min, Cboe): study only, no execution" : mode === "REPLAY" ? "Reconstructed from stored snapshots" : "No market data");
  return (
    <span className={`badge ${cls}`} title={hint} aria-label={`Data mode ${mode}`}>
      {mode}
    </span>
  );
}

export function stateClass(state: DecisionState | "CALL SETUP" | "PUT SETUP" | "WAIT" | "PASS"): "call" | "put" | "wait" | "pass" | "manage" {
  switch (state) {
    case "CALL SETUP":
      return "call";
    case "PUT SETUP":
      return "put";
    case "WAIT":
      return "wait";
    case "PASS":
      return "pass";
    default:
      return "manage";
  }
}

export function StateBadge({ state }: { state: DecisionState }) {
  return <span className={`chip chip-${stateClass(state)}`}>{state}</span>;
}

export function LifecycleChip({ lifecycle }: { lifecycle: SetupLifecycle }) {
  return <span className={`chip chip-${lifecycle}`}>{lifecycle}</span>;
}

export function DirectionChip({ direction }: { direction: Direction }) {
  return <span className={`chip chip-${direction}`}>{direction}</span>;
}

export function ValidationChip({ validation }: { validation: string }) {
  const cls = validation === "out-of-sample" ? "chip-ok" : validation === "in-sample-only" ? "chip-wait" : "chip-neutral";
  return (
    <span className={`chip ${cls}`} title="Validation status from the evidence ledger">
      {validation}
    </span>
  );
}

export function Chip({ children, kind = "neutral" }: { children: React.ReactNode; kind?: "neutral" | "ok" | "bad" | "wait" | "manage" | "replay" | "call" | "put" }) {
  return <span className={`chip chip-${kind}`}>{children}</span>;
}
