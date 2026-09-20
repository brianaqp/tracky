import { sql } from "drizzle-orm";
import { check, index, integer, numeric, pgTable, text } from "drizzle-orm/pg-core";

const now = sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS')`;

export const categories = pgTable("categories", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull().unique(),
});

// A product is a package; its name carries the description (e.g. "Coca Cola 355ml x 24 pz").
export const products = pgTable("products", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull().unique(),
  notes: text(),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
});

// `quantity` is the number of packages; `price` is the total paid for them.
export const purchases = pgTable(
  "purchases",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
    price: numeric({ precision: 12, scale: 2 }).notNull(),
    notes: text(),
    purchasedAt: text("purchased_at").notNull().default(now), // ISO 8601, sortable
  },
  (t) => [
    check("ck_purchases_quantity_positive", sql`${t.quantity} > 0`),
    check("ck_purchases_price_nonneg", sql`${t.price} >= 0`),
    index("ix_purchases_product_date").on(t.productId, t.purchasedAt),
  ],
);
