import type { LeanResult } from "@predictit/engine";
import { useLinkClick } from "../lib/router";
import { fmtPct } from "../lib/format";

export function leanClass(direction: LeanResult["direction"]): string {
  return direction === "UP" ? "chip chip-call" : direction === "DOWN" ? "chip chip-put" : "chip chip-neutral";
}

/** Compact one-line lean: direction, strength, agreement and the top two reasons. */
export function LeanStrip({ lean, link = true }: { lean: LeanResult | undefined; link?: boolean }) {
  const onClick = useLinkClick("/lean");
  if (!lean) return null;
  return (
    <div className="lean-strip" role="note" aria-label="Market lean">
      <span className={leanClass(lean.direction)}>
        lean {lean.direction}
        {lean.strength !== "none" ? ` · ${lean.strength}` : ""}
      </span>
      <span className="small muted">
        {fmtPct(lean.agreement, 0)} of voting indicators agree; {lean.available} available; {lean.validation}
      </span>
      {lean.top.slice(0, 2).map((t, i) => (
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
