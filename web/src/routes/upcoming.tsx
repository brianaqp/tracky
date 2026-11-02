/** Próximos gastos: upcoming one-off events (a trip, Christmas) and the expenses each one brings. */
import { type FormEvent, useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { get, send, type Upcoming, type UpcomingItem } from "../api";
import { Card, date, EditableCell, Empty, money, Stat } from "../ui";

export async function loader() {
  return { events: await get<Upcoming[]>("upcoming") };
}

const DAY = 86_400_000;
export function daysUntil(iso: string) {
  const today = new Date(`${new Date().toLocaleDateString("en-CA")}T00:00:00Z`).getTime();
  return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - today) / DAY);
}
export const inDays = (n: number) => (n === 0 ? "hoy" : n === 1 ? "mañana" : n < 0 ? `hace ${-n} días` : `en ${n} días`);

function amountOf(v: string): number {
  const n = Number(v);
  if (!v || !(n > 0)) throw new Error("El monto debe ser mayor a 0.");
  return n;
}

export default function UpcomingPage() {
  const { events } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", due_date: "", notes: "" });

  async function run(request: () => Promise<unknown>): Promise<boolean> {
    try {
      await request();
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      await revalidator.revalidate();
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.due_date) return setError("Escribe un nombre y una fecha.");
    const body = { name: draft.name.trim(), due_date: draft.due_date, notes: draft.notes.trim() || null };
    if (await run(() => send("POST", "upcoming", body))) setDraft({ name: "", due_date: "", notes: "" });
  }

  const pending = events.reduce((s, e) => s + Number(e.pending), 0);
  const next = events.find((e) => Number(e.pending) > 0 && daysUntil(e.dueDate) >= 0);

  return (
    <>
      <h1>Próximos gastos</h1>
      <div className="stats">
        <Stat label="Por pagar" value={money(pending)} hint={`${events.length} ${events.length === 1 ? "evento" : "eventos"}`} />
        <Stat label="El más cercano" value={next ? next.name : "—"}
          hint={next ? `${date(next.dueDate)} · ${inDays(daysUntil(next.dueDate))} · ${money(next.pending)}` : "Nada pendiente"} />
      </div>

      <Card title="Nuevo próximo gasto">
        <form className="filters" onSubmit={create}>
          <label>Evento<input placeholder="Viaje, Navidad, servicio del carro…" value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label>Fecha<input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></label>
          <label>Notas<input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
          <button type="submit">Agregar</button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </Card>

      {!events.length && <Empty>Sin próximos gastos. Agrega uno arriba y luego sus gastos (boletos, hotel, regalos…).</Empty>}
      <div className="grid-2">
        {events.map((e) => <EventCard key={e.id} event={e} run={run} setError={setError} />)}
      </div>
    </>
  );
}

function EventCard({ event: e, run, setError }: {
  event: Upcoming; run: (r: () => Promise<unknown>) => Promise<boolean>; setError: (m: string) => void;
}) {
  const [item, setItem] = useState({ name: "", amount: "" });
  const days = daysUntil(e.dueDate);
  const paid = Number(e.total) - Number(e.pending);

  async function addItem(ev: FormEvent) {
    ev.preventDefault();
    let body;
    try {
      if (!item.name.trim()) throw new Error("Escribe el gasto.");
      body = { upcoming_expense_id: e.id, name: item.name.trim(), amount: amountOf(item.amount) };
    } catch (err) {
      return setError((err as Error).message);
    }
    if (await run(() => send("POST", "upcoming-items", body))) setItem({ name: "", amount: "" });
  }

  const patchItem = (i: UpcomingItem, body: Record<string, unknown>) => run(() => send("PATCH", `upcoming-items/${i.id}`, body));

  return (
    <Card
      title={e.name}
      actions={
        <button type="button" className="row-action visible" aria-label={`Borrar ${e.name}`}
          onClick={() => confirm(`¿Borrar "${e.name}" y sus gastos?`) && run(() => send("DELETE", `upcoming/${e.id}`))}>×</button>
      }
    >
      <p className="muted small">
        <EditableCell label="fecha" value={e.dueDate} display={`${date(e.dueDate)} · ${inDays(days)}`}
          onSave={(v) => run(() => send("PATCH", `upcoming/${e.id}`, { due_date: v }))} />
      </p>
      {e.notes && <p className="small">{e.notes}</p>}
      {Number(e.total) > 0 && (
        <div className="progress" title={`${money(paid)} de ${money(e.total)} pagado`}>
          <span className="series-1" style={{ width: `${(paid / Number(e.total)) * 100}%` }} />
        </div>
      )}
      <table className="sheet">
        <thead><tr><th>Pagado</th><th>Gasto</th><th className="num">Monto</th><th aria-label="Acciones" /></tr></thead>
        <tbody>
          {e.items.map((i) => (
            <tr key={i.id} className={i.paid ? "inactive" : undefined}>
              <td><input type="checkbox" aria-label={`${i.name} pagado`} checked={i.paid} onChange={(ev) => patchItem(i, { paid: ev.target.checked })} /></td>
              <td><EditableCell label="gasto" value={i.name} onSave={(v) => patchItem(i, { name: v })} /></td>
              <td className="num">
                <EditableCell label="monto" type="number" value={String(Number(i.amount))} display={money(i.amount)}
                  onSave={(v) => { try { void patchItem(i, { amount: amountOf(v) }); } catch (err) { setError((err as Error).message); } }} />
              </td>
              <td className="row-actions">
                <button type="button" className="row-action" aria-label={`Borrar ${i.name}`}
                  onClick={() => run(() => send("DELETE", `upcoming-items/${i.id}`))}>×</button>
              </td>
            </tr>
          ))}
          <tr className="new-row">
            <td />
            <td>
              <form id={`new-item-${e.id}`} onSubmit={addItem} />
              <input form={`new-item-${e.id}`} className="cell-input" placeholder="+ Nuevo gasto" aria-label="Nuevo gasto"
                value={item.name} onChange={(ev) => setItem({ ...item, name: ev.target.value })} />
            </td>
            <td className="num">
              <input form={`new-item-${e.id}`} className="cell-input num" type="number" step="any" placeholder="Monto" aria-label="Monto del nuevo gasto"
                value={item.amount} onChange={(ev) => setItem({ ...item, amount: ev.target.value })} />
            </td>
            <td><button form={`new-item-${e.id}`} type="submit" className="row-action visible" aria-label="Agregar gasto">↵</button></td>
          </tr>
        </tbody>
        <tfoot>
          <tr><td /><td>Por pagar</td><td className="num">{money(e.pending)}</td><td /></tr>
          {paid > 0 && <tr><td /><td className="muted">Total</td><td className="num muted">{money(e.total)}</td><td /></tr>}
        </tfoot>
      </table>
    </Card>
  );
}
