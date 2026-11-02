/** Small shared pieces: formatting, stat tiles and a plain-CSS bar list. */
import { type CSSProperties, type ReactNode, useState } from "react";

const fmt: Record<string, Intl.NumberFormat> = {};
export const money = (v: string | number | null | undefined, currency = "MXN") =>
  v == null ? "—" : (fmt[currency] ??= new Intl.NumberFormat("es-MX", { style: "currency", currency })).format(Number(v));

const dayFmt = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
export const date = (iso: string | null | undefined) => (iso ? dayFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "—");

const monthFmt = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
export const month = (ym: string) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`));

export const KIND_LABEL: Record<string, string> = {
  purchase: "Compra", installment: "Mensualidad", payment: "Pago", refund: "Devolución",
  cash_withdrawal: "Retiro", fee: "Comisión", interest: "Interés",
};

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Horizontal bars, one series: label, bar and value always visible; hover shows the exact value. */
export function Bars({ rows }: { rows: { label: string; value: number; hint?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.label} className="bar-row" data-tip={r.hint ?? `${r.label}: ${money(r.value)}`}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar series-1" style={{ width: `${(Math.max(r.value, 0) / max) * 100}%` }} />
          </span>
          <span className="bar-value">{money(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/**
 * Spreadsheet-style cell: shows `display`, click (or Enter) to edit, Enter/blur saves, Escape cancels.
 * With `options` it is a select that saves on change. `onSave` only runs when the value changed.
 */
export function EditableCell({ value, display, onSave, type = "text", options, label }: {
  value: string; display?: ReactNode; onSave: (v: string) => void;
  type?: "text" | "number"; options?: readonly string[]; label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== value) onSave(draft.trim());
    setDraft(null);
  };

  if (options) {
    return (
      <select className="cell-input" aria-label={label} value={value} onChange={(e) => onSave(e.target.value)}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }
  if (draft === null) {
    return (
      <span
        className="cell" role="button" tabIndex={0} aria-label={`Editar ${label}`}
        onClick={() => setDraft(value)}
        onKeyDown={(e) => e.key === "Enter" && setDraft(value)}
      >
        {display ?? (value || <span className="muted">—</span>)}
      </span>
    );
  }
  return (
    <input
      className="cell-input" aria-label={label} autoFocus type={type} step={type === "number" ? "any" : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

/** Incremental palette: hues evenly spaced across the wheel for the distinct labels of this render. */
export function chipHues(labels: (string | null | undefined)[]): Map<string, number> {
  const distinct = [...new Set(labels.filter((l): l is string => !!l))];
  return new Map(distinct.map((l, i) => [l, Math.round((i * 360) / distinct.length)]));
}

export function Chip({ label, hue }: { label: string; hue: number }) {
  return <span className="tag chip" style={{ "--h": hue } as CSSProperties}>{label}</span>;
}
