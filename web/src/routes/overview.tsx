import { Link, useLoaderData } from "react-router";
import { type Bank, type BudgetItem, type ForecastMonth, get, type Group, type Installment } from "../api";
import { Bars, Card, date, money, month, Stat } from "../ui";

export async function loader() {
  const [spending, forecast, installments, budget, accounts] = await Promise.all([
    get<Group[]>("spending-summary"),
    get<ForecastMonth[]>("forecast", { months: "4" }),
    get<Installment[]>("installments"),
    get<BudgetItem[]>("budget"),
    get<Bank[]>("accounts"),
  ]);
  return { spending, forecast, installments, budget, accounts };
}

export default function Overview() {
  const { spending, forecast, installments, budget, accounts } = useLoaderData<typeof loader>();
  const spent = spending.reduce((s, g) => s + Number(g.total), 0);
  const budgetTotal = budget.filter((b) => b.active).reduce((s, b) => s + Number(b.amount), 0);
  const pending = installments.reduce((s, p) => s + Number(p.remainingAmount), 0);
  const statements = accounts.flatMap((b) => b.creditCards.flatMap((c) => (c.latestStatement ? [{ card: c.name, ...c.latestStatement }] : [])));
  const next = statements.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return (
    <>
      <h1>Resumen</h1>
      <div className="stats">
        <Stat label="Gasto real registrado" value={money(spent)} hint={`${spending.reduce((s, g) => s + g.movements, 0)} movimientos`} />
        <Stat label="Presupuesto mensual" value={money(budgetTotal)} hint={`${budget.length} conceptos`} />
        <Stat label="Pendiente a meses" value={money(pending)} hint={`${installments.filter((p) => p.remainingPayments > 0).length} compras`} />
        <Stat
          label="Próximo pago de tarjeta"
          value={next ? money(next.paymentNoInterest) : "—"}
          hint={next ? `${next.card} · vence ${date(next.dueDate)}` : "Sin estados de cuenta"}
        />
      </div>

      <div className="grid-2">
        <Card title="Gasto por categoría" actions={<Link to="/movimientos">Ver movimientos</Link>}>
          <Bars rows={spending.map((g) => ({ label: g.group, value: Number(g.total), hint: `${g.group}: ${money(g.total)} · ${g.movements} mov.` }))} />
          <p className="note">Compras, comisiones e intereses. Las mensualidades no cuentan: la compra completa ya está sumada.</p>
        </Card>

        <Card title="Proyección de salidas">
          <table>
            <thead>
              <tr><th>Mes</th><th className="num">Presupuesto</th><th className="num">A meses</th><th className="num">Préstamos</th><th className="num">Total</th></tr>
            </thead>
            <tbody>
              {forecast.map((m) => (
                <tr key={m.month}>
                  <td>
                    {month(m.month)}
                    {m.installments.map((i) => (
                      <div key={i.description} className="muted small">{i.description} {i.number}/{i.of} · {money(i.amount)}</div>
                    ))}
                  </td>
                  <td className="num">{money(m.budget)}</td>
                  <td className="num">{money(m.installmentsTotal)}</td>
                  <td className="num">{money(m.loansTotal)}</td>
                  <td className="num strong">{money(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
