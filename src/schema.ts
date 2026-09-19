import { sql } from "drizzle-orm";
import { check, doublePrecision, index, integer, pgTable, text } from "drizzle-orm/pg-core";

const now = sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS')`;

export const categories = pgTable("categories", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull().unique(),
});

export const products = pgTable("products", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull().unique(),
  unit: text().notNull(), // "L", "kg", "pza"
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
});

// Money is stored as integer cents to avoid float drift.
export const purchases = pgTable(
  "purchases",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    quantity: doublePrecision().notNull(),
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

export const consumption = pgTable(
  "consumption",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    quantity: doublePrecision().notNull(),
    user: text().notNull(),
    consumedAt: text("consumed_at").notNull().default(now),
  },
  (t) => [
    check("ck_consumption_quantity_positive", sql`${t.quantity} > 0`),
    index("ix_consumption_product_date").on(t.productId, t.consumedAt),
  ],
);
