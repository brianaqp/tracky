/** Zod input schemas shared by MCP tools. Field names are snake_case, as the model sends them. */
import { z } from "zod";

export const Name = z.string().trim().min(1).max(120);
export const IsoDate = z.iso.date();
export const Money = z
  .number()
  .positive()
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "max 2 decimals");
export const Currency = z.enum(["MXN", "USD"]);
export const Day = z.number().int().min(1).max(31);
/** A credit card, debit account or loan: its id or its exact name. */
export const Ref = z.union([z.number().int(), Name]);

export const TransactionKind = z.enum([
  "purchase", "installment", "payment", "refund", "cash_withdrawal", "fee", "interest",
]);

export const TransactionIn = z.object({
  operation_date: IsoDate,
  charge_date: IsoDate.optional(),
  description: Name,
  amount: Money.describe("Always positive; `kind` says if it is a charge or a payment"),
  kind: TransactionKind.default("purchase"),
  category: Name.optional().describe("High-level category, e.g. Despensa. Created if missing"),
  notes: z.string().optional(),
});
export type TransactionIn = z.infer<typeof TransactionIn>;

export const InstallmentPlanIn = z.object({
  description: Name,
  total_amount: Money,
  months: z.number().int().positive(),
  monthly_amount: Money,
  interest_rate: z.number().min(0).default(0),
  purchase_date: IsoDate,
  first_payment_date: IsoDate.describe("Cut-off date of the statement with payment 1"),
  purchase_index: z.number().int().min(0).optional().describe("Index in `transactions` of the full purchase charge"),
  payments: z
    .array(z.object({ index: z.number().int().min(0), number: z.number().int().positive() }))
    .default([])
    .describe("Monthly payments in this statement: index in `transactions` and payment number (\"01 DE 03\" -> 1)"),
});
export type InstallmentPlanIn = z.infer<typeof InstallmentPlanIn>;

export const StatementIn = z.object({
  credit_card: Ref,
  period_start: IsoDate,
  period_end: IsoDate,
  closing_date: IsoDate,
  due_date: IsoDate,
  previous_balance: z.number().optional(),
  payment_no_interest: z.number().optional(),
  minimum_payment: z.number().optional(),
  transactions: z.array(TransactionIn).min(1),
  installment_plans: z.array(InstallmentPlanIn).default([]),
});
export type StatementIn = z.infer<typeof StatementIn>;

export const BudgetItemIn = z.object({
  name: Name,
  amount: Money,
  category: Name.optional(),
  currency: Currency.default("MXN"),
  payday: Day.optional().describe("Day of the month it is paid"),
  credit_card: Ref.optional(),
  debit_account: Ref.optional(),
  notes: z.string().optional(),
  active: z.boolean().default(true),
});
export type BudgetItemIn = z.infer<typeof BudgetItemIn>;

export const IncomeIn = z.object({
  name: Name,
  amount: Money.describe("Net monthly amount"),
  currency: Currency.default("MXN"),
  payday: Day.nullable().default(null).describe("Day of the month it is paid"),
});
export type IncomeIn = z.infer<typeof IncomeIn>;
/** Partial update: only the fields sent change (payday: null clears it). */
export const IncomePatch = z.object({
  name: Name, amount: Money, currency: Currency, payday: Day.nullable(),
}).partial();
export type IncomePatch = z.infer<typeof IncomePatch>;

export const TicketIn = z.object({
  store: Name,
  purchase_date: IsoDate,
  total: Money.optional().describe("Defaults to the sum of the items"),
  transaction_id: z.number().int().optional().describe("The card movement this ticket explains"),
  notes: z.string().optional(),
  items: z
    .array(z.object({
      product: Name,
      product_category: Name.optional().describe("e.g. Lácteos, Fruta. Created if missing"),
      quantity: z.number().positive().default(1),
      total: Money.describe("Total paid for this line"),
    }))
    .min(1),
});
export type TicketIn = z.infer<typeof TicketIn>;
