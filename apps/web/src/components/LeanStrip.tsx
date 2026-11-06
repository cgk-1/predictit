import type { LeanResult } from "@predictit/engine";
import { useLinkClick } from "../lib/router";
import { fmtPct } from "../lib/format";

export function leanClass(direction: LeanResult["direction"]): string {
  return direction === "UP" ? "chip chip-call" : direction === "DOWN" ? "chip chip-put" : "chip chip-neutral";
}

/** "prior weights (burn-in)" or "learned weights": which weights produced the lean. Older records carry no mode. */
export function weightsModeText(lean: Pick<LeanResult, "weightsMode"> | undefined): string {
  if (!lean?.weightsMode) return "weights n/a";
  return lean.weightsMode === "learned" ? "learned weights" : "prior weights (burn-in)";
}

/**
 * Compact one-line lean: direction, strength, agreement, which weights produced it and the top two reasons.
 * `bare` drops the border so the strip can sit inside another card.
 */
export function LeanStrip({ lean, link = true, bare = false, reasons = 2 }: { lean: LeanResult | undefined; link?: boolean; bare?: boolean; reasons?: number }) {
  const onClick = useLinkClick("/lean");
  if (!lean) return null;
  return (
    <div className={`lean-strip${bare ? " lean-bare" : ""}`} role="note" aria-label="Market lean">
      <span className={leanClass(lean.direction)}>
        lean {lean.direction}
        {lean.strength !== "none" ? ` · ${lean.strength}` : ""}
      </span>
      <span className="small muted">
        {fmtPct(lean.agreement, 0)} of voting indicators agree, {lean.available} available
      </span>
      <span className="small faint" title="Learned weights replace the priors after the burn-in">
        {weightsModeText(lean)}
      </span>
      {lean.top.slice(0, reasons).map((t, i) => (
        <span key={i} className="small">
          {t}
        </span>
      ))}
      {link ? (
        <a href="/lean" onClick={onClick} className="small">
          all votes
        </a>
      ) : null}
    </div>
  );
}
