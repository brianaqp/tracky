/** Abonos: the real deposits of a month, each optionally tied to an income approximation and a debit account. */
import { type FormEvent, useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { type Income, type IncomeItem, send } from "../api";
import { Card, date as dateLabel, EditableCell, money } from "../ui";

const NONE = "—";
const emptyDraft = (month: string) => ({ date: `${month}-01`, amount: "", income: "", account: "", notes: "" });

function parseAmount(v: string): number {
  const n = Number(v);
  if (!v || !(n > 0)) throw new Error("El monto debe ser mayor a 0.");
  return n;
}
function parseDate(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("La fecha va como AAAA-MM-DD.");
  return v;
}

export function IncomeItems({ items, incomes, accounts, month, monthLabel }: {
  items: IncomeItem[]; incomes: Income[]; accounts: { id: number; name: string }[]; month: string; monthLabel: string;
}) {
  const revalidator = useRevalidator();
  const [rows, setRows] = useState(items);
  const [draft, setDraft] = useState(() => emptyDraft(month));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setRows(items), [items]);
  useEffect(() => setDraft(emptyDraft(month)), [month]);

  const incomeNames = [NONE, ...incomes.map((i) => i.name)];
  const accountNames = [NONE, ...accounts.map((a) => a.name)];
  const idOf = (list: { id: number; name: string }[], name: string) => list.find((x) => x.name === name)?.id ?? null;

  async function save(request: () => Promise<unknown>): Promise<boolean> {
    let ok = false;
    try {
      await request();
      setError(null);
      ok = true;
    } catch (e) {
      setError((e as Error).message);
    }
    await revalidator.revalidate();
    return ok;
  }

  function update(row: IncomeItem, body: Record<string, unknown>, local: Partial<IncomeItem>) {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...local } : r)));
    void save(() => send("PATCH", `income-items/${row.id}`, body));
  }

  function edit(row: IncomeItem, field: "date" | "amount" | "notes" | "income" | "account", v: string) {
    try {
      if (field === "date") return update(row, { date: parseDate(v) }, { date: v });
      if (field === "amount") return update(row, { amount: parseAmount(v) }, { amount: v });
      if (field === "notes") return update(row, { notes: v || null }, { notes: v || null });
      if (field === "income") {
        const id = idOf(incomes, v);
        return update(row, { income: id }, { incomeId: id, income: id ? v : null });
      }
      const id = idOf(accounts, v);
      return update(row, { debit_account: id }, { debitAccountId: id, debitAccount: id ? v : null });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function remove(row: IncomeItem) {
    if (!confirm(`¿Borrar el abono de ${money(row.amount, row.currency)} del ${dateLabel(row.date)}?`)) return;
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    void save(() => send("DELETE", `income-items/${row.id}`));
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    let body;
    try {
      const income = incomes.find((i) => String(i.id) === draft.income);
      body = {
        date: parseDate(draft.date),
        amount: parseAmount(draft.amount),
        ...(income && { income: income.id, currency: income.currency }),
        ...(draft.account && { debit_account: Number(draft.account) }),
        ...(draft.notes.trim() && { notes: draft.notes.trim() }),
      };
    } catch (err) {
      return setError((err as Error).message);
    }
    if (await save(() => send("POST", "income-items", body))) setDraft({ ...emptyDraft(month), date: draft.date });
  }

  const total = rows.filter((r) => r.currency === "MXN").reduce((s, r) => s + Number(r.amount), 0);

  return (
    <Card title={`Abonos · ${monthLabel}`}>
      <div className="table-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Fecha</th><th className="num">Monto</th><th>Ingreso</th><th>Cuenta</th><th>Notas</th><th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><EditableCell label="fecha" value={r.date} display={dateLabel(r.date)} onSave={(v) => edit(r, "date", v)} /></td>
                <td className="num">
                  <EditableCell label="monto" type="number" value={String(Number(r.amount))} display={money(r.amount, r.currency)}
                    onSave={(v) => edit(r, "amount", v)} />
                </td>
                <td><EditableCell label="ingreso" value={r.income ?? NONE} options={incomeNames} onSave={(v) => edit(r, "income", v)} /></td>
                <td><EditableCell label="cuenta" value={r.debitAccount ?? NONE} options={accountNames} onSave={(v) => edit(r, "account", v)} /></td>
                <td><EditableCell label="notas" value={r.notes ?? ""} onSave={(v) => edit(r, "notes", v)} /></td>
                <td className="row-actions">
                  <button type="button" className="row-action" aria-label="Borrar abono" onClick={() => remove(r)}>×</button>
                </td>
              </tr>
            ))}
            <tr className="new-row">
              <td>
                <form id="new-income-item" onSubmit={create} />
                <input form="new-income-item" className="cell-input" type="date" aria-label="Fecha del nuevo abono"
                  value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </td>
              <td className="num">
                <input form="new-income-item" className="cell-input num" type="number" step="any" placeholder="+ Monto" aria-label="Monto del nuevo abono"
                  value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              </td>
              <td>
                <select form="new-income-item" className="cell-input" aria-label="Ingreso del nuevo abono"
                  value={draft.income} onChange={(e) => setDraft({ ...draft, income: e.target.value })}>
                  <option value="">{NONE}</option>
                  {incomes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </td>
              <td>
                <select form="new-income-item" className="cell-input" aria-label="Cuenta del nuevo abono"
                  value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value })}>
                  <option value="">{NONE}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </td>
              <td>
                <input form="new-income-item" className="cell-input" placeholder="Notas" aria-label="Notas del nuevo abono"
                  value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </td>
              <td><button form="new-income-item" type="submit" className="row-action visible" aria-label="Agregar abono">↵</button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Total recibido</td>
              <td className="num">{money(total)}</td>
              <td colSpan={4} className="muted small">{rows.length} {rows.length === 1 ? "abono" : "abonos"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Card>
  );
}
