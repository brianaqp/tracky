/** Tickets: the products behind a purchase and where the money went, by product category. */
import { asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/connection";
import { creditCards, debitAccounts, productCategories, products, ticketItems, tickets } from "../db/schema";
import type { ProductCategoryPatch, TicketIn, TicketPaymentIn } from "../schemas";
import { creditCardId, debitAccountId, lower, money } from "./common";

async function findCategory(db: Db, name: string) {
  const [row] = await db.select().from(productCategories).where(eq(lower(productCategories.name), name.toLowerCase()));
  return row;
}

/** Category by name; a name that does not exist yet is created as tentative. */
async function productCategoryId(db: Db, name: string): Promise<{ id: number; tentative: boolean }> {
  const row = await findCategory(db, name);
  if (row) return row;
  const [created] = await db.insert(productCategories).values({ name, tentative: true })
    .returning({ id: productCategories.id, tentative: productCategories.tentative });
  return created!;
}

/** Product by name, created if missing; a given category is (re)assigned. Returns its effective category. */
async function product(db: Db, name: string, category?: string) {
  const cat = category ? await productCategoryId(db, category) : undefined;
  const [row] = await db.select({ id: products.id, productCategoryId: products.productCategoryId })
    .from(products).where(eq(lower(products.name), name.toLowerCase()));
  if (row) {
    if (cat) await db.update(products).set({ productCategoryId: cat.id }).where(eq(products.id, row.id));
    return { id: row.id, categoryId: cat?.id ?? row.productCategoryId };
  }
  const [created] = await db.insert(products).values({ name, productCategoryId: cat?.id }).returning({ id: products.id });
  return { id: created!.id, categoryId: cat?.id ?? null };
}

async function payment(db: Db, d: Pick<TicketIn, "account"> & { payment_method?: TicketIn["payment_method"] | null }) {
  const card = d.payment_method === "credit_card" || d.payment_method === "debit_account";
  if (card !== (d.account !== undefined)) throw new Error("account is required for card payments and not allowed otherwise");
  return {
    paymentMethod: d.payment_method ?? null,
    creditCardId: d.payment_method === "credit_card" ? await creditCardId(db, d.account!) : null,
    debitAccountId: d.payment_method === "debit_account" ? await debitAccountId(db, d.account!) : null,
  };
}

export async function addTicket(db: Db, d: TicketIn) {
  return db.transaction(async (tx) => {
    const total = d.total ?? d.items.reduce((s, i) => s + i.total, 0);
    const [ticket] = await tx.insert(tickets).values({
      store: d.store, purchaseDate: d.purchase_date, total: money(total), ...(await payment(tx, d)),
      transactionId: d.transaction_id, notes: d.notes,
    }).returning({ id: tickets.id });
    const categoryIds: (number | null)[] = [];
    for (const item of d.items) {
      const p = await product(tx, item.product, item.product_category);
      categoryIds.push(p.categoryId);
      await tx.insert(ticketItems).values({
        ticketId: ticket!.id, productId: p.id, quantity: item.quantity, total: money(item.total),
      });
    }
    const [detail] = await ticketDetails(tx, [ticket!.id]);
    const uncategorized = d.items.filter((_, i) => categoryIds[i] === null).map((i) => i.product);
    return { ...detail!, uncategorized };
  });
}

/** Sets how a ticket was paid once it is known (null: still to be defined). */
export async function setTicketPayment(db: Db, d: TicketPaymentIn) {
  const updated = await db.update(tickets).set(await payment(db, d)).where(eq(tickets.id, d.ticket_id)).returning({ id: tickets.id });
  if (!updated.length) throw new Error(`Ticket not found: ${d.ticket_id}.`);
  const [detail] = await ticketDetails(db, [d.ticket_id]);
  return detail!;
}

type Line = { product: string; productCategory: string | null; tentative: boolean; quantity: number; total: string };

/** Where a ticket's money went: total per product category, largest first. */
function breakdown(items: Line[]) {
  const groups = new Map<string, { category: string | null; tentative: boolean; total: number; items: number }>();
  for (const i of items) {
    const key = i.productCategory ?? "";
    const g = groups.get(key) ?? { category: i.productCategory, tentative: i.tentative, total: 0, items: 0 };
    g.total += Number(i.total);
    g.items += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total).map((g) => ({ ...g, total: money(g.total) }));
}

async function ticketDetails(db: Db, ids: number[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: tickets.id, store: tickets.store, purchaseDate: tickets.purchaseDate, total: tickets.total,
      paymentMethod: tickets.paymentMethod, creditCardId: tickets.creditCardId, debitAccountId: tickets.debitAccountId,
      account: creditCards.name, debitAccount: debitAccounts.name,
      transactionId: tickets.transactionId, notes: tickets.notes,
    })
    .from(tickets)
    .leftJoin(creditCards, eq(tickets.creditCardId, creditCards.id))
    .leftJoin(debitAccounts, eq(tickets.debitAccountId, debitAccounts.id))
    .where(inArray(tickets.id, ids))
    .orderBy(desc(tickets.purchaseDate), desc(tickets.id));
  const items = await db
    .select({
      ticketId: ticketItems.ticketId, product: products.name, productCategory: productCategories.name,
      tentative: productCategories.tentative, quantity: ticketItems.quantity, total: ticketItems.total,
    })
    .from(ticketItems)
    .innerJoin(products, eq(ticketItems.productId, products.id))
    .leftJoin(productCategories, eq(products.productCategoryId, productCategories.id))
    .where(inArray(ticketItems.ticketId, ids))
    .orderBy(asc(ticketItems.id));
  return rows.map(({ account, debitAccount, ...t }) => {
    const lines = items.filter((i) => i.ticketId === t.id).map(({ ticketId: _, tentative, ...i }) => ({ ...i, tentative: !!tentative }));
    return { ...t, account: account ?? debitAccount, items: lines, byCategory: breakdown(lines) };
  });
}

export async function listTickets(db: Db, limit = 50) {
  const ids = await db.select({ id: tickets.id }).from(tickets).orderBy(desc(tickets.purchaseDate), desc(tickets.id)).limit(limit);
  return ticketDetails(db, ids.map((r) => r.id));
}

/** Product categories with how many products use each; tentative ones first. */
export async function listProductCategories(db: Db) {
  return db
    .select({ id: productCategories.id, name: productCategories.name, tentative: productCategories.tentative, products: count(products.id) })
    .from(productCategories)
    .leftJoin(products, eq(products.productCategoryId, productCategories.id))
    .groupBy(productCategories.id)
    .orderBy(desc(productCategories.tentative), productCategories.name);
}

/** Confirms a product category (it stops being tentative), optionally renaming it, or merges it into another. */
export async function updateProductCategory(db: Db, d: ProductCategoryPatch) {
  return db.transaction(async (tx) => {
    const cat = await findCategory(tx, d.name);
    if (!cat) {
      const names = (await tx.select({ name: productCategories.name }).from(productCategories)).map((r) => r.name);
      throw new Error(`Product category not found: '${d.name}'. Existing: ${names.join(", ") || "none"}.`);
    }
    if (d.merge_into) {
      const target = await findCategory(tx, d.merge_into);
      if (!target) throw new Error(`Product category not found: '${d.merge_into}'.`);
      if (target.id === cat.id) throw new Error("A category cannot be merged into itself.");
      const moved = await tx.update(products).set({ productCategoryId: target.id })
        .where(eq(products.productCategoryId, cat.id)).returning({ id: products.id });
      await tx.delete(productCategories).where(eq(productCategories.id, cat.id));
      return { merged: cat.name, into: target.name, products: moved.length };
    }
    if (d.rename_to && d.rename_to.toLowerCase() !== cat.name.toLowerCase()) {
      const clash = await findCategory(tx, d.rename_to);
      if (clash) throw new Error(`Product category '${clash.name}' already exists; use merge_into.`);
    }
    const [row] = await tx.update(productCategories).set({ name: d.rename_to ?? cat.name, tentative: false })
      .where(eq(productCategories.id, cat.id)).returning();
    return row!;
  });
}
