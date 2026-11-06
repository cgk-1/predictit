import type { ReactNode, SyntheticEvent } from "react";
import { useStoredBool } from "../lib/prefs";

/**
 * A native <details> section whose open/closed state is remembered per browser under `id`.
 * The summary line stays visible when collapsed, so it should carry the one-line answer for the section.
 */
export function Collapsible({ id, title, meta, defaultOpen = false, collapseBelowPx, children, className }: { id: string; title: ReactNode; meta?: ReactNode; defaultOpen?: boolean; collapseBelowPx?: number; children: ReactNode; className?: string }) {
  const [open, setOpen] = useStoredBool(`section.${id}`, defaultOpen, collapseBelowPx);
  const onToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    const next = e.currentTarget.open;
    if (next !== open) setOpen(next);
  };
  return (
    <details className={`disclosure${className ? ` ${className}` : ""}`} open={open} onToggle={onToggle} data-section={id}>
      <summary>
        <span className="disclosure-title">{title}</span>
        {meta ? <span className="panel-meta">{meta}</span> : null}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
