import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { get, send, type ProductCategory, type ProductGroup, type Ticket } from "../api";
import { Bars, Card, date, Empty, money, Stat } from "../ui";

export async function loader() {
  const [tickets, byCategory, byPayment, categories] = await Promise.all([
    get<Ticket[]>("tickets"),
    get<ProductGroup[]>("product-spending"),
    get<ProductGroup[]>("product-spending", { group_by: "payment" }),
    get<ProductCategory[]>("product-categories"),
  ]);
  return { tickets, byCategory, byPayment, categories };
}

const categoryLabel = (name: string | null, tentative: boolean) => (name ?? "(sin categoría)") + (tentative ? " · tentativa" : "");

function paymentLabel(t: Ticket) {
  if (t.paymentMethod === "cash") return "Efectivo";
  if (t.paymentMethod) return t.account ?? (t.paymentMethod === "credit_card" ? "Tarjeta de crédito" : "Débito");
  return "Por definir";
}

export default function Tickets() {
  const { tickets, byCategory, byPayment, categories } = useLoaderData<typeof loader>();
  if (!tickets.length) {
    return (
      <>
        <h1>Tickets</h1>
        <Empty>
          Aún no hay tickets. Pásale a Claude la foto de un ticket del súper y usará <code>add_ticket</code>: cada producto va a
          una categoría existente (o a una tentativa si ninguna encaja) y queda registrado cómo pagaste.
        </Empty>
      </>
    );
  }
  const total = tickets.reduce((s, t) => s + Number(t.total), 0);
  const tentative = categories.filter((c) => c.tentative);
  return (
    <>
      <h1>Tickets</h1>
      <div className="stats">
        <Stat label="Gastado en tickets" value={money(total)} hint={`${tickets.length} tickets`} />
        <Stat label="Ticket promedio" value={money(total / tickets.length)} />
        <Stat label="Categoría principal" value={byCategory[0]?.group ?? "—"} hint={byCategory[0] && money(byCategory[0].total)} />
      </div>
      <div className="grid-2">
        <div className="stack">
          <Card title="¿A dónde va el dinero?" actions={<span className="muted small">Por categoría de producto</span>}>
            <Bars rows={byCategory.map((g) => ({ label: categoryLabel(g.group, g.tentative), value: Number(g.total) }))} />
          </Card>
          <Card title="Por método de pago">
            <Bars rows={byPayment.map((g) => ({ label: g.group, value: Number(g.total) }))} />
          </Card>
          {tentative.length > 0 && <TentativeCategories categories={tentative} />}
        </div>
        <div className="stack">
          {tickets.map((t) => <TicketCard key={t.id} ticket={t} />)}
        </div>
      </div>
    </>
  );
}

function TicketCard({ ticket: t }: { ticket: Ticket }) {
  return (
    <Card
      title={`${t.store} · ${money(t.total)}`}
      actions={<span className="muted small">{date(t.purchaseDate)} · {paymentLabel(t)}</span>}
    >
      <Bars
        rows={t.byCategory.map((g) => ({
          label: categoryLabel(g.category, g.tentative),
          value: Number(g.total),
          hint: `${categoryLabel(g.category, g.tentative)}: ${money(g.total)} (${g.items} productos)`,
        }))}
      />
      <details>
        <summary className="muted small">{t.items.length} productos</summary>
        <div className="table-wrap">
          <table>
            <tbody>
              {t.items.map((i, n) => (
                <tr key={n}>
                  <td>{i.product}</td>
                  <td>
                    {i.productCategory
                      ? <span className="tag">{categoryLabel(i.productCategory, i.tentative)}</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="num">{i.quantity}</td>
                  <td className="num">{money(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

/** Categories Claude created because nothing fit: confirm them here, or ask Claude to rename or merge them. */
function TentativeCategories({ categories }: { categories: ProductCategory[] }) {
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  async function confirm(name: string) {
    try {
      await send("POST", "product-categories", { name });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    await revalidator.revalidate();
  }
  return (
    <Card title="Categorías tentativas" actions={<span className="muted small">Pídele a Claude renombrar o fusionar</span>}>
      <div className="table-wrap">
        <table>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="num muted">{c.products} productos</td>
                <td className="num"><button type="button" onClick={() => confirm(c.name)}>Confirmar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Card>
  );
}
