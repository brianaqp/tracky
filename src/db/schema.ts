import { sql } from "drizzle-orm";
import { check, integer, pgTable, smallint, text } from "drizzle-orm/pg-core";

// User
export const categories = pgTable("categories", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text(),
})

export const products = pgTable("products", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text(),
    notes: text(),
    categoryId: integer().references(() => categories.id, { onDelete: "set null" })
})

export const expenses = pgTable("expenses", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text(),
    categoryId: integer().references(() => categories.id, { onDelete: "set null" })
})

/** Banks */
export const banks = pgTable("banks", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text(),
})

export const creditCards = pgTable("creditCards", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    closingDay: smallint().notNull(),
    dueDay: smallint().notNull(),
    bankId: integer().references(() => banks.id, { onDelete: "no action" })
}, (table) => [
    check("closing_day_range", sql`${table.closingDay} between 1 and 31`),
    check("due_day_range", sql`${table.dueDay} between 1 and 31`)
])