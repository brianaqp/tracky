/** Incomes: expected monthly income, one row per source/payday. */
import { and, eq, ne } from "drizzle-orm";
import type { Db } from "../db/connection";
import { incomes } from "../db/schema";
import type { IncomeIn, IncomePatch } from "../schemas";
import { lower, money } from "./common";

export function listIncomes(db: Db) {
  return db.select().from(incomes).orderBy(incomes.payday, incomes.name);
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

export async function deleteIncome(db: Db, id: number) {
  const [row] = await db.delete(incomes).where(eq(incomes.id, id)).returning({ id: incomes.id });
  if (!row) throw new Error(`Ingreso ${id} no encontrado.`);
  return row;
}
