import { eq, sql, type AnyColumn } from "drizzle-orm";
import type { Db } from "../db/connection";
import { categories, creditCards, debitAccounts, incomes, loans } from "../db/schema";

export const lower = (col: AnyColumn) => sql`lower(${col})`;
export const money = (n: number) => n.toFixed(2);

/** Category id by name (case-insensitive), created if missing. */
export async function categoryId(db: Db, name: string): Promise<number> {
  const [row] = await db.select({ id: categories.id }).from(categories).where(eq(lower(categories.name), name.toLowerCase()));
  if (row) return row.id;
  const [created] = await db.insert(categories).values({ name }).returning({ id: categories.id });
  return created!.id;
}

export function listCategories(db: Db) {
  return db.select().from(categories).orderBy(categories.name);
}

type Named = typeof creditCards | typeof debitAccounts | typeof loans | typeof incomes;

async function resolve(db: Db, table: Named, label: string, ref: number | string): Promise<number> {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(typeof ref === "number" ? eq(table.id, ref) : eq(lower(table.name), ref.toLowerCase()));
  if (row) return row.id;
  const names = (await db.select({ name: table.name }).from(table)).map((r) => r.name);
  throw new Error(`${label} not found: '${ref}'. Existing: ${names.join(", ") || "none"}.`);
}

export const creditCardId = (db: Db, ref: number | string) => resolve(db, creditCards, "Credit card", ref);
export const debitAccountId = (db: Db, ref: number | string) => resolve(db, debitAccounts, "Debit account", ref);
export const loanId = (db: Db, ref: number | string) => resolve(db, loans, "Loan", ref);
export const incomeId = (db: Db, ref: number | string) => resolve(db, incomes, "Income", ref);

/** Adds `n` months to an ISO date, clamping the day to the month's length. */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD in the server's local time zone (set TZ, e.g. America/Mexico_City). */
export const today = () => new Date().toLocaleDateString("en-CA");

/** The same month as `iso` with the day set to `day`, clamped to the month's length. */
function withDay(iso: string, day: number): string {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 8)}${String(Math.min(day, last)).padStart(2, "0")}`;
}

/**
 * Payment dates of a loan. Monthly: same day every month. Biweekly ("quincenal"): two payments a month, the start day
 * and 15 days apart (1 → 1 and 16; 15 → 15 and 30, clamped to month end; 20 → 20 and the 5th of the next month).
 */
export function paymentDates(start: string, count: number, frequency: "monthly" | "biweekly"): string[] {
  if (frequency === "monthly") return Array.from({ length: count }, (_, i) => addMonths(start, i));
  const day = Number(start.slice(8, 10));
  return Array.from({ length: count }, (_, i) => {
    const k = Math.floor(i / 2);
    if (i % 2 === 0) return addMonths(start, k);
    return day <= 15 ? withDay(addMonths(start, k), day + 15) : withDay(addMonths(withDay(start, 1), k + 1), day - 15);
  });
}
