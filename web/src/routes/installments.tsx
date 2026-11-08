import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { type Category, get, type Installment, send } from "../api";
import { Card, Chip, chipHues, date, Empty, money, month, Stat } from "../ui";

export async function loader() {
  const [plans, categories] = await Promise.all([get<Installment[]>("installments"), get<Category[]>("categories")]);
  return { plans, categories };
}

const NONE = "Sin categoría";

/** Month arithmetic in UTC: a timestamp for the first day of a month. */
const monthOf = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, 1);
const addMonths = (t: number, n: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
};
const monthsBetween = (a: number, b: number) => {
  const x = new Date(a), y = new Date(b);
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
};
const tickFmt = new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Gantt-style timeline of the active plans: when each one ends and when everything is paid off. */
function Timeline({ plans }: { plans: Installment[] }) {
  const rows = plans
    .filter((p) => p.remainingPayments > 0 && p.schedule.length)
    .map((p) => {
      const last = p.schedule[p.schedule.length - 1]!.date;
      return { p, last, start: monthOf(p.schedule[0]!.date), end: addMonths(monthOf(last), 1) };
    })
    .sort((a, b) => a.end - b.end || b.start - a.start);
  if (!rows.length) return null;

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = addMonths(today, 0);
  const min = Math.min(thisMonth, ...rows.map((r) => r.start));
  const max = Math.max(...rows.map((r) => r.end));
  const x = (t: number) => (Math.min(Math.max(t, min), max) - min) / (max - min);

  const span = monthsBetween(min, max);
  const step = span <= 12 ? 1 : span <= 24 ? 3 : 6;
  const ticks: number[] = [];
  for (let t = min; t < max; t = addMonths(t, 1)) if (new Date(t).getUTCMonth() % step === 0 || t === min) ticks.push(t);

  const final = rows[rows.length - 1]!;
  const left = monthsBetween(thisMonth, final.end);

  return (
    <Card title="¿Cuándo termino de pagar?">
      <p className="tl-headline">
        Todo pagado en <strong>{month(final.last.slice(0, 7))}</strong>
        <span className="muted"> · {left === 1 ? "queda 1 mes" : `quedan ${left} meses`}, la última es {final.p.description}</span>
      </p>
      <div className="legend">
        <span><i className="swatch series-1" />Pagado</span>
        <span><i className="swatch tl-pending-swatch" />Pendiente</span>
        <span><i className="tl-today-swatch" />Hoy</span>
      </div>
      <div className="tl">
        <div className="tl-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="tl-tick" style={{ "--x": x(t) } as React.CSSProperties}>{tickFmt.format(t)}</span>
          ))}
        </div>
        <ul className="tl-rows">
          {ticks.map((t) => <li key={t} className="tl-grid" aria-hidden="true" style={{ "--x": x(t) } as React.CSSProperties} />)}
          {rows.map(({ p, start, end, last }) => {
            const a = x(start), b = x(end), mid = Math.min(Math.max(x(today), a), b);
            return (
              <li key={p.id} className="tl-row"
                data-tip={`${p.description}: ${p.paidCount}/${p.months} pagos · resta ${money(p.remainingAmount)} · última ${date(last)}`}>
                <span className="tl-label">{p.description}</span>
                <span className="tl-track">
                  {mid > a && <span className="tl-bar series-1" style={{ left: `${a * 100}%`, width: `${(mid - a) * 100}%` }} />}
                  {b > mid && <span className="tl-bar tl-pending" style={{ left: `${mid * 100}%`, width: `${(b - mid) * 100}%` }} />}
                </span>
                <span className="tl-end">{tickFmt.format(monthOf(last))}</span>
              </li>
            );
          })}
          <li className="tl-today" aria-hidden="true" style={{ "--x": x(today) } as React.CSSProperties} />
        </ul>
      </div>
    </Card>
  );
}

export default function Installments() {
  const { plans, categories } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const hues = chipHues(categories.map((c) => c.name));
  const options = [NONE, ...categories.map((c) => c.name)];
  const active = plans.filter((p) => p.remainingPayments > 0);
  const sum = (list: Installment[], f: (p: Installment) => string) => list.reduce((acc, p) => acc + Number(f(p)), 0);
  const monthly = sum(active, (p) => p.monthlyAmount);
  const total = sum(plans, (p) => p.totalAmount);
  const remaining = sum(plans, (p) => p.remainingAmount);

  async function setCategory(p: Installment, category: string) {
    try {
      await send("PATCH", `installments/${p.id}`, { category: category === NONE ? null : category });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    await revalidator.revalidate();
  }

  return (
    <>
      <h1>Compras a meses</h1>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!plans.length && <Empty>No hay compras a meses registradas.</Empty>}
      {plans.length > 0 && (
        <div className="stats">
          <Stat
            label="Pagas al mes"
            value={money(monthly)}
            hint={`${active.length} compra${active.length === 1 ? "" : "s"} activa${active.length === 1 ? "" : "s"} · total ${money(total)} · resta ${money(remaining)}`}
          />
        </div>
      )}
      <Timeline plans={plans} />
      <div className="masonry">
        {plans.map((p) => (
          <Card key={p.id} title={p.description} actions={<span className="muted">{p.bank === p.creditCard ? p.creditCard : `${p.bank} · ${p.creditCard}`}</span>}>
            <p className="plan-meta">
              {p.category ? <Chip label={p.category} hue={hues.get(p.category) ?? 0} /> : <span className="tag">{NONE}</span>}
              <select className="cell-input plan-category" aria-label={`Categoría de ${p.description}`}
                value={p.category ?? NONE} onChange={(e) => setCategory(p, e.target.value)}>
                {options.map((o) => <option key={o}>{o}</option>)}
              </select>
            </p>
            <div className="progress" title={`${p.paidCount} de ${p.months} pagos`}>
              <span className="series-1" style={{ width: `${(p.paidCount / p.months) * 100}%` }} />
            </div>
            <p>
              <strong>{p.paidCount}/{p.months}</strong> pagados · {money(p.paidAmount)} de {money(p.totalAmount)} ·
              resta <strong>{money(p.remainingAmount)}</strong>
            </p>
            <p className="muted small">Compra {date(p.purchaseDate)} · {money(p.monthlyAmount)} al mes</p>
            <table>
              <thead><tr><th>#</th><th>Corte</th><th className="num">Monto</th><th>Estado</th></tr></thead>
              <tbody>
                {p.schedule.map((s) => (
                  <tr key={s.number}>
                    <td>{s.number}</td>
                    <td>{date(s.date)}</td>
                    <td className="num">{money(s.amount)}</td>
                    <td>{s.paid ? <span className="tag ok">✓ Pagado</span> : <span className="tag">Pendiente</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </>
  );
}
