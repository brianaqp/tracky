/** Business logic. Plain functions over a Drizzle db; no MCP here. */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "./db";
import { categories, products, purchases } from "./schema";
import type { PurchaseIn } from "./schemas";

const unitPrice = (price: string, qty: number) => (Number(price) / qty).toFixed(2);
const now = () => new Date().toISOString().slice(0, 19);
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

export async function addProduct(db: Db, name: string, category?: string | null) {
  const cid = category ? await categoryId(db, category) : null;
  const [{ id }] = await db.insert(products).values({ name, categoryId: cid }).returning({ id: products.id }) as [{ id: number }];
  return { id, name, category: category ?? null };
}

export function listProducts(db: Db, category?: string | null, search?: string | null) {
  const conds = [
    category ? eq(lower(categories.name), category.toLowerCase()) : undefined,
    search ? like(products.name, search) : undefined,
  ];
  return db
    .select({ id: products.id, name: products.name, category: categories.name })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conds))
    .orderBy(products.name);
}

export async function addPurchase(db: Db, d: PurchaseIn) {
  const when = d.purchased_at ?? now();
  const prod = await resolveProduct(db, d.product);
  const price = d.total_price.toFixed(2);
  const [{ id }] = await db
    .insert(purchases)
    .values({ productId: prod.id, quantity: d.quantity, price, notes: d.notes, purchasedAt: when })
    .returning({ id: purchases.id }) as [{ id: number }];
  return {
    id, product: prod.name, quantity: d.quantity,
    total_price: price, unit_price: unitPrice(price, d.quantity), purchased_at: when,
  };
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
      purchased_at: r.purchasedAt, quantity: r.quantity,
      total_price: r.price, unit_price: unitPrice(r.price, r.quantity),
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
  const total = sql<string>`sum(${purchases.price})`;
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
  return rows.map((r) => ({ group: String(r.grp), total_spent: r.total, purchases: r.n }));
}
