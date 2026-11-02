import { Form, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { type BudgetItem, type BudgetVsActual, get } from "../api";
import { Card, money, month as monthLabel, PairBars } from "../ui";

export async function loader({ request }: LoaderFunctionArgs) {
  const month = new URL(request.url).searchParams.get("month") ?? new Date().toLocaleDateString("en-CA").slice(0, 7);
  const [items, comparison] = await Promise.all([
    get<BudgetItem[]>("budget"),
    get<BudgetVsActual[]>("budget-vs-actual", { month }),
  ]);
  return { items, comparison, month };
}

export default function Budget() {
  const { items, comparison, month } = useLoaderData<typeof loader>();
  const total = items.filter((i) => i.active).reduce((s, i) => s + Number(i.amount), 0);

  return (
    <>
      <h1>Presupuesto</h1>
      <div className="grid-2">
        <Card title={`Conceptos mensuales · ${money(total)}`}>
          <table>
            <thead>
              <tr>
                <th>Concepto</th><th>Tarjeta</th><th>Día de pago</th><th className="num">Monto</th><th>Notas</th><th>Categoría</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={i.active ? undefined : "inactive"}>
                  <td>{i.name}</td>
                  <td className="muted">{i.creditCard ?? i.debitAccount ?? "—"}</td>
                  <td className="muted">{i.payday ?? "—"}</td>
                  <td className="num">{money(i.amount)}</td>
                  <td className="muted">{i.notes ?? "—"}</td>
                  <td>{i.category ? <span className="tag">{i.category}</span> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card
          title={`Presupuesto vs. real · ${monthLabel(month)}`}
          actions={
            <Form method="get" className="inline-form">
              <input type="month" name="month" defaultValue={month} key={month} />
              <button type="submit">Ver</button>
            </Form>
          }
        >
          <PairBars
            a="Presupuesto"
            b="Real"
            rows={comparison.map((c) => ({ label: c.category, a: Number(c.budget), b: Number(c.actual) }))}
          />
        </Card>
      </div>
    </>
  );
}
