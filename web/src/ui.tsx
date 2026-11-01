/** Small shared pieces: formatting, stat tiles and a plain-CSS bar list. */
import type { ReactNode } from "react";

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
export const money = (v: string | number | null | undefined) => (v == null ? "—" : mxn.format(Number(v)));

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

/** Two series per row (e.g. budget vs actual) with a legend. */
export function PairBars({ rows, a, b }: {
  rows: { label: string; a: number; b: number }[]; a: string; b: string;
}) {
  const max = Math.max(...rows.flatMap((r) => [r.a, r.b]), 1);
  return (
    <>
      <div className="legend">
        <span><i className="swatch series-1" />{a}</span>
        <span><i className="swatch series-2" />{b}</span>
      </div>
      <ul className="bars">
        {rows.map((r) => (
          <li key={r.label} className="bar-row pair" data-tip={`${r.label} · ${a}: ${money(r.a)} · ${b}: ${money(r.b)}`}>
            <span className="bar-label">{r.label}</span>
            <span className="bar-track stacked">
              <span className="bar series-1" style={{ width: `${(r.a / max) * 100}%` }} />
              <span className="bar series-2" style={{ width: `${(r.b / max) * 100}%` }} />
            </span>
            <span className="bar-value">{money(r.a)}<br /><span className="muted">{money(r.b)}</span></span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
