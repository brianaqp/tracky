/** Budget: recurring monthly expenses planned ahead. */
import { eq } from "drizzle-orm";
import type { Db } from "../db/connection";
import { budgetItems, categories, creditCards, debitAccounts } from "../db/schema";
import type { BudgetItemIn } from "../schemas";
import { categoryId, creditCardId, debitAccountId, money } from "./common";

/** Creates or replaces a budget item by name. */
export async function upsertBudgetItem(db: Db, d: BudgetItemIn) {
  const values = {
    name: d.name,
    amount: money(d.amount),
    currency: d.currency,
    categoryId: d.category ? await categoryId(db, d.category) : null,
    payday: d.payday ?? null,
    creditCardId: d.credit_card === undefined ? null : await creditCardId(db, d.credit_card),
    debitAccountId: d.debit_account === undefined ? null : await debitAccountId(db, d.debit_account),
    notes: d.notes ?? null,
    active: d.active,
  };
  const [row] = await db.insert(budgetItems).values(values)
    .onConflictDoUpdate({ target: budgetItems.name, set: values })
    .returning();
  return row!;
}

export function listBudget(db: Db) {
  return db
    .select({
      id: budgetItems.id, name: budgetItems.name, category: categories.name, amount: budgetItems.amount,
      currency: budgetItems.currency, payday: budgetItems.payday, creditCard: creditCards.name,
      debitAccount: debitAccounts.name, notes: budgetItems.notes, active: budgetItems.active,
    })
    .from(budgetItems)
    .leftJoin(categories, eq(budgetItems.categoryId, categories.id))
    .leftJoin(creditCards, eq(budgetItems.creditCardId, creditCards.id))
    .leftJoin(debitAccounts, eq(budgetItems.debitAccountId, debitAccounts.id))
    .orderBy(categories.name, budgetItems.name);
}
