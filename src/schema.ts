import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%S', 'now'))`;

export const categories = sqliteTable("categories", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
});

export const products = sqliteTable("products", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  unit: text().notNull(), // "L", "kg", "pza"
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
});

// Money is stored as integer cents to avoid float drift.
export const purchases = sqliteTable(
  "purchases",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    quantity: real().notNull(),
    totalCents: integer("total_cents").notNull(),
    store: text(),
    notes: text(),
    user: text().notNull(),
    purchasedAt: text("purchased_at").notNull().default(now), // ISO 8601, sortable
  },
  (t) => [
    check("ck_purchases_quantity_positive", sql`${t.quantity} > 0`),
    check("ck_purchases_total_nonneg", sql`${t.totalCents} >= 0`),
    index("ix_purchases_product_date").on(t.productId, t.purchasedAt),
  ],
);

export const consumption = sqliteTable(
  "consumption",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    quantity: real().notNull(),
    user: text().notNull(),
    consumedAt: text("consumed_at").notNull().default(now),
  },
  (t) => [
    check("ck_consumption_quantity_positive", sql`${t.quantity} > 0`),
    index("ix_consumption_product_date").on(t.productId, t.consumedAt),
  ],
);
