import { useLoaderData } from "react-router";
import { type Bank, get, type Statement } from "../api";
import { Card, date, Empty, money } from "../ui";

export async function loader() {
  const [banks, statements] = await Promise.all([get<Bank[]>("accounts"), get<Statement[]>("statements")]);
  return { banks, statements };
}

export default function Accounts() {
  const { banks, statements } = useLoaderData<typeof loader>();
  return (
    <>
      <h1>Cuentas</h1>
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
                  <dt>Mensualidad</dt><dd>{money(l.monthlyPayment)} × {l.termMonths}</dd>
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
