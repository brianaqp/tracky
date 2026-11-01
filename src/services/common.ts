import { eq, sql, type AnyColumn } from "drizzle-orm";
import type { Db } from "../db/connection";
import { categories, creditCards, debitAccounts, loans } from "../db/schema";

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

type Named = typeof creditCards | typeof debitAccounts | typeof loans;

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
