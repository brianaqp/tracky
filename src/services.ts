/** Business logic. Plain functions over a Drizzle db; no MCP here. */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "./db";
import { categories, consumption, products, purchases } from "./schema";
import type { ConsumptionIn, PurchaseIn } from "./schemas";

const cents = (n: number) => Math.round(n * 100);
const money = (c: number) => (c / 100).toFixed(2);
const unitPrice = (c: number, qty: number) => (c / 100 / qty).toFixed(4);
const now = () => new Date().toISOString().slice(0, 19);
const round = (n: number, d: number) => Number(n.toFixed(d));
const lower = (col: any) => sql`lower(${col})`;
const like = (col: any, s: string) => sql`${col} ilike ${"%" + s + "%"}`;

async function resolveProduct(db: Db, ref: string | number) {
  const [row] = await db
    .select()
    .from(products)
    .where(typeof ref === "number" ? eq(products.id, ref) : eq(lower(products.name), ref.toLowerCase()));
  if (row) return row;
  const similar =
    typeof ref === "string"
      ? (await db.select({ name: products.name }).from(products).where(like(products.name, ref)).limit(5)).map((r) => r.name)
      : [];
  const hint = similar.length ? ` Similares: ${similar.join(", ")}.` : "";
  throw new Error(`Producto no encontrado: '${ref}'.${hint} Usa add_product primero.`);
}

async function categoryId(db: Db, name: string): Promise<number> {
  const [row] = await db.select({ id: categories.id }).from(categories).where(eq(lower(categories.name), name.toLowerCase()));
  if (row) return row.id;
  const [created] = await db.insert(categories).values({ name }).returning({ id: categories.id });
  return created!.id;
}

export async function addCategory(db: Db, name: string) {
  return { id: await categoryId(db, name), name };
}

export function listCategories(db: Db) {
  return db.select().from(categories).orderBy(categories.name);
}

export async function addProduct(db: Db, name: string, unit: string, category?: string | null) {
  const cid = category ? await categoryId(db, category) : null;
  const [{ id }] = await db.insert(products).values({ name, unit, categoryId: cid }).returning({ id: products.id }) as [{ id: number }];
  return { id, name, unit, category: category ?? null };
}

export function listProducts(db: Db, category?: string | null, search?: string | null) {
  const conds = [
    category ? eq(lower(categories.name), category.toLowerCase()) : undefined,
    search ? like(products.name, search) : undefined,
  ];
  return db
    .select({ id: products.id, name: products.name, unit: products.unit, category: categories.name })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conds))
    .orderBy(products.name);
}

export async function addPurchase(db: Db, d: PurchaseIn, user: string) {
  const when = d.purchased_at ?? now();
  const prod = await resolveProduct(db, d.product);
  const total = cents(d.total_price);
  const [{ id }] = await db
    .insert(purchases)
    .values({ productId: prod.id, quantity: d.quantity, totalCents: total, store: d.store, notes: d.notes, user, purchasedAt: when })
    .returning({ id: purchases.id }) as [{ id: number }];
  return {
    id, product: prod.name, quantity: d.quantity, unit: prod.unit,
    total_price: money(total), unit_price: unitPrice(total, d.quantity), purchased_at: when, user,
  };
}

export async function logConsumption(db: Db, d: ConsumptionIn, user: string) {
  const when = d.consumed_at ?? now();
  const prod = await resolveProduct(db, d.product);
  const [{ id }] = await db
    .insert(consumption)
    .values({ productId: prod.id, quantity: d.quantity, user, consumedAt: when })
    .returning({ id: consumption.id }) as [{ id: number }];
  return { id, product: prod.name, quantity: d.quantity, unit: prod.unit, consumed_at: when };
}

export async function priceHistory(db: Db, product: string | number, limit: number) {
  const prod = await resolveProduct(db, product);
  const rows = await db
    .select()
    .from(purchases)
    .where(eq(purchases.productId, prod.id))
    .orderBy(desc(purchases.purchasedAt))
    .limit(limit);
  return rows.map((r) => ({
      purchased_at: r.purchasedAt, store: r.store, quantity: r.quantity,
      total_price: money(r.totalCents), unit_price: unitPrice(r.totalCents, r.quantity),
    }));
}

export async function spendingSummary(
  db: Db, start: string | undefined, end: string | undefined,
  groupBy: "category" | "product" | "month", category?: string | null,
) {
  const key =
    groupBy === "month" ? sql<string>`substr(${purchases.purchasedAt}, 1, 7)`
    : groupBy === "product" ? sql<string>`${products.name}`
    : sql<string>`coalesce(${categories.name}, '(sin categoría)')`;
  const total = sql<number>`sum(${purchases.totalCents})`.mapWith(Number);
  const rows = await db
    .select({ grp: key, total, n: sql<number>`count(*)`.mapWith(Number) })
    .from(purchases)
    .innerJoin(products, eq(purchases.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(
      start ? gte(purchases.purchasedAt, start) : undefined,
      end ? lt(purchases.purchasedAt, end) : undefined,
      category ? eq(lower(categories.name), category.toLowerCase()) : undefined,
    ))
    .groupBy(sql`1`)
    .orderBy(desc(total));
  return rows.map((r) => ({ group: String(r.grp), total_spent: money(r.total), purchases: r.n }));
}

export async function stockEstimate(db: Db, product: string | number, windowDays: number) {
  const prod = await resolveProduct(db, product);
  const sum = (col: any) => sql<number>`coalesce(sum(${col}), 0)`.mapWith(Number);
  const bought = await db.select({ v: sum(purchases.quantity) }).from(purchases).where(eq(purchases.productId, prod.id)).then((r) => r[0]!.v);
  const used = await db.select({ v: sum(consumption.quantity) }).from(consumption).where(eq(consumption.productId, prod.id)).then((r) => r[0]!.v);
  const since = new Date(Date.now() - windowDays * 864e5).toISOString().slice(0, 19);
  const recent = await db.select({ v: sum(consumption.quantity) }).from(consumption)
    .where(and(eq(consumption.productId, prod.id), gte(consumption.consumedAt, since))).then((r) => r[0]!.v);

  const inStock = bought - used;
  const avg = recent ? recent / windowDays : null;
  return {
    product: prod.name, unit: prod.unit, purchased: bought, consumed: used,
    in_stock: round(inStock, 3),
    avg_daily_consumption: avg ? round(avg, 3) : null,
    days_left: avg && inStock > 0 ? round(inStock / avg, 1) : null,
  };
}
