/** Tickets: the products behind a purchase. */
import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/connection";
import { productCategories, products, ticketItems, tickets } from "../db/schema";
import type { TicketIn } from "../schemas";
import { lower, money } from "./common";

async function productCategoryId(db: Db, name: string): Promise<number> {
  const [row] = await db.select({ id: productCategories.id }).from(productCategories)
    .where(eq(lower(productCategories.name), name.toLowerCase()));
  if (row) return row.id;
  const [created] = await db.insert(productCategories).values({ name }).returning({ id: productCategories.id });
  return created!.id;
}

/** Product id by name, created if missing; a given category is (re)assigned. */
async function productId(db: Db, name: string, category?: string): Promise<number> {
  const catId = category ? await productCategoryId(db, category) : undefined;
  const [row] = await db.select({ id: products.id }).from(products).where(eq(lower(products.name), name.toLowerCase()));
  if (row) {
    if (catId) await db.update(products).set({ productCategoryId: catId }).where(eq(products.id, row.id));
    return row.id;
  }
  const [created] = await db.insert(products).values({ name, productCategoryId: catId }).returning({ id: products.id });
  return created!.id;
}

export async function addTicket(db: Db, d: TicketIn) {
  return db.transaction(async (tx) => {
    const total = d.total ?? d.items.reduce((s, i) => s + i.total, 0);
    const [ticket] = await tx.insert(tickets).values({
      store: d.store, purchaseDate: d.purchase_date, total: money(total), transactionId: d.transaction_id, notes: d.notes,
    }).returning({ id: tickets.id });
    for (const item of d.items) {
      await tx.insert(ticketItems).values({
        ticketId: ticket!.id,
        productId: await productId(tx, item.product, item.product_category),
        quantity: item.quantity,
        total: money(item.total),
      });
    }
    return { id: ticket!.id, store: d.store, total: money(total), items: d.items.length };
  });
}

export async function listTickets(db: Db, limit = 50) {
  const rows = await db.select().from(tickets).orderBy(desc(tickets.purchaseDate)).limit(limit);
  if (!rows.length) return [];
  const items = await db
    .select({
      ticketId: ticketItems.ticketId, product: products.name, productCategory: productCategories.name,
      quantity: ticketItems.quantity, total: ticketItems.total,
    })
    .from(ticketItems)
    .innerJoin(products, eq(ticketItems.productId, products.id))
    .leftJoin(productCategories, eq(products.productCategoryId, productCategories.id))
    .where(inArray(ticketItems.ticketId, rows.map((t) => t.id)));
  return rows.map((t) => ({ ...t, items: items.filter((i) => i.ticketId === t.id) }));
}
