/** Read-only reports: spending, installment progress and the monthly forecast. */
import { and, count, desc, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import type { Db } from "../db/connection";
import {
  banks, budgetItems, categories, creditCards, incomeItems, incomes, installmentPlans, loans, productCategories, products, ticketItems,
  tickets, transactions, uploadedStatements,
} from "../db/schema";
import { addMonths, money, paymentDates, today } from "./common";
import { listUpcoming } from "./upcoming";

/** Kinds that are real spending. Installments are excluded: the full purchase was already counted. */
const SPENDING = ["purchase", "fee", "interest", "refund"] as const;
const signed = sql<string>`sum(case when ${transactions.kind} = 'refund' then -${transactions.amount} else ${transactions.amount} end)`;

export async function spendingSummary(db: Db, f: { start?: string; end?: string; group_by?: "category" | "month" }) {
  const key = f.group_by === "month"
    ? sql<string>`to_char(${transactions.operationDate}, 'YYYY-MM')`
    : sql<string>`coalesce(${categories.name}, '(sin categoría)')`;
  const rows = await db
    .select({ group: key, total: signed, movements: count() })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      inArray(transactions.kind, [...SPENDING]),
      f.start ? gte(transactions.operationDate, f.start) : undefined,
      f.end ? lt(transactions.operationDate, f.end) : undefined,
    ))
    .groupBy(sql`1`)
    .orderBy(f.group_by === "month" ? sql`1` : desc(signed));
  return rows.map((r) => ({ group: r.group, total: money(Number(r.total)), movements: Number(r.movements) }));
}

/** Ticket spending per product category (what a "Despensa" is made of). */
export async function productSpending(db: Db, f: { start?: string; end?: string }) {
  const rows = await db
    .select({ group: sql<string>`coalesce(${productCategories.name}, '(sin categoría)')`, total: sum(ticketItems.total), items: count() })
    .from(ticketItems)
    .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
    .innerJoin(products, eq(ticketItems.productId, products.id))
    .leftJoin(productCategories, eq(products.productCategoryId, productCategories.id))
    .where(and(
      f.start ? gte(tickets.purchaseDate, f.start) : undefined,
      f.end ? lt(tickets.purchaseDate, f.end) : undefined,
    ))
    .groupBy(sql`1`)
    .orderBy(desc(sum(ticketItems.total)));
  return rows.map((r) => ({ group: r.group, total: money(Number(r.total)), items: Number(r.items) }));
}

/** Each installment plan with what is paid, what remains and its payment schedule. */
export async function installmentStatus(db: Db) {
  const plans = await db
    .select({
      id: installmentPlans.id, description: installmentPlans.description, creditCard: creditCards.name, bank: banks.name,
      category: categories.name,
      totalAmount: installmentPlans.totalAmount, months: installmentPlans.months,
      monthlyAmount: installmentPlans.monthlyAmount, interestRate: installmentPlans.interestRate,
      purchaseDate: installmentPlans.purchaseDate, firstPaymentDate: installmentPlans.firstPaymentDate,
      paidCount: sql<number>`(select count(*) from ${transactions} where ${transactions.installmentPlanId} = ${installmentPlans.id})`.mapWith(Number),
      paidAmount: sql<string>`(select coalesce(sum(${transactions.amount}), 0) from ${transactions} where ${transactions.installmentPlanId} = ${installmentPlans.id})`,
    })
    .from(installmentPlans)
    .innerJoin(creditCards, eq(installmentPlans.creditCardId, creditCards.id))
    .innerJoin(banks, eq(creditCards.bankId, banks.id))
    .leftJoin(categories, eq(installmentPlans.categoryId, categories.id))
    .orderBy(installmentPlans.purchaseDate);
  return plans.map((p) => {
    const total = Number(p.totalAmount);
    const monthly = Number(p.monthlyAmount);
    const schedule = Array.from({ length: p.months }, (_, i) => ({
      number: i + 1,
      date: addMonths(p.firstPaymentDate, i),
      // the last payment absorbs rounding: 9,000.01 in 3 -> 3,000 + 3,000 + 3,000.01
      amount: money(i === p.months - 1 ? total - monthly * (p.months - 1) : monthly),
      paid: i < p.paidCount,
    }));
    return {
      ...p,
      paidAmount: money(Number(p.paidAmount)),
      remainingAmount: money(schedule.filter((s) => !s.paid).reduce((s, x) => s + Number(x.amount), 0)),
      remainingPayments: p.months - p.paidCount,
      schedule,
    };
  });
}

/** Each loan with its payment schedule; payments dated before `asOf` (default today) count as paid (domiciliados). */
export async function loanStatus(db: Db, asOf = today()) {
  const rows = await db
    .select({
      id: loans.id, bank: banks.name, name: loans.name, principal: loans.principal, payment: loans.payment,
      termPayments: loans.termPayments, frequency: loans.frequency, startDate: loans.startDate,
      annualRate: loans.annualRate, currency: loans.currency, notes: loans.notes,
    })
    .from(loans)
    .innerJoin(banks, eq(loans.bankId, banks.id))
    .orderBy(loans.startDate);
  return rows.map((l) => {
    const dates = paymentDates(l.startDate, l.termPayments, l.frequency);
    const paidCount = dates.filter((d) => d < asOf).length;
    const payment = Number(l.payment);
    return {
      ...l,
      monthlyEquivalent: money(l.frequency === "biweekly" ? payment * 2 : payment),
      totalAmount: money(payment * l.termPayments),
      paidCount,
      remainingPayments: l.termPayments - paidCount,
      remainingAmount: money(payment * (l.termPayments - paidCount)),
      nextPayment: dates[paidCount] ?? null,
      endDate: dates.at(-1)!,
      dates,
    };
  });
}

/**
 * Cash flow per month for `months` months from the current one (or `from`): income minus what goes out. Income is
 * the approximation, except in the first month: the deposits received plus what each approximation still has to pay
 * (approximation − its deposits, never below 0). Outgoings:
 * budget, pending installments "a meses", loan payments, card statements due that month (spending already done)
 * and the pending items of upcoming expenses (overdue ones land in the first month). `cumulative` adds up `net`.
 */
export async function forecast(db: Db, f: { months?: number; from?: string } = {}) {
  const ref = f.from ?? today();
  const start = ref.slice(0, 7);
  const monthKeys = Array.from({ length: f.months ?? 3 }, (_, i) => addMonths(`${start}-01`, i).slice(0, 7));
  const [budget, plans, loanRows, incomeRows, received, statements, upcoming] = await Promise.all([
    db.select({ amount: budgetItems.amount }).from(budgetItems).where(eq(budgetItems.active, true)),
    installmentStatus(db),
    loanStatus(db, ref),
    db.select({ id: incomes.id, amount: incomes.amount }).from(incomes),
    db.select({ incomeId: incomeItems.incomeId, amount: incomeItems.amount, date: incomeItems.date }).from(incomeItems)
      .where(and(gte(incomeItems.date, `${start}-01`), lt(incomeItems.date, addMonths(`${start}-01`, 1)))),
    db.select({
      creditCard: creditCards.name, dueDate: uploadedStatements.dueDate, amount: uploadedStatements.paymentNoInterest,
    }).from(uploadedStatements).innerJoin(creditCards, eq(uploadedStatements.creditCardId, creditCards.id)),
    listUpcoming(db),
  ]);
  const sumOf = (xs: { amount: string | null }[]) => xs.reduce((s, x) => s + Number(x.amount ?? 0), 0);
  const budgetTotal = sumOf(budget);
  const expected = sumOf(incomeRows);
  let cumulative = 0;
  return monthKeys.map((month, idx) => {
    const installments = plans.flatMap((p) => p.schedule
      .filter((s) => !s.paid && s.date.startsWith(month))
      .map((s) => ({ description: p.description, creditCard: p.creditCard, category: p.category, number: s.number, of: p.months, amount: s.amount, date: s.date })));
    const loanPayments = loanRows.flatMap((l) => l.dates
      .map((date, i) => ({ name: l.name, amount: l.payment, date, number: i + 1, of: l.termPayments }))
      .filter((p) => p.date.startsWith(month)));
    const cards = statements
      .filter((s) => s.dueDate.startsWith(month) && Number(s.amount ?? 0) > 0)
      .map((s) => ({ creditCard: s.creditCard, amount: s.amount!, date: s.dueDate }));
    const upcomingHere = upcoming
      .filter((u) => Number(u.pending) > 0 && (u.dueDate.startsWith(month) || (idx === 0 && u.dueDate.slice(0, 7) < month)))
      .map((u) => ({ id: u.id, name: u.name, amount: u.pending, date: u.dueDate }));
    const installmentsTotal = sumOf(installments);
    const loansTotal = sumOf(loanPayments);
    const cardsTotal = sumOf(cards);
    const upcomingTotal = sumOf(upcomingHere);
    const receivedHere = received.filter((r) => r.date.startsWith(month));
    const incomeReceived = sumOf(receivedHere);
    const stillDue = incomeRows.reduce((s, i) =>
      s + Math.max(0, Number(i.amount) - sumOf(receivedHere.filter((r) => r.incomeId === i.id))), 0);
    const income = idx === 0 ? incomeReceived + stillDue : expected;
    const total = budgetTotal + installmentsTotal + loansTotal + cardsTotal + upcomingTotal;
    cumulative += income - total;
    return {
      month,
      income: money(income),
      incomeExpected: money(expected),
      incomeReceived: money(incomeReceived),
      budget: money(budgetTotal),
      installments,
      installmentsTotal: money(installmentsTotal),
      loans: loanPayments,
      loansTotal: money(loansTotal),
      cards,
      cardsTotal: money(cardsTotal),
      upcoming: upcomingHere,
      upcomingTotal: money(upcomingTotal),
      total: money(total),
      net: money(income - total),
      cumulative: money(cumulative),
    };
  });
}

/** Budget vs. actual spending per category for one month (YYYY-MM). */
export async function budgetVsActual(db: Db, month: string) {
  const start = `${month}-01`;
  const [budget, actual] = await Promise.all([
    db.select({ category: sql<string>`coalesce(${categories.name}, '(sin categoría)')`, total: sum(budgetItems.amount) })
      .from(budgetItems).leftJoin(categories, eq(budgetItems.categoryId, categories.id))
      .where(eq(budgetItems.active, true)).groupBy(sql`1`),
    spendingSummary(db, { start, end: addMonths(start, 1) }),
  ]);
  const names = [...new Set([...budget.map((b) => b.category), ...actual.map((a) => a.group)])];
  return names
    .map((category) => {
      const planned = Number(budget.find((b) => b.category === category)?.total ?? 0);
      const spent = Number(actual.find((a) => a.group === category)?.total ?? 0);
      return { category, budget: money(planned), actual: money(spent), difference: money(planned - spent) };
    })
    .sort((a, b) => Number(b.actual) + Number(b.budget) - Number(a.actual) - Number(a.budget));
}
