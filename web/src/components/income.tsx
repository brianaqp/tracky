/** Ingresos: a live, Notion-style table. Each row is one income; edits save per cell, the total recalculates. */
import { type FormEvent, useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { type Income as IncomeRow, send } from "../api";
import { Card, EditableCell, money } from "../ui";

const CURRENCIES = ["MXN", "USD"] as const;
const EMPTY = { name: "", amount: "", currency: "MXN", payday: "" };

/** "" -> null; otherwise a whole day 1..31. */
function parsePayday(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 31) throw new Error("El día de pago va de 1 a 31.");
  return n;
}
function parseAmount(v: string): number {
  const n = Number(v);
  if (!v || !(n > 0)) throw new Error("El monto debe ser mayor a 0.");
  return n;
}

export function Income({ incomes }: { incomes: IncomeRow[] }) {
  const revalidator = useRevalidator();
  const [rows, setRows] = useState(incomes);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setRows(incomes), [incomes]);

  /** Applies the change locally right away, then persists; on failure the loader data puts the row back. */
  async function save(optimistic: (rs: IncomeRow[]) => IncomeRow[], request: () => Promise<unknown>): Promise<boolean> {
    let ok = false;
    try {
      const req = request();
      setRows(optimistic);
      await req;
      setError(null);
      ok = true;
    } catch (e) {
      setError((e as Error).message);
    }
    await revalidator.revalidate();
    return ok;
  }

  function update(row: IncomeRow, patch: Partial<Record<"name" | "amount" | "currency" | "payday", string>>) {
    let body: Record<string, unknown>;
    try {
      body = {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.amount !== undefined && { amount: parseAmount(patch.amount) }),
        ...(patch.currency !== undefined && { currency: patch.currency }),
        ...(patch.payday !== undefined && { payday: parsePayday(patch.payday) }),
      };
    } catch (e) {
      return setError((e as Error).message);
    }
    const local = { ...body, ...(body.amount !== undefined && { amount: String(body.amount) }) } as Partial<IncomeRow>;
    void save((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...local } : r)), () => send("PATCH", `incomes/${row.id}`, body));
  }

  function remove(row: IncomeRow) {
    if (!confirm(`¿Borrar el ingreso "${row.name}"?`)) return;
    void save((rs) => rs.filter((r) => r.id !== row.id), () => send("DELETE", `incomes/${row.id}`));
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    let body;
    try {
      if (!draft.name.trim()) throw new Error("Escribe un nombre.");
      body = { name: draft.name.trim(), amount: parseAmount(draft.amount), currency: draft.currency, payday: parsePayday(draft.payday) };
    } catch (err) {
      return setError((err as Error).message);
    }
    if (await save((rs) => rs, () => send("POST", "incomes", body))) setDraft(EMPTY);
  }

  const totals = CURRENCIES.map((c) => ({
    currency: c,
    total: rows.filter((r) => r.currency === c).reduce((s, r) => s + Number(r.amount), 0),
    count: rows.filter((r) => r.currency === c).length,
  })).filter((t) => t.count > 0 || t.currency === "MXN");

  return (
    <Card title="Ingresos">
      <div className="table-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Nombre</th><th className="num">Monto</th><th>Moneda</th><th className="num">Día de pago</th><th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><EditableCell label="nombre" value={r.name} onSave={(v) => update(r, { name: v })} /></td>
                <td className="num">
                  <EditableCell label="monto" type="number" value={String(Number(r.amount))} display={money(r.amount, r.currency)}
                    onSave={(v) => update(r, { amount: v })} />
                </td>
                <td><EditableCell label="moneda" value={r.currency} options={CURRENCIES} onSave={(v) => update(r, { currency: v })} /></td>
                <td className="num">
                  <EditableCell label="día de pago" type="number" value={r.payday == null ? "" : String(r.payday)}
                    onSave={(v) => update(r, { payday: v })} />
                </td>
                <td className="row-actions">
                  <button type="button" className="row-action" aria-label={`Borrar ${r.name}`} onClick={() => remove(r)}>×</button>
                </td>
              </tr>
            ))}
            <tr className="new-row">
              <td>
                <form id="new-income" onSubmit={create} />
                <input form="new-income" className="cell-input" placeholder="+ Nuevo ingreso" aria-label="Nombre del nuevo ingreso"
                  value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </td>
              <td className="num">
                <input form="new-income" className="cell-input num" type="number" step="any" placeholder="Monto" aria-label="Monto del nuevo ingreso"
                  value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              </td>
              <td>
                <select form="new-income" className="cell-input" aria-label="Moneda del nuevo ingreso"
                  value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </td>
              <td className="num">
                <input form="new-income" className="cell-input num" type="number" placeholder="Día" aria-label="Día de pago del nuevo ingreso"
                  value={draft.payday} onChange={(e) => setDraft({ ...draft, payday: e.target.value })} />
              </td>
              <td><button form="new-income" type="submit" className="row-action visible" aria-label="Agregar ingreso">↵</button></td>
            </tr>
          </tbody>
          <tfoot>
            {totals.map((t) => (
              <tr key={t.currency}>
                <td>Total mensual{totals.length > 1 ? ` (${t.currency})` : ""}</td>
                <td className="num">{money(t.total, t.currency)}</td>
                <td colSpan={3} className="muted small">{t.count} {t.count === 1 ? "ingreso" : "ingresos"}</td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Card>
  );
}
