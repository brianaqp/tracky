import { sql } from "drizzle-orm";
import {
    type AnyPgColumn,
    boolean,
    check,
    date,
    index,
    integer,
    numeric,
    pgEnum,
    snakeCase,
    smallint,
    text,
    timestamp,
    unique,
} from "drizzle-orm/pg-core";

// Columns are camelCase in TS and snake_case in Postgres (snakeCase.table).
const money = () => numeric({ precision: 12, scale: 2, mode: "string" });

export const currencyEnum = pgEnum("currency", ["MXN", "USD"]);

/** What a movement is. Only purchase, fee and interest count as spending. */
export const transactionKindEnum = pgEnum("transaction_kind", [
    "purchase",        // a regular charge (also the full amount of a purchase "a meses")
    "installment",     // "01 DE 03 ...": a monthly payment of an installment plan, not new spending
    "payment",         // paying the card
    "refund",
    "cash_withdrawal",
    "fee",
    "interest",
]);

/** Banks and what they hold: credit cards, debit accounts and loans. */
export const banks = snakeCase.table("banks", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull().unique(),
});

export const creditCards = snakeCase.table("credit_cards", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    bankId: integer().notNull().references(() => banks.id, { onDelete: "cascade" }),
    name: text().notNull(),
    last4: text(),
    closingDay: smallint(),
    dueDay: smallint(),
    creditLimit: money(),
    currency: currencyEnum().notNull().default("MXN"),
}, (t) => [
    unique("credit_cards_bank_name").on(t.bankId, t.name),
    check("credit_cards_closing_day_range", sql`${t.closingDay} between 1 and 31`),
    check("credit_cards_due_day_range", sql`${t.dueDay} between 1 and 31`),
]);

export const debitAccounts = snakeCase.table("debit_accounts", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    bankId: integer().notNull().references(() => banks.id, { onDelete: "cascade" }),
    name: text().notNull(),
    last4: text(),
    currency: currencyEnum().notNull().default("MXN"),
}, (t) => [unique("debit_accounts_bank_name").on(t.bankId, t.name)]);

/** How often a loan is paid: monthly, or biweekly ("quincenal": twice a month, ~15 days apart). */
export const paymentFrequencyEnum = pgEnum("payment_frequency", ["monthly", "biweekly"]);

export const loans = snakeCase.table("loans", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    bankId: integer().notNull().references(() => banks.id, { onDelete: "cascade" }),
    name: text().notNull(),
    principal: money().notNull(),
    payment: money().notNull(), // amount of each payment (monthly or biweekly)
    termPayments: smallint().notNull(), // number of payments (120 quincenas, 24 meses...)
    frequency: paymentFrequencyEnum().notNull().default("monthly"),
    startDate: date().notNull(), // first payment
    annualRate: numeric({ precision: 6, scale: 3 }),
    currency: currencyEnum().notNull().default("MXN"),
    notes: text(),
}, (t) => [
    unique("loans_bank_name").on(t.bankId, t.name),
    check("loans_term_positive", sql`${t.termPayments} > 0`),
]);

/** High-level spending categories (Despensa, Servicio, Casa, ...), shared by transactions and the budget. */
export const categories = snakeCase.table("categories", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull().unique(),
});

/** One row per imported credit card statement (PDF). Re-importing the same cut-off date is a no-op. */
export const uploadedStatements = snakeCase.table("uploaded_statements", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    creditCardId: integer().notNull().references(() => creditCards.id, { onDelete: "cascade" }),
    periodStart: date().notNull(),
    periodEnd: date().notNull(),
    closingDate: date().notNull(),
    dueDate: date().notNull(),
    previousBalance: money(),
    paymentNoInterest: money(),
    minimumPayment: money(),
    uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("uploaded_statements_card_closing").on(t.creditCardId, t.closingDate)]);

/** Purchases "a meses": one plan, paid in `months` installments starting at `firstPaymentDate`. */
export const installmentPlans = snakeCase.table("installment_plans", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    creditCardId: integer().notNull().references(() => creditCards.id, { onDelete: "cascade" }),
    purchaseTransactionId: integer().references((): AnyPgColumn => transactions.id, { onDelete: "set null" }),
    categoryId: integer().references(() => categories.id, { onDelete: "set null" }),
    description: text().notNull(),
    totalAmount: money().notNull(),
    months: smallint().notNull(),
    monthlyAmount: money().notNull(),
    interestRate: numeric({ precision: 6, scale: 3 }).notNull().default("0"),
    purchaseDate: date().notNull(),
    firstPaymentDate: date().notNull(),
}, (t) => [
    unique("installment_plans_card_purchase").on(t.creditCardId, t.description, t.purchaseDate),
    check("installment_plans_months_positive", sql`${t.months} > 0`),
]);

/** Every movement of a card, debit account or loan. `amount` is always positive; `kind` gives its meaning. */
export const transactions = snakeCase.table("transactions", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    creditCardId: integer().references(() => creditCards.id, { onDelete: "cascade" }),
    debitAccountId: integer().references(() => debitAccounts.id, { onDelete: "cascade" }),
    loanId: integer().references(() => loans.id, { onDelete: "cascade" }),
    uploadedStatementId: integer().references(() => uploadedStatements.id, { onDelete: "set null" }),
    installmentPlanId: integer().references((): AnyPgColumn => installmentPlans.id, { onDelete: "set null" }),
    installmentNumber: smallint(),
    operationDate: date().notNull(),
    chargeDate: date(),
    description: text().notNull(),
    amount: money().notNull(),
    currency: currencyEnum().notNull().default("MXN"),
    kind: transactionKindEnum().notNull().default("purchase"),
    categoryId: integer().references(() => categories.id, { onDelete: "set null" }),
    notes: text(),
    dedupeKey: text().notNull().unique(),
}, (t) => [
    check("transactions_one_source", sql`num_nonnulls(${t.creditCardId}, ${t.debitAccountId}, ${t.loanId}) = 1`),
    check("transactions_amount_positive", sql`${t.amount} > 0`),
    index("transactions_operation_date").on(t.operationDate),
    index("transactions_category").on(t.categoryId),
]);

/** Budget: recurring monthly expenses planned ahead (the Notion table). */
export const budgetItems = snakeCase.table("budget_items", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull().unique(),
    categoryId: integer().references(() => categories.id, { onDelete: "set null" }),
    amount: money().notNull(),
    currency: currencyEnum().notNull().default("MXN"),
    payday: smallint(), // day of the month it is paid (1, 15, ...)
    creditCardId: integer().references(() => creditCards.id, { onDelete: "set null" }),
    debitAccountId: integer().references(() => debitAccounts.id, { onDelete: "set null" }),
    notes: text(),
    active: boolean().notNull().default(true),
}, (t) => [
    check("budget_items_amount_positive", sql`${t.amount} > 0`),
    check("budget_items_payday_range", sql`${t.payday} between 1 and 31`),
    check("budget_items_one_source", sql`num_nonnulls(${t.creditCardId}, ${t.debitAccountId}) <= 1`),
]);

/**
 * Income approximation: what each source is expected to pay per month (one row per source/payday). The expected
 * monthly total is sum(amount); what really arrived is recorded in `income_items`.
 */
export const incomes = snakeCase.table("incomes", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull().unique(), // "Sueldo", "Freelance"
    amount: money().notNull(), // net
    currency: currencyEnum().notNull().default("MXN"),
    payday: smallint(), // day of the month it is paid (15, 30, ...)
}, (t) => [
    check("incomes_amount_positive", sql`${t.amount} > 0`),
    check("incomes_payday_range", sql`${t.payday} between 1 and 31`),
]);

/** A real, dated deposit (abono) to an account, optionally tied to the income approximation it fulfils. */
export const incomeItems = snakeCase.table("income_items", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    incomeId: integer().references(() => incomes.id, { onDelete: "set null" }), // null: an extra, unplanned deposit
    debitAccountId: integer().references(() => debitAccounts.id, { onDelete: "set null" }),
    date: date().notNull(),
    amount: money().notNull(),
    currency: currencyEnum().notNull().default("MXN"),
    notes: text(),
}, (t) => [
    check("income_items_amount_positive", sql`${t.amount} > 0`),
    index("income_items_date").on(t.date),
]);

/** Próximos gastos: a one-off upcoming event (a trip, Christmas, a car repair) and the expenses it will bring. */
export const upcomingExpenses = snakeCase.table("upcoming_expenses", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull().unique(),
    dueDate: date().notNull(),
    notes: text(),
});

export const upcomingExpenseItems = snakeCase.table("upcoming_expense_items", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    upcomingExpenseId: integer().notNull().references(() => upcomingExpenses.id, { onDelete: "cascade" }),
    name: text().notNull(),
    amount: money().notNull(),
    paid: boolean().notNull().default(false),
}, (t) => [check("upcoming_expense_items_amount_positive", sql`${t.amount} > 0`)]);

/** Tickets: the line items behind a purchase (a supermarket charge -> milk, apples, ...). */
export const productCategories = snakeCase.table("product_categories", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull().unique(),
});

export const products = snakeCase.table("products", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull().unique(),
    notes: text(),
    productCategoryId: integer().references(() => productCategories.id, { onDelete: "set null" }),
});

export const tickets = snakeCase.table("tickets", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    store: text().notNull(),
    purchaseDate: date().notNull(),
    total: money().notNull(),
    transactionId: integer().unique().references(() => transactions.id, { onDelete: "set null" }),
    notes: text(),
});

export const ticketItems = snakeCase.table("ticket_items", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ticketId: integer().notNull().references(() => tickets.id, { onDelete: "cascade" }),
    productId: integer().notNull().references(() => products.id, { onDelete: "restrict" }),
    quantity: numeric({ precision: 10, scale: 3, mode: "number" }).notNull(),
    total: money().notNull(),
}, (t) => [check("ticket_items_quantity_positive", sql`${t.quantity} > 0`)]);
