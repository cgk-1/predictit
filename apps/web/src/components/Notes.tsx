import type { DataQualityNote } from "@predictit/engine";

export function Notes({ notes, title }: { notes: DataQualityNote[]; title?: string }) {
  if (!notes.length) return null;
  return (
    <div>
      {title ? <div className="section-title">{title}</div> : null}
      <ul className="notes" style={{ listStyle: "none", padding: 0 }}>
        {notes.map((n, i) => (
          <li key={i} className={`note note-${n.level}`}>
            <span className="xs faint" style={{ minWidth: "3em" }}>
              {n.level}
            </span>
            <span>{n.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
