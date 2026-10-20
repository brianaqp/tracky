import { sql } from "drizzle-orm";
import { check, integer, numeric, pgEnum, pgTable, smallint, text } from "drizzle-orm/pg-core";

export const currencyEnum = pgEnum("currency", ["USD", "MXN"])

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

/** Income
 * Let's assume this is montly and help to know how much money does the user has
 */
export const incomes = pgTable("incomes", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text(),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum().notNull().default("MXN")
}, (table) => [
    check("amount_positive", sql`${table.amount} > 0`)
])