/** Banks and their credit cards, debit accounts and loans. */
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/connection";
import { banks, cardPayments, creditCards, debitAccounts, loans, uploadedStatements } from "../db/schema";
import type { CardPaymentIn, LoanIn } from "../schemas";
import { addMonths, creditCardId, lower, money, today } from "./common";

type Currency = "MXN" | "USD";

export async function bankId(db: Db, name: string): Promise<number> {
  const [row] = await db.select({ id: banks.id }).from(banks).where(eq(lower(banks.name), name.toLowerCase()));
  if (row) return row.id;
  const [created] = await db.insert(banks).values({ name }).returning({ id: banks.id });
  return created!.id;
}

export async function addCreditCard(db: Db, d: {
  bank: string; name: string; last4?: string; closing_day?: number; due_day?: number;
  credit_limit?: number; currency?: Currency;
}) {
  const values = {
    bankId: await bankId(db, d.bank), name: d.name, last4: d.last4, closingDay: d.closing_day,
    dueDay: d.due_day, creditLimit: d.credit_limit === undefined ? undefined : money(d.credit_limit), currency: d.currency,
  };
  const [row] = await db.insert(creditCards).values(values)
    .onConflictDoUpdate({ target: [creditCards.bankId, creditCards.name], set: values })
    .returning();
  return row!;
}

export async function addDebitAccount(db: Db, d: { bank: string; name: string; last4?: string; currency?: Currency }) {
  const values = { bankId: await bankId(db, d.bank), name: d.name, last4: d.last4, currency: d.currency };
  const [row] = await db.insert(debitAccounts).values(values)
    .onConflictDoUpdate({ target: [debitAccounts.bankId, debitAccounts.name], set: values })
    .returning();
  return row!;
}

export async function addLoan(db: Db, d: LoanIn) {
  const values = {
    bankId: await bankId(db, d.bank), name: d.name, principal: money(d.principal), payment: money(d.payment),
    termPayments: d.term_payments, frequency: d.frequency, startDate: d.start_date,
    annualRate: d.annual_rate?.toString() ?? null, currency: d.currency, notes: d.notes ?? null,
  };
  const [row] = await db.insert(loans).values(values)
    .onConflictDoUpdate({ target: [loans.bankId, loans.name], set: values })
    .returning();
  return row!;
}

/** Every bank with its credit cards (and latest statement), debit accounts and loans. */
export async function listAccounts(db: Db) {
  const [bankRows, cards, debits, loanRows, statements] = await Promise.all([
    db.select().from(banks).orderBy(banks.name),
    db.select().from(creditCards).orderBy(creditCards.name),
    db.select().from(debitAccounts).orderBy(debitAccounts.name),
    db.select().from(loans).orderBy(loans.name),
    db.select().from(uploadedStatements).orderBy(sql`${uploadedStatements.closingDate} desc`),
  ]);
  return bankRows.map((b) => ({
    ...b,
    creditCards: cards.filter((c) => c.bankId === b.id).map((c) => ({
      ...c, latestStatement: statements.find((s) => s.creditCardId === c.id) ?? null,
    })),
    debitAccounts: debits.filter((a) => a.bankId === b.id),
    loans: loanRows.filter((l) => l.bankId === b.id),
  }));
}

export function listStatements(db: Db) {
  return db
    .select({
      id: uploadedStatements.id, creditCard: creditCards.name, periodStart: uploadedStatements.periodStart,
      periodEnd: uploadedStatements.periodEnd, closingDate: uploadedStatements.closingDate,
      dueDate: uploadedStatements.dueDate, previousBalance: uploadedStatements.previousBalance,
      paymentNoInterest: uploadedStatements.paymentNoInterest, minimumPayment: uploadedStatements.minimumPayment,
      uploadedAt: uploadedStatements.uploadedAt,
    })
    .from(uploadedStatements)
    .innerJoin(creditCards, eq(uploadedStatements.creditCardId, creditCards.id))
    .orderBy(sql`${uploadedStatements.closingDate} desc`);
}

/** The next date with `day` (clamped to the month's length) on or after `from`. */
function nextDay(from: string, day: number): string {
  const onMonth = (iso: string) => {
    const [y, m] = iso.split("-").map(Number) as [number, number];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${iso.slice(0, 8)}${String(Math.min(day, last)).padStart(2, "0")}`;
  };
  const here = onMonth(from);
  return here >= from ? here : onMonth(addMonths(`${from.slice(0, 8)}01`, 1));
}

/** Sets the próximo pago of a card (one per card: replaces the previous one). Without due_date, uses the card's due_day. */
export async function setCardPayment(db: Db, d: CardPaymentIn) {
  const cardId = await creditCardId(db, d.credit_card);
  let dueDate = d.due_date;
  if (!dueDate) {
    const [card] = await db.select({ dueDay: creditCards.dueDay, name: creditCards.name }).from(creditCards).where(eq(creditCards.id, cardId));
    if (!card?.dueDay) throw new Error(`La tarjeta '${card?.name}' no tiene día de pago: indica due_date.`);
    dueDate = nextDay(today(), card.dueDay);
  }
  const values = { creditCardId: cardId, dueDate, amount: money(d.amount), notes: d.notes ?? null, updatedAt: new Date() };
  const [row] = await db.insert(cardPayments).values(values)
    .onConflictDoUpdate({ target: cardPayments.creditCardId, set: values })
    .returning();
  return row!;
}

export async function deleteCardPayment(db: Db, id: number) {
  const [row] = await db.delete(cardPayments).where(eq(cardPayments.id, id)).returning({ id: cardPayments.id });
  if (!row) throw new Error(`Próximo pago ${id} no encontrado.`);
  return row;
}
