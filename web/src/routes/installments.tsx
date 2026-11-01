import { useLoaderData } from "react-router";
import { get, type Installment } from "../api";
import { Card, date, Empty, money } from "../ui";

export async function loader() {
  return { plans: await get<Installment[]>("installments") };
}

export default function Installments() {
  const { plans } = useLoaderData<typeof loader>();
  return (
    <>
      <h1>Compras a meses</h1>
      {!plans.length && <Empty>No hay compras a meses registradas.</Empty>}
      <div className="grid-2">
        {plans.map((p) => (
          <Card key={p.id} title={p.description} actions={<span className="muted">{p.creditCard}</span>}>
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
