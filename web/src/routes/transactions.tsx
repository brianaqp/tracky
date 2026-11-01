import { Form, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { type Category, get, type Transaction } from "../api";
import { date, KIND_LABEL, money } from "../ui";

export async function loader({ request }: LoaderFunctionArgs) {
  const q = new URL(request.url).searchParams;
  const filters = {
    start: q.get("start") ?? undefined, end: q.get("end") ?? undefined, kind: q.get("kind") ?? undefined,
    category: q.get("category") ?? undefined, uncategorized: q.get("uncategorized") ?? undefined,
  };
  const [transactions, categories] = await Promise.all([
    get<Transaction[]>("transactions", filters),
    get<Category[]>("categories"),
  ]);
  return { transactions, categories, filters };
}

const SIGN: Record<string, string> = { payment: "−", refund: "−" };

export default function Transactions() {
  const { transactions, categories, filters } = useLoaderData<typeof loader>();
  const charges = transactions.filter((t) => !SIGN[t.kind]).reduce((s, t) => s + Number(t.amount), 0);
  const credits = transactions.filter((t) => SIGN[t.kind]).reduce((s, t) => s + Number(t.amount), 0);

  return (
    <>
      <h1>Movimientos</h1>
      <Form method="get" className="filters" key={JSON.stringify(filters)}>
        <label>Desde <input type="date" name="start" defaultValue={filters.start} /></label>
        <label>Hasta <input type="date" name="end" defaultValue={filters.end} /></label>
        <label>
          Tipo
          <select name="kind" defaultValue={filters.kind ?? ""}>
            <option value="">Todos</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Categoría
          <select name="category" defaultValue={filters.category ?? ""}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" name="uncategorized" value="true" defaultChecked={filters.uncategorized === "true"} /> Sin categoría
        </label>
        <button type="submit">Filtrar</button>
        <a href="/movimientos" className="button ghost">Limpiar</a>
      </Form>

      <p className="muted">
        {transactions.length} movimientos · cargos {money(charges)} · abonos {money(credits)}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Categoría</th><th>Cuenta</th><th className="num">Monto</th></tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{date(t.operationDate)}</td>
                <td>{t.description}</td>
                <td>
                  <span className={`tag kind-${t.kind}`}>{KIND_LABEL[t.kind] ?? t.kind}</span>
                  {t.installmentNumber && <span className="muted small"> #{t.installmentNumber}</span>}
                </td>
                <td>{t.category ?? <span className="muted">—</span>}</td>
                <td className="muted">{t.source}</td>
                <td className="num nowrap">{SIGN[t.kind] ?? ""}{money(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
