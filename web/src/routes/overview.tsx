/** Resumen: where the money goes in the coming months — cash flow, what is left, debt and the next payments. */
import { Link, useLoaderData } from "react-router";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  type BudgetItem, type ForecastMonth, get, type Group, type Income, type Installment, type Loan, type Upcoming,
} from "../api";
import { Bars, Card, date, Empty, money, month, Stat } from "../ui";
import { daysUntil, inDays } from "./upcoming";

export async function loader() {
  const [forecast, loans, installments, upcoming, budget, incomes, spending] = await Promise.all([
    get<ForecastMonth[]>("forecast", { months: "12" }),
    get<Loan[]>("loans"),
    get<Installment[]>("installments"),
    get<Upcoming[]>("upcoming"),
    get<BudgetItem[]>("budget"),
    get<Income[]>("incomes"),
    get<Group[]>("spending-summary"),
  ]);
  return { forecast, loans, installments, upcoming, budget, incomes, spending };
}

/** Outflow series, stacked in this fixed order (categorical slots 1–5). */
const SERIES = [
  { key: "budget", label: "Presupuesto", color: "var(--series-1)" },
  { key: "cardsTotal", label: "Tarjetas (ya gastado)", color: "var(--series-2)" },
  { key: "loansTotal", label: "Préstamos", color: "var(--series-3)" },
  { key: "installmentsTotal", label: "A meses", color: "var(--series-4)" },
  { key: "upcomingTotal", label: "Próximos gastos", color: "var(--series-5)" },
] as const;

const n = (v: string | number) => Number(v);
const short = (ym: string) => new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" })
  .format(new Date(`${ym}-01T00:00:00Z`)).replace(".", "") + (ym.endsWith("-01") ? ` ${ym.slice(2, 4)}` : "");
const compact = (v: number) => new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => <span className={v < 0 ? "neg" : undefined}>{money(v)}</span>;

export default function Overview() {
  const { forecast, loans, installments, upcoming, budget, incomes, spending } = useLoaderData<typeof loader>();
  const [now, next] = forecast;
  const income = n(now?.income ?? 0);

  const loanDebt = loans.reduce((s, l) => s + n(l.remainingAmount), 0);
  const msiDebt = installments.reduce((s, p) => s + n(p.remainingAmount), 0);
  const cardDebt = forecast.flatMap((m) => m.cards).filter((c) => daysUntil(c.date) >= 0).reduce((s, c) => s + n(c.amount), 0);
  const debtLoad = next && income ? (n(next.loansTotal) + n(next.installmentsTotal)) / income : 0;
  const year = forecast.at(-1);
  const firstNegative = forecast.find((m) => n(m.cumulative) < 0);
  const typical = forecast.slice(1, 7);
  const typicalNet = typical.length ? typical.reduce((s, m) => s + n(m.net), 0) / typical.length : 0;

  return (
    <>
      <h1>Resumen</h1>
      {!incomes.length && <p className="note">Registra tus <Link to="/ingresos">ingresos</Link> para ver cuánto te queda cada mes.</p>}
      <div className="stats">
        <Stat
          label={`Te queda en ${now ? month(now.month) : "este mes"}`}
          value={now ? signed(n(now.net)) : "—"}
          hint={now ? `${money(now.income)} de ingreso − ${money(now.total)} de salidas` : undefined}
        />
        <Stat
          label="Libre en un mes típico"
          value={signed(typicalNet)}
          hint={`Promedio de los siguientes ${typical.length} meses · ${income ? pct(typicalNet / income) : "—"} del ingreso`}
        />
        <Stat
          label="Acumulado a 12 meses"
          value={year ? signed(n(year.cumulative)) : "—"}
          hint={year ? `Si todo sale según el plan, a ${month(year.month)}` : undefined}
        />
        <Stat
          label="Carga de deuda"
          value={pct(debtLoad)}
          hint={`Préstamos + meses vs. ingreso · ${debtLoad > 0.35 ? "arriba" : "debajo"} del 35% recomendado`}
        />
        <Stat
          label="Deuda por pagar"
          value={money(loanDebt + msiDebt + cardDebt)}
          hint={`Préstamos ${compact(loanDebt)} · meses ${compact(msiDebt)} · tarjetas ${compact(cardDebt)}`}
        />
      </div>

      <Card title="Flujo de efectivo · próximos 12 meses" actions={<span className="muted small">Ingreso vs. salidas por mes</span>}>
        <CashFlowChart months={forecast} />
        <p className="note">
          «Tarjetas» es el consumo del ciclo que corta ese mes (se paga a inicios del siguiente): el pago para no generar intereses del
          estado de cuenta o, sin él, el <Link to="/cuentas">próximo pago</Link> que pusiste a mano sin sus mensualidades (ya están en «A meses»).
          {firstNegative
            ? <> El acumulado queda en negativo en <strong>{month(firstNegative.month)}</strong>: revisa ese mes.</>
            : " El acumulado se mantiene positivo todo el año."}
        </p>
      </Card>

      <div className="grid-2">
        <Card title="Próximos 30 días">
          <Timeline forecast={forecast} budget={budget} incomes={incomes} />
        </Card>
        <Card title="Dinero acumulado" actions={<span className="muted small">Suma de lo que queda cada mes</span>}>
          <CumulativeChart months={forecast} />
        </Card>
      </div>

      <Card title="Proyección mensual">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mes</th><th className="num">Ingreso</th>
                {SERIES.map((s) => <th key={s.key} className="num"><span className="swatch" style={{ background: s.color }} /> {s.label}</th>)}
                <th className="num">Salidas</th><th className="num">Queda</th><th className="num">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map((m) => (
                <tr key={m.month}>
                  <td className="nowrap">{month(m.month)}</td>
                  <td className="num">{money(m.income)}</td>
                  {SERIES.map((s) => <td key={s.key} className="num">{n(m[s.key]) ? money(m[s.key]) : <span className="muted">—</span>}</td>)}
                  <td className="num">{money(m.total)}</td>
                  <td className="num strong">{signed(n(m.net))}</td>
                  <td className="num">{signed(n(m.cumulative))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Deudas" actions={<Link to="/cuentas">Ver cuentas</Link>}>
          <Debts loans={loans} installments={installments} income={income} />
        </Card>
        <div className="stack">
          <Card title="Próximos gastos" actions={<Link to="/proximos">Administrar</Link>}>
            {!upcoming.length ? <Empty>Sin eventos. Agrega viajes, regalos o reparaciones que se acercan.</Empty> : (
              <ul className="list">
                {upcoming.map((u) => (
                  <li key={u.id}>
                    <span>{u.name}<span className="muted small"> · {date(u.dueDate)} · {inDays(daysUntil(u.dueDate))}</span></span>
                    <span className="num">{money(u.pending)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Gasto real por categoría" actions={<Link to="/movimientos">Ver movimientos</Link>}>
            <Bars rows={spending.map((g) => ({ label: g.group, value: n(g.total), hint: `${g.group}: ${money(g.total)} · ${g.movements} mov.` }))} />
            <p className="note">Compras, comisiones e intereses menos devoluciones. Las mensualidades no cuentan: la compra completa ya está sumada.</p>
          </Card>
        </div>
      </div>
    </>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: ForecastMonth }[]; label?: string }) {
  const m = payload?.[0]?.payload;
  if (!active || !m) return null;
  return (
    <div className="chart-tip">
      <strong>{month(label ?? m.month)}</strong>
      <div className="tip-row"><span>Ingreso</span><span>{money(m.income)}</span></div>
      {SERIES.map((s) => n(m[s.key]) > 0 && (
        <div key={s.key} className="tip-row"><span><span className="swatch" style={{ background: s.color }} /> {s.label}</span><span>{money(m[s.key])}</span></div>
      ))}
      <div className="tip-row strong"><span>Queda</span><span>{signed(n(m.net))}</span></div>
    </div>
  );
}

const axis = { stroke: "var(--text-muted)", fontSize: 12, tickLine: false, axisLine: false } as const;

function CashFlowChart({ months }: { months: ForecastMonth[] }) {
  const data = months.map((m) => ({ ...m, ...Object.fromEntries(SERIES.map((s) => [s.key, n(m[s.key])])), income: n(m.income) }));
  return (
    <>
      <div className="legend">
        <span><span className="legend-line" /> Ingreso</span>
        {SERIES.map((s) => <span key={s.key}><span className="swatch" style={{ background: s.color }} /> {s.label}</span>)}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="month" tickFormatter={short} {...axis} />
          <YAxis tickFormatter={compact} width={48} {...axis} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--grid)", opacity: 0.6 }} />
          {SERIES.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="out" fill={s.color} stroke="var(--surface-1)" strokeWidth={1}
              radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
          ))}
          <Line dataKey="income" name="Ingreso" type="linear" stroke="var(--text-primary)" strokeWidth={2} strokeDasharray="5 4"
            dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

function CumulativeChart({ months }: { months: ForecastMonth[] }) {
  const data = months.map((m) => ({ month: m.month, cumulative: n(m.cumulative), net: n(m.net) }));
  const last = data.at(-1);
  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="month" tickFormatter={short} {...axis} />
          <YAxis tickFormatter={compact} width={48} {...axis} />
          <Tooltip
            formatter={(v, name) => [money(Number(v)), name === "cumulative" ? "Acumulado" : "Queda en el mes"]}
            labelFormatter={(l) => month(String(l))}
            contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8 }}
            itemStyle={{ color: "var(--text-primary)" }}
          />
          <Bar dataKey="net" fill="var(--series-1)" fillOpacity={0.25} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line dataKey="cumulative" type="monotone" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--surface-1)" }}
            isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><span className="swatch" style={{ background: "var(--series-1)" }} /> Acumulado {last && <strong>{money(last.cumulative)}</strong>}</span>
        <span><span className="swatch faint" /> Queda en el mes</span>
      </div>
    </>
  );
}

type Event = { date: string; label: string; detail: string; amount: number; kind: "in" | "out" };

/** Dated money movements of the next 30 days: income paydays, card due dates, loan and installment payments, budget items with a payday, upcoming events. */
function Timeline({ forecast, budget, incomes }: { forecast: ForecastMonth[]; budget: BudgetItem[]; incomes: Income[] }) {
  const months = forecast.slice(0, 2).map((m) => m.month);
  const onDay = (ym: string, day: number) => {
    const last = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
    return `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`;
  };
  const events: Event[] = [
    ...forecast.flatMap((m) => [
      ...m.cards.map((c) => ({
        date: c.date, label: `Pago ${c.creditCard}`, kind: "out" as const, amount: n(c.amount),
        detail: c.source === "manual"
          ? `Tarjeta · próximo pago ${money(c.declared)}${n(c.installmentsTotal) ? ` − ${money(c.installmentsTotal)} de meses` : ""}`
          : "Tarjeta · pago sin intereses",
      })),
      ...m.loans.map((l) => ({ date: l.date, label: l.name, detail: `Préstamo · ${l.number}/${l.of}`, amount: n(l.amount), kind: "out" as const })),
      ...m.installments.map((i) => ({ date: i.date, label: i.description, detail: `${i.creditCard} · ${i.number}/${i.of} (corte)`, amount: n(i.amount), kind: "out" as const })),
      ...m.upcoming.map((u) => ({ date: u.date, label: u.name, detail: "Próximo gasto", amount: n(u.amount), kind: "out" as const })),
    ]),
    ...months.flatMap((ym) => [
      ...incomes.filter((i) => i.payday).map((i) => ({ date: onDay(ym, i.payday!), label: i.name, detail: "Ingreso", amount: n(i.amount), kind: "in" as const })),
      ...budget.filter((b) => b.active && b.payday).map((b) => ({
        date: onDay(ym, b.payday!), label: b.name, detail: `Presupuesto${b.creditCard ? ` · ${b.creditCard}` : ""}`, amount: n(b.amount), kind: "out" as const,
      })),
    ]),
  ]
    .filter((e) => { const d = daysUntil(e.date); return d >= 0 && d <= 30; })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "in" ? -1 : 1));

  if (!events.length) return <Empty>Nada programado en los próximos 30 días.</Empty>;
  const out = events.filter((e) => e.kind === "out").reduce((s, e) => s + e.amount, 0);
  const inc = events.filter((e) => e.kind === "in").reduce((s, e) => s + e.amount, 0);
  return (
    <>
      <ul className="timeline">
        {events.map((e, i) => (
          <li key={i} className={e.kind}>
            <span className="tl-date">{date(e.date).slice(0, 6)}<span className="muted small">{inDays(daysUntil(e.date))}</span></span>
            <span className="tl-label">{e.label}<span className="muted small">{e.detail}</span></span>
            <span className="num">{e.kind === "in" ? "+" : "−"}{money(e.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="note">Entra {money(inc)} · sale {money(out)} con fecha. El presupuesto sin día de pago no aparece aquí.</p>
    </>
  );
}

function Debts({ loans, installments, income }: { loans: Loan[]; installments: Installment[]; income: number }) {
  const plans = installments.filter((p) => p.remainingPayments > 0);
  if (!loans.length && !plans.length) return <Empty>Sin préstamos ni compras a meses.</Empty>;
  return (
    <div className="debts">
      {loans.map((l) => (
        <div key={l.id} className="account">
          <div className="account-head">
            <strong>{l.name}</strong>
            <span className="muted">{l.bank} · {l.frequency === "biweekly" ? "quincenal" : "mensual"}</span>
          </div>
          <div className="progress" title={`${l.paidCount} de ${l.termPayments} pagos`}>
            <span className="series-3" style={{ width: `${(l.paidCount / l.termPayments) * 100}%` }} />
          </div>
          <dl>
            <dt>Pago</dt><dd>{money(l.payment)} × {l.termPayments} · {l.paidCount} hechos</dd>
            <dt>Al mes</dt><dd>{money(l.monthlyEquivalent)}{income ? <span className="muted"> · {pct(n(l.monthlyEquivalent) / income)} del ingreso</span> : null}</dd>
            <dt>Por pagar</dt><dd><strong>{money(l.remainingAmount)}</strong> <span className="muted">de {money(l.totalAmount)} (prestado {money(l.principal)})</span></dd>
            <dt>Siguiente</dt><dd>{l.nextPayment ? `${date(l.nextPayment)} · ${inDays(daysUntil(l.nextPayment))}` : "—"}</dd>
            <dt>Termina</dt><dd>{date(l.endDate)}</dd>
          </dl>
        </div>
      ))}
      {plans.length > 0 && (
        <div className="account">
          <div className="account-head"><strong>Compras a meses</strong><Link to="/meses">Ver</Link></div>
          <ul className="list">
            {plans.map((p) => (
              <li key={p.id}>
                <span>{p.description}<span className="muted small"> · {p.bank === p.creditCard ? p.creditCard : `${p.bank} ${p.creditCard}`}{p.category ? ` · ${p.category}` : ""} · {p.paidCount}/{p.months}</span></span>
                <span className="num">{money(p.remainingAmount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
