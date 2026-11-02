/** Próximos gastos: one-off upcoming events and the expenses each one will bring. */
import { and, eq, ne } from "drizzle-orm";
import type { Db } from "../db/connection";
import { upcomingExpenseItems, upcomingExpenses } from "../db/schema";
import type { UpcomingExpenseIn, UpcomingExpensePatch, UpcomingItemIn, UpcomingItemPatch } from "../schemas";
import { lower, money } from "./common";

/** Every upcoming expense (soonest first) with its items, total and what is still to pay. */
export async function listUpcoming(db: Db) {
  const [events, items] = await Promise.all([
    db.select().from(upcomingExpenses).orderBy(upcomingExpenses.dueDate, upcomingExpenses.name),
    db.select().from(upcomingExpenseItems).orderBy(upcomingExpenseItems.id),
  ]);
  return events.map((e) => {
    const own = items.filter((i) => i.upcomingExpenseId === e.id);
    const total = own.reduce((s, i) => s + Number(i.amount), 0);
    const pending = own.filter((i) => !i.paid).reduce((s, i) => s + Number(i.amount), 0);
    return { ...e, items: own, total: money(total), pending: money(pending) };
  });
}

async function assertFreeName(db: Db, name: string, exceptId?: number) {
  const [taken] = await db.select({ id: upcomingExpenses.id }).from(upcomingExpenses).where(and(
    eq(lower(upcomingExpenses.name), name.toLowerCase()),
    exceptId === undefined ? undefined : ne(upcomingExpenses.id, exceptId),
  ));
  if (taken) throw new Error(`Ya existe un próximo gasto llamado '${name}'.`);
}

/** Creates an upcoming expense, optionally with its items. */
export async function addUpcoming(db: Db, d: UpcomingExpenseIn) {
  await assertFreeName(db, d.name);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(upcomingExpenses)
      .values({ name: d.name, dueDate: d.due_date, notes: d.notes ?? null }).returning();
    for (const item of d.items) {
      await tx.insert(upcomingExpenseItems).values({ upcomingExpenseId: row!.id, name: item.name, amount: money(item.amount), paid: item.paid });
    }
    return row!;
  });
}

export async function updateUpcoming(db: Db, id: number, d: UpcomingExpensePatch) {
  if (d.name !== undefined) await assertFreeName(db, d.name, id);
  const [row] = await db.update(upcomingExpenses)
    .set({ name: d.name, dueDate: d.due_date, notes: d.notes })
    .where(eq(upcomingExpenses.id, id)).returning();
  if (!row) throw new Error(`Próximo gasto ${id} no encontrado.`);
  return row;
}

export async function deleteUpcoming(db: Db, id: number) {
  const [row] = await db.delete(upcomingExpenses).where(eq(upcomingExpenses.id, id)).returning({ id: upcomingExpenses.id });
  if (!row) throw new Error(`Próximo gasto ${id} no encontrado.`);
  return row;
}

export async function addUpcomingItem(db: Db, d: UpcomingItemIn) {
  const [row] = await db.insert(upcomingExpenseItems)
    .values({ upcomingExpenseId: d.upcoming_expense_id, name: d.name, amount: money(d.amount), paid: d.paid })
    .returning();
  return row!;
}

export async function updateUpcomingItem(db: Db, id: number, d: UpcomingItemPatch) {
  const [row] = await db.update(upcomingExpenseItems)
    .set({ name: d.name, paid: d.paid, amount: d.amount === undefined ? undefined : money(d.amount) })
    .where(eq(upcomingExpenseItems.id, id)).returning();
  if (!row) throw new Error(`Gasto ${id} no encontrado.`);
  return row;
}

export async function deleteUpcomingItem(db: Db, id: number) {
  const [row] = await db.delete(upcomingExpenseItems).where(eq(upcomingExpenseItems.id, id)).returning({ id: upcomingExpenseItems.id });
  if (!row) throw new Error(`Gasto ${id} no encontrado.`);
  return row;
}
