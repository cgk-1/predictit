import { useId, type ChangeEvent, type ReactNode } from "react";

export function Field({ label, help, children, id }: { label: ReactNode; help?: ReactNode; children: (id: string) => ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label className="field-label" htmlFor={fid}>
        {label}
      </label>
      {children(fid)}
      {help ? <span className="help">{help}</span> : null}
    </div>
  );
}

export function NumberField({ label, value, onChange, help, step, min, max, disabled, placeholder }: { label: ReactNode; value: number | "" | null; onChange: (v: number | null) => void; help?: ReactNode; step?: number | "any"; min?: number; max?: number; disabled?: boolean; placeholder?: string }) {
  return (
    <Field label={label} help={help}>
      {(id) => (
        <input
          id={id}
          className="input"
          type="number"
          inputMode="decimal"
          step={step ?? "any"}
          min={min}
          max={max}
          disabled={disabled}
          placeholder={placeholder}
          value={value === null || value === "" ? "" : value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      )}
    </Field>
  );
}

export function TextField({ label, value, onChange, help, type = "text", placeholder, mono, disabled, autoComplete }: { label: ReactNode; value: string; onChange: (v: string) => void; help?: ReactNode; type?: string; placeholder?: string; mono?: boolean; disabled?: boolean; autoComplete?: string }) {
  return (
    <Field label={label} help={help}>
      {(id) => <input id={id} className={`input${mono ? "" : " input-text"}`} type={type} value={value} placeholder={placeholder} disabled={disabled} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, help, disabled }: { label: ReactNode; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; help?: ReactNode; disabled?: boolean }) {
  return (
    <Field label={label} help={help}>
      {(id) => (
        <select id={id} className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Toggle({ label, checked, onChange, help }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; help?: ReactNode }) {
  return (
    <div className="field">
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {help ? <span className="help">{help}</span> : null}
    </div>
  );
}

export function Button({ children, onClick, kind = "default", type = "button", disabled, small, title }: { children: ReactNode; onClick?: () => void; kind?: "default" | "primary" | "danger" | "ghost"; type?: "button" | "submit"; disabled?: boolean; small?: boolean; title?: string }) {
  const cls = ["btn", kind !== "default" ? `btn-${kind}` : "", small ? "btn-sm" : ""].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function FormStatus({ status }: { status: { kind: "idle" | "busy" | "ok" | "err"; text?: string } }) {
  if (status.kind === "idle") return null;
  const cls = status.kind === "err" ? "form-status form-status-err" : status.kind === "ok" ? "form-status form-status-ok" : "form-status";
  return (
    <span className={cls} role={status.kind === "err" ? "alert" : "status"}>
      {status.text ?? (status.kind === "busy" ? "Working…" : status.kind === "ok" ? "Saved." : "Error.")}
    </span>
  );
}

export type FormStatusValue = { kind: "idle" | "busy" | "ok" | "err"; text?: string };
