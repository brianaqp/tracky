/** Read-only reports: spending, installment progress and the monthly forecast. */
import { and, count, desc, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import type { Db } from "../db/connection";
import {
  budgetItems, categories, creditCards, installmentPlans, loans, productCategories, products, ticketItems, tickets,
  transactions,
} from "../db/schema";
import { addMonths, money, today } from "./common";

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
      id: installmentPlans.id, description: installmentPlans.description, creditCard: creditCards.name,
      totalAmount: installmentPlans.totalAmount, months: installmentPlans.months,
      monthlyAmount: installmentPlans.monthlyAmount, interestRate: installmentPlans.interestRate,
      purchaseDate: installmentPlans.purchaseDate, firstPaymentDate: installmentPlans.firstPaymentDate,
      paidCount: sql<number>`(select count(*) from ${transactions} where ${transactions.installmentPlanId} = ${installmentPlans.id})`.mapWith(Number),
      paidAmount: sql<string>`(select coalesce(sum(${transactions.amount}), 0) from ${transactions} where ${transactions.installmentPlanId} = ${installmentPlans.id})`,
    })
    .from(installmentPlans)
    .innerJoin(creditCards, eq(installmentPlans.creditCardId, creditCards.id))
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

/** Expected outflow for `months` months from the current one (or `from`): budget + pending installments + loan payments. */
export async function forecast(db: Db, f: { months?: number; from?: string } = {}) {
  const start = (f.from ?? today()).slice(0, 7);
  const monthKeys = Array.from({ length: f.months ?? 3 }, (_, i) => addMonths(`${start}-01`, i).slice(0, 7));
  const [budget, plans, loanRows] = await Promise.all([
    db.select({ name: budgetItems.name, amount: budgetItems.amount, category: categories.name })
      .from(budgetItems).leftJoin(categories, eq(budgetItems.categoryId, categories.id)).where(eq(budgetItems.active, true)),
    installmentStatus(db),
    db.select().from(loans),
  ]);
  const budgetTotal = budget.reduce((s, b) => s + Number(b.amount), 0);
  return monthKeys.map((month) => {
    const installments = plans.flatMap((p) => p.schedule
      .filter((s) => !s.paid && s.date.startsWith(month))
      .map((s) => ({ description: p.description, creditCard: p.creditCard, number: s.number, of: p.months, amount: s.amount, date: s.date })));
    const loanPayments = loanRows.flatMap((l) => Array.from({ length: l.termMonths }, (_, i) => addMonths(l.startDate, i))
      .filter((d) => d.startsWith(month))
      .map((date) => ({ name: l.name, amount: l.monthlyPayment, date })));
    const installmentsTotal = installments.reduce((s, x) => s + Number(x.amount), 0);
    const loansTotal = loanPayments.reduce((s, x) => s + Number(x.amount), 0);
    return {
      month,
      budget: money(budgetTotal),
      installments,
      installmentsTotal: money(installmentsTotal),
      loans: loanPayments,
      loansTotal: money(loansTotal),
      total: money(budgetTotal + installmentsTotal + loansTotal),
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
