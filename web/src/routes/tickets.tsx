import { useLoaderData } from "react-router";
import { get, type ProductGroup, type Ticket } from "../api";
import { Bars, Card, date, Empty, money } from "../ui";

export async function loader() {
  const [tickets, byCategory] = await Promise.all([get<Ticket[]>("tickets"), get<ProductGroup[]>("product-spending")]);
  return { tickets, byCategory };
}

export default function Tickets() {
  const { tickets, byCategory } = useLoaderData<typeof loader>();
  if (!tickets.length) {
    return (
      <>
        <h1>Tickets</h1>
        <Empty>
          Aún no hay tickets. Pásale a Claude la foto de un ticket (Costco, Walmart…) y usará <code>add_ticket</code>,
          ligándolo al cargo de la tarjeta para desglosar la despensa por producto.
        </Empty>
      </>
    );
  }
  return (
    <>
      <h1>Tickets</h1>
      <div className="grid-2">
        <Card title="Gasto por categoría de producto">
          <Bars rows={byCategory.map((g) => ({ label: g.group, value: Number(g.total) }))} />
        </Card>
        <div className="stack">
          {tickets.map((t) => (
            <Card key={t.id} title={`${t.store} · ${money(t.total)}`} actions={<span className="muted">{date(t.purchaseDate)}</span>}>
              <table>
                <tbody>
                  {t.items.map((i) => (
                    <tr key={i.product}>
                      <td>{i.product}</td>
                      <td className="muted">{i.productCategory ?? "—"}</td>
                      <td className="num">{i.quantity}</td>
                      <td className="num">{money(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
