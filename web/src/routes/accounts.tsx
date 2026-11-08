import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { type Bank, type CardPayment, get, send, type Statement } from "../api";
import { Card, date, EditableCell, Empty, money } from "../ui";
import { daysUntil, inDays } from "./upcoming";

export async function loader() {
  const [banks, statements, payments] = await Promise.all([
    get<Bank[]>("accounts"), get<Statement[]>("statements"), get<CardPayment[]>("card-payments"),
  ]);
  return { banks, statements, payments };
}

export default function Accounts() {
  const { banks, statements, payments } = useLoaderData<typeof loader>();
  return (
    <>
      <h1>Cuentas</h1>
      <NextPayments banks={banks} payments={payments} />
      {!banks.length && <Empty>No hay bancos registrados.</Empty>}
      <div className="grid-3">
        {banks.map((b) => (
          <Card key={b.id} title={b.name}>
            {b.creditCards.map((c) => (
              <div key={c.id} className="account">
                <div className="account-head">
                  <strong>{c.name}</strong>
                  <span className="muted">Crédito{c.last4 ? ` ·••${c.last4}` : ""}</span>
                </div>
                <dl>
                  {c.closingDay && <><dt>Corte</dt><dd>día {c.closingDay}</dd></>}
                  {c.dueDay && <><dt>Pago</dt><dd>día {c.dueDay}</dd></>}
                  {c.creditLimit && <><dt>Límite</dt><dd>{money(c.creditLimit)}</dd></>}
                  {c.latestStatement && (
                    <>
                      <dt>Pago sin intereses</dt><dd>{money(c.latestStatement.paymentNoInterest)}</dd>
                      <dt>Pago mínimo</dt><dd>{money(c.latestStatement.minimumPayment)}</dd>
                      <dt>Fecha límite</dt><dd>{date(c.latestStatement.dueDate)}</dd>
                    </>
                  )}
                </dl>
              </div>
            ))}
            {b.debitAccounts.map((a) => (
              <div key={a.id} className="account">
                <div className="account-head"><strong>{a.name}</strong><span className="muted">Débito</span></div>
              </div>
            ))}
            {b.loans.map((l) => (
              <div key={l.id} className="account">
                <div className="account-head"><strong>{l.name}</strong><span className="muted">Préstamo</span></div>
                <dl>
                  <dt>Monto</dt><dd>{money(l.principal)}</dd>
                  <dt>{l.frequency === "biweekly" ? "Quincena" : "Mensualidad"}</dt><dd>{money(l.payment)} × {l.termPayments}</dd>
                </dl>
              </div>
            ))}
          </Card>
        ))}
      </div>

      <Card title="Estados de cuenta cargados">
        {!statements.length ? <Empty>Aún no se ha importado ninguno.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tarjeta</th><th>Periodo</th><th>Corte</th><th>Fecha límite</th>
                  <th className="num">Saldo anterior</th><th className="num">Pago sin intereses</th><th className="num">Pago mínimo</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((s) => (
                  <tr key={s.id}>
                    <td>{s.creditCard}</td>
                    <td className="nowrap">{date(s.periodStart)} – {date(s.periodEnd)}</td>
                    <td className="nowrap">{date(s.closingDate)}</td>
                    <td className="nowrap">{date(s.dueDate)}</td>
                    <td className="num">{money(s.previousBalance)}</td>
                    <td className="num">{money(s.paymentNoInterest)}</td>
                    <td className="num">{money(s.minimumPayment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/** One row per credit card: the próximo pago set by hand. Its installments "a meses" are subtracted in the cash flow. */
function NextPayments({ banks, payments }: { banks: Bank[]; payments: CardPayment[] }) {
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const cards = banks.flatMap((b) => b.creditCards.map((c) => ({ ...c, bank: b.name })));
  if (!cards.length) return null;

  async function save(cardId: number, body: { amount?: string; due_date?: string }, current?: CardPayment) {
    const amount = Number(body.amount ?? current?.amount);
    if (!(amount > 0)) return setError("El monto debe ser mayor a 0.");
    try {
      await send("POST", "card-payments", { credit_card: cardId, amount, due_date: body.due_date ?? current?.dueDate });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    await revalidator.revalidate();
  }

  async function remove(p: CardPayment) {
    await send("DELETE", `card-payments/${p.id}`).catch((e: Error) => setError(e.message));
    await revalidator.revalidate();
  }

  const total = payments.filter((p) => !p.statement && daysUntil(p.dueDate) >= 0).reduce((s, p) => s + Number(p.amount), 0);
  return (
    <Card title="Próximo pago por tarjeta" actions={<span className="muted small">Lo que sabes que vas a pagar, sin subir estado de cuenta</span>}>
      <div className="table-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Tarjeta</th><th>Fecha de pago</th><th className="num">A pagar</th><th className="num">De meses</th>
              <th className="num">Cuenta en flujo</th><th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => {
              const p = payments.find((x) => x.creditCardId === c.id);
              const past = p && daysUntil(p.dueDate) < 0;
              return (
                <tr key={c.id} className={past || p?.statement ? "inactive" : undefined}>
                  <td>{c.name}<span className="muted small"> · {c.bank}</span></td>
                  <td className="nowrap">
                    {p
                      ? <EditableCell label="fecha de pago" value={p.dueDate} display={`${date(p.dueDate)} · ${inDays(daysUntil(p.dueDate))}`}
                          onSave={(v) => save(c.id, { due_date: v }, p)} />
                      : <span className="muted">{c.dueDay ? `día ${c.dueDay}` : "—"}</span>}
                  </td>
                  <td className="num">
                    <EditableCell label={`próximo pago ${c.name}`} type="number" value={p ? String(Number(p.amount)) : ""}
                      display={p ? money(p.amount) : <span className="muted">+ monto</span>}
                      onSave={(v) => save(c.id, { amount: v }, p)} />
                  </td>
                  <td className="num" title={p?.installments.map((i) => `${i.description} ${i.number}/${i.of}: ${money(i.amount)}`).join("\n")}>
                    {p && Number(p.installmentsTotal) ? `− ${money(p.installmentsTotal)}` : <span className="muted">—</span>}
                  </td>
                  <td className="num">
                    {!p ? <span className="muted">—</span>
                      : p.statement ? <span className="muted small">estado de cuenta: {money(p.statement.amount)}</span>
                      : past ? <span className="muted small">ya pasó</span>
                      : <strong className={p.short ? "neg" : undefined} title={p.short ? "Los meses suman más que el monto: ¿está desactualizado?" : undefined}>{money(p.rest)}</strong>}
                  </td>
                  <td className="row-actions">
                    {p && <button type="button" className="row-action" aria-label={`Borrar próximo pago de ${c.name}`} onClick={() => remove(p)}>×</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td>Total por pagar</td><td /><td className="num">{money(total)}</td><td /><td /><td /></tr>
          </tfoot>
        </table>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="note">
        Incluye las mensualidades a meses de ese ciclo; el flujo las resta porque ya cuentan en «A meses». Sin fecha se usa
        el día de pago de la tarjeta. Si subes el estado de cuenta de ese mes, manda el estado.
      </p>
    </Card>
  );
}
