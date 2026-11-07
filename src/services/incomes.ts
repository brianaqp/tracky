/**
 * Incomes in two layers: the approximation (`incomes`, expected monthly amount per source/payday) and the real,
 * dated deposits (`income_items`) that fulfil it.
 */
import { and, eq, gte, lt, ne } from "drizzle-orm";
import type { Db } from "../db/connection";
import { debitAccounts, incomeItems, incomes } from "../db/schema";
import type { IncomeIn, IncomeItemIn, IncomeItemPatch, IncomePatch } from "../schemas";
import { addMonths, debitAccountId, incomeId, lower, money, today } from "./common";

/** Income approximations with what has been received for each one in `month` (YYYY-MM, default: this month). */
export async function listIncomes(db: Db, month = today().slice(0, 7)) {
  const [rows, items] = await Promise.all([
    db.select().from(incomes).orderBy(incomes.payday, incomes.name),
    db.select({ incomeId: incomeItems.incomeId, amount: incomeItems.amount }).from(incomeItems).where(monthFilter(month)),
  ]);
  return rows.map((r) => ({
    ...r,
    received: money(items.filter((i) => i.incomeId === r.id).reduce((s, i) => s + Number(i.amount), 0)),
  }));
}

/** Names are unique (case-insensitive): fail with a readable message instead of a constraint error. */
async function assertFreeName(db: Db, name: string, exceptId?: number) {
  const [taken] = await db.select({ id: incomes.id }).from(incomes).where(and(
    eq(lower(incomes.name), name.toLowerCase()),
    exceptId === undefined ? undefined : ne(incomes.id, exceptId),
  ));
  if (taken) throw new Error(`Ya existe un ingreso llamado '${name}'.`);
}

export async function addIncome(db: Db, d: IncomeIn) {
  await assertFreeName(db, d.name);
  const [row] = await db.insert(incomes)
    .values({ name: d.name, amount: money(d.amount), currency: d.currency, payday: d.payday })
    .returning();
  return row!;
}

export async function updateIncome(db: Db, id: number, d: IncomePatch) {
  if (d.name !== undefined) await assertFreeName(db, d.name, id);
  const [row] = await db.update(incomes)
    .set({ ...d, amount: d.amount === undefined ? undefined : money(d.amount) })
    .where(eq(incomes.id, id))
    .returning();
  if (!row) throw new Error(`Ingreso ${id} no encontrado.`);
  return row;
}

/** Deletes an approximation; its deposits stay, as extra (unlinked) income. */
export async function deleteIncome(db: Db, id: number) {
  const [row] = await db.delete(incomes).where(eq(incomes.id, id)).returning({ id: incomes.id });
  if (!row) throw new Error(`Ingreso ${id} no encontrado.`);
  return row;
}

const monthFilter = (month: string) => {
  const start = `${month}-01`;
  return and(gte(incomeItems.date, start), lt(incomeItems.date, addMonths(start, 1)));
};

/** Deposits (abonos), newest first, optionally for one month (YYYY-MM), with the income and account names. */
export function listIncomeItems(db: Db, f: { month?: string } = {}) {
  return db
    .select({
      id: incomeItems.id, date: incomeItems.date, amount: incomeItems.amount, currency: incomeItems.currency,
      notes: incomeItems.notes, incomeId: incomeItems.incomeId, income: incomes.name,
      debitAccountId: incomeItems.debitAccountId, debitAccount: debitAccounts.name,
    })
    .from(incomeItems)
    .leftJoin(incomes, eq(incomeItems.incomeId, incomes.id))
    .leftJoin(debitAccounts, eq(incomeItems.debitAccountId, debitAccounts.id))
    .where(f.month ? monthFilter(f.month) : undefined)
    .orderBy(incomeItems.date, incomeItems.id);
}

export async function addIncomeItem(db: Db, d: IncomeItemIn) {
  const [row] = await db.insert(incomeItems).values({
    date: d.date,
    amount: money(d.amount),
    currency: d.currency,
    incomeId: d.income === undefined ? null : await incomeId(db, d.income),
    debitAccountId: d.debit_account === undefined ? null : await debitAccountId(db, d.debit_account),
    notes: d.notes ?? null,
  }).returning();
  return row!;
}

export async function updateIncomeItem(db: Db, id: number, d: IncomeItemPatch) {
  const ref = async (v: number | string | null | undefined, resolve: (db: Db, r: number | string) => Promise<number>) =>
    v === undefined ? undefined : v === null ? null : resolve(db, v);
  const [row] = await db.update(incomeItems).set({
    date: d.date,
    amount: d.amount === undefined ? undefined : money(d.amount),
    currency: d.currency,
    notes: d.notes,
    incomeId: await ref(d.income, incomeId),
    debitAccountId: await ref(d.debit_account, debitAccountId),
  }).where(eq(incomeItems.id, id)).returning();
  if (!row) throw new Error(`Abono ${id} no encontrado.`);
  return row;
}

export async function deleteIncomeItem(db: Db, id: number) {
  const [row] = await db.delete(incomeItems).where(eq(incomeItems.id, id)).returning({ id: incomeItems.id });
  if (!row) throw new Error(`Abono ${id} no encontrado.`);
  return row;
}
