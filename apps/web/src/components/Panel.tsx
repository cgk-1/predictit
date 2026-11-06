import type { ReactNode } from "react";

export function Panel({ title, meta, children, className, as: Tag = "section" }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; as?: "section" | "div" }) {
  return (
    <Tag className={`panel${className ? ` ${className}` : ""}`}>
      {(title || meta) && (
        <div className="panel-head">
          {title ? <h2>{title}</h2> : <span />}
          {meta ? <div className="panel-meta">{meta}</div> : null}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </Tag>
  );
}

export function Fact({ label, value, meta, text }: { label: ReactNode; value: ReactNode; meta?: ReactNode; text?: boolean }) {
  return (
    <div className="fact">
      <span className="fact-label">{label}</span>
      <span className={`fact-value${text ? " fact-value-text" : ""}`}>{value}</span>
      {meta ? <span className="fact-meta">{meta}</span> : null}
    </div>
  );
}

export function Stat({ label, value, meta }: { label: ReactNode; value: ReactNode; meta?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {meta ? <span className="fact-meta">{meta}</span> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** "n/a" with the reason it is unavailable. */
export function NA({ reason }: { reason?: string }) {
  return (
    <span className="na" title={reason}>
      n/a{reason ? ` — ${reason}` : ""}
    </span>
  );
}
