import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { type Category, get, type Installment, send } from "../api";
import { Card, Chip, chipHues, date, Empty, money } from "../ui";

export async function loader() {
  const [plans, categories] = await Promise.all([get<Installment[]>("installments"), get<Category[]>("categories")]);
  return { plans, categories };
}

const NONE = "Sin categoría";

export default function Installments() {
  const { plans, categories } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const hues = chipHues(categories.map((c) => c.name));
  const options = [NONE, ...categories.map((c) => c.name)];

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
      <div className="grid-2">
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
