/** Statement imports, movements and their categories. */
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db/connection";
import { categories, creditCards, debitAccounts, installmentPlans, loans, transactions, uploadedStatements } from "../db/schema";
import type { InstallmentPlanIn, InstallmentPlanPatch, StatementIn, TransactionIn } from "../schemas";
import { categoryId, creditCardId, debitAccountId, lower, loanId, money } from "./common";

type Source = { creditCardId?: number; debitAccountId?: number; loanId?: number };

const sourceKey = (s: Source) =>
  s.creditCardId ? `cc:${s.creditCardId}` : s.debitAccountId ? `da:${s.debitAccountId}` : `ln:${s.loanId}`;

/** Stable key so re-importing a statement skips rows already stored; `n` tells apart identical rows. */
const dedupeKey = (s: Source, t: TransactionIn, n: number) =>
  [sourceKey(s), t.operation_date, t.charge_date ?? "", t.description, money(t.amount), n].join("|");

async function insertTransactions(db: Db, source: Source, rows: TransactionIn[], uploadedStatementId?: number) {
  const seen = new Map<string, number>();
  const ids: number[] = [];
  let inserted = 0;
  for (const t of rows) {
    const base = dedupeKey(source, t, 0);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const key = dedupeKey(source, t, n);
    const [row] = await db.insert(transactions).values({
      ...source,
      uploadedStatementId,
      operationDate: t.operation_date,
      chargeDate: t.charge_date,
      description: t.description,
      amount: money(t.amount),
      kind: t.kind,
      categoryId: t.category ? await categoryId(db, t.category) : null,
      notes: t.notes,
      dedupeKey: key,
    }).onConflictDoNothing().returning({ id: transactions.id });
    if (row) {
      inserted++;
      ids.push(row.id);
    } else {
      const [existing] = await db.select({ id: transactions.id, uploadedStatementId: transactions.uploadedStatementId })
        .from(transactions).where(eq(transactions.dedupeKey, key));
      // A movement first recorded by hand (e.g. from a CSV export) gets attached to the statement that later lists it.
      if (uploadedStatementId && existing!.uploadedStatementId === null) {
        await db.update(transactions).set({ uploadedStatementId }).where(eq(transactions.id, existing!.id));
      }
      ids.push(existing!.id);
    }
  }
  return { ids, inserted, skipped: rows.length - inserted };
}

/** Upserts an installment plan and links its purchase and monthly payments (by index into `ids`). */
async function upsertPlan(db: Db, cardId: number, p: InstallmentPlanIn, ids: number[]) {
  const at = (i: number) => {
    const id = ids[i];
    if (id === undefined) throw new Error(`Installment plan '${p.description}': no transaction at index ${i}.`);
    return id;
  };
  // Category: the one given, else the purchase movement's (kept as is on re-import when neither is known).
  const purchaseId = p.purchase_index === undefined ? undefined : at(p.purchase_index);
  const [purchase] = purchaseId === undefined ? []
    : await db.select({ categoryId: transactions.categoryId }).from(transactions).where(eq(transactions.id, purchaseId));
  const catId = p.category ? await categoryId(db, p.category) : purchase?.categoryId ?? undefined;
  const values = {
    creditCardId: cardId, description: p.description, ...(catId === undefined ? {} : { categoryId: catId }), totalAmount: money(p.total_amount), months: p.months,
    monthlyAmount: money(p.monthly_amount), interestRate: p.interest_rate.toString(),
    purchaseDate: p.purchase_date, firstPaymentDate: p.first_payment_date,
    ...(p.purchase_index === undefined ? {} : { purchaseTransactionId: at(p.purchase_index) }),
  };
  const [plan] = await db.insert(installmentPlans).values(values)
    .onConflictDoUpdate({
      target: [installmentPlans.creditCardId, installmentPlans.description, installmentPlans.purchaseDate],
      set: values,
    })
    .returning({ id: installmentPlans.id });
  for (const pay of p.payments) {
    await db.update(transactions)
      .set({ installmentPlanId: plan!.id, installmentNumber: pay.number, kind: "installment" })
      .where(eq(transactions.id, at(pay.index)));
  }
  return { id: plan!.id, description: p.description };
}

/** Edits an installment plan; with a category, the purchase movement gets it too. */
export async function updateInstallmentPlan(db: Db, id: number, d: InstallmentPlanPatch) {
  const catId = d.category === undefined ? undefined : d.category === null ? null : await categoryId(db, d.category);
  const [plan] = await db.update(installmentPlans).set({
    description: d.description,
    categoryId: catId,
    creditCardId: d.credit_card === undefined ? undefined : await creditCardId(db, d.credit_card),
  }).where(eq(installmentPlans.id, id)).returning();
  if (!plan) throw new Error(`Compra a meses ${id} no encontrada.`);
  if (catId && plan.purchaseTransactionId) {
    await db.update(transactions).set({ categoryId: catId }).where(eq(transactions.id, plan.purchaseTransactionId));
  }
  return plan;
}

/** Stores a credit card statement, its movements and its installment plans. Idempotent. */
export async function importStatement(db: Db, d: StatementIn) {
  return db.transaction(async (tx) => {
    const cardId = await creditCardId(tx, d.credit_card);
    const header = {
      creditCardId: cardId, periodStart: d.period_start, periodEnd: d.period_end, closingDate: d.closing_date,
      dueDate: d.due_date,
      previousBalance: d.previous_balance === undefined ? undefined : money(d.previous_balance),
      paymentNoInterest: d.payment_no_interest === undefined ? undefined : money(d.payment_no_interest),
      minimumPayment: d.minimum_payment === undefined ? undefined : money(d.minimum_payment),
    };
    const [statement] = await tx.insert(uploadedStatements).values(header)
      .onConflictDoUpdate({ target: [uploadedStatements.creditCardId, uploadedStatements.closingDate], set: header })
      .returning({ id: uploadedStatements.id });
    const { ids, inserted, skipped } = await insertTransactions(tx, { creditCardId: cardId }, d.transactions, statement!.id);
    const plans = [];
    for (const p of d.installment_plans) plans.push(await upsertPlan(tx, cardId, p, ids));
    return { uploadedStatementId: statement!.id, inserted, skipped, transactionIds: ids, installmentPlans: plans };
  });
}

/** A single manual movement for a card, debit account or loan. */
export async function addTransaction(
  db: Db, source: { credit_card?: number | string; debit_account?: number | string; loan?: number | string }, t: TransactionIn,
) {
  const given = [source.credit_card, source.debit_account, source.loan].filter((x) => x !== undefined);
  if (given.length !== 1) throw new Error("Give exactly one of credit_card, debit_account or loan.");
  const s: Source =
    source.credit_card !== undefined ? { creditCardId: await creditCardId(db, source.credit_card) }
    : source.debit_account !== undefined ? { debitAccountId: await debitAccountId(db, source.debit_account) }
    : { loanId: await loanId(db, source.loan!) };
  const { ids, inserted } = await insertTransactions(db, s, [t]);
  return { id: ids[0], inserted: inserted === 1 };
}

export type TransactionFilter = {
  start?: string; end?: string; category?: string; uncategorized?: boolean; kind?: string; limit?: number;
};

export function listTransactions(db: Db, f: TransactionFilter = {}) {
  const source = sql<string>`coalesce(${creditCards.name}, ${debitAccounts.name}, ${loans.name})`;
  return db
    .select({
      id: transactions.id, operationDate: transactions.operationDate, chargeDate: transactions.chargeDate,
      description: transactions.description, amount: transactions.amount, currency: transactions.currency,
      kind: transactions.kind, category: categories.name, source, notes: transactions.notes,
      installmentPlanId: transactions.installmentPlanId, installmentNumber: transactions.installmentNumber,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(creditCards, eq(transactions.creditCardId, creditCards.id))
    .leftJoin(debitAccounts, eq(transactions.debitAccountId, debitAccounts.id))
    .leftJoin(loans, eq(transactions.loanId, loans.id))
    .where(and(
      f.start ? gte(transactions.operationDate, f.start) : undefined,
      f.end ? lt(transactions.operationDate, f.end) : undefined,
      f.category ? eq(lower(categories.name), f.category.toLowerCase()) : undefined,
      f.uncategorized ? isNull(transactions.categoryId) : undefined,
      f.kind ? eq(transactions.kind, f.kind as TransactionIn["kind"]) : undefined,
    ))
    .orderBy(desc(transactions.operationDate), desc(transactions.id))
    .limit(f.limit ?? 500);
}

/** Sets the category of many movements at once (categories are created if missing). */
export async function categorizeTransactions(db: Db, items: { id: number; category: string }[]) {
  const byCategory = new Map<string, number[]>();
  for (const { id, category } of items) byCategory.set(category, [...(byCategory.get(category) ?? []), id]);
  let updated = 0;
  for (const [name, ids] of byCategory) {
    const rows = await db.update(transactions).set({ categoryId: await categoryId(db, name) })
      .where(inArray(transactions.id, ids)).returning({ id: transactions.id });
    updated += rows.length;
  }
  return { updated };
}
