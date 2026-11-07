import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Db } from "../db/connection";
import {
  BudgetItemIn, IncomeIn, IncomeItemIn, InstallmentPlanPatch, ManualInstallmentPlanIn, Currency, Day, IsoDate, LoanIn, Money, Name, Ref, StatementIn, TicketIn, TransactionIn, TransactionKind,
  UpcomingExpenseIn, UpcomingItemIn,
} from "../schemas";
import { addCreditCard, addDebitAccount, addLoan, listAccounts } from "../services/accounts";
import { listBudget, upsertBudgetItem } from "../services/budget";
import { listCategories } from "../services/common";
import { addIncome, addIncomeItem, listIncomeItems, listIncomes } from "../services/incomes";
import { budgetVsActual, forecast, installmentStatus, loanStatus, productSpending, spendingSummary } from "../services/reports";
import { addUpcoming, addUpcomingItem, deleteUpcoming, listUpcoming, updateUpcomingItem } from "../services/upcoming";
import { addTicket } from "../services/tickets";
import {
  addInstallmentPlan, addTransaction, categorizeTransactions, importStatement, listTransactions, updateInstallmentPlan,
} from "../services/transactions";

/** Tool defintion config */
export type Tool = Parameters<McpServer["registerTool"]>["1"];

const out = async (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

const INSTRUCTIONS =
  "Personal finance tracker (MXN). Banks hold credit cards, debit accounts and loans. " +
  "To load a credit card statement (estado de cuenta): make sure the card exists (list_accounts / add_credit_card), " +
  "then call import_statement with every movement. amount is always positive; set kind: card payments are 'payment', " +
  "'01 DE 03 ...' rows are installments of a purchase 'a meses' (declare them in installment_plans), cash withdrawals " +
  "'cash_withdrawal', commissions 'fee'. Re-importing is safe. Then categorize with high-level categories " +
  "(list_categories first to reuse names). Supermarket tickets go to add_ticket with product categories, linked to " +
  "the card movement via transaction_id. This server may be serverless: if a call fails, wait a minute and retry.";

export function buildServer(db: Db): McpServer {
  const mcp = new McpServer({ name: "tracky", version: "0.2.0" }, { instructions: INSTRUCTIONS });

  mcp.registerTool(
    "list_accounts",
    { description: "List banks with their credit cards (and latest statement), debit accounts and loans." },
    async () => out(await listAccounts(db)),
  );

  mcp.registerTool(
    "add_credit_card",
    {
      description: "Create or update a credit card (by bank + name). The bank is created if missing.",
      inputSchema: {
        bank: Name, name: Name, last4: z.string().regex(/^\d{4}$/).optional(), closing_day: Day.optional(),
        due_day: Day.optional(), credit_limit: Money.optional(), currency: Currency.optional(),
      },
    },
    async (args) => out(await addCreditCard(db, args)),
  );

  mcp.registerTool(
    "add_debit_account",
    {
      description: "Create or update a debit account (by bank + name). The bank is created if missing.",
      inputSchema: { bank: Name, name: Name, last4: z.string().regex(/^\d{4}$/).optional(), currency: Currency.optional() },
    },
    async (args) => out(await addDebitAccount(db, args)),
  );

  mcp.registerTool(
    "add_loan",
    {
      description:
        "Create or update a loan (by bank + name). Monthly or biweekly (quincenal: two payments a month, 15 days apart). " +
        "start_date is the date of payment 1; payments before today count as paid.",
      inputSchema: LoanIn.shape,
    },
    async (args) => out(await addLoan(db, args)),
  );

  mcp.registerTool(
    "import_statement",
    {
      description:
        "Import a credit card statement: header, every movement and the installment plans ('a meses') it shows. " +
        "Idempotent: rows already imported are skipped. Returns the ids of the movements in the same order.",
      inputSchema: StatementIn.shape,
    },
    async (args) => out(await importStatement(db, args)),
  );

  mcp.registerTool(
    "add_transaction",
    {
      description: "Record one movement by hand, for exactly one of credit_card, debit_account or loan (id or name).",
      inputSchema: { credit_card: Ref.optional(), debit_account: Ref.optional(), loan: Ref.optional(), ...TransactionIn.shape },
    },
    async ({ credit_card, debit_account, loan, ...t }) => out(await addTransaction(db, { credit_card, debit_account, loan }, t)),
  );

  mcp.registerTool(
    "list_transactions",
    {
      description: "List movements, newest first. Dates: start inclusive, end exclusive.",
      inputSchema: {
        start: IsoDate.optional(), end: IsoDate.optional(), category: z.string().optional(),
        uncategorized: z.boolean().optional(), kind: TransactionKind.optional(),
        limit: z.number().int().min(1).max(1000).default(200),
      },
    },
    async (args) => out(await listTransactions(db, args)),
  );

  mcp.registerTool("list_categories", { description: "List the high-level spending categories." }, async () =>
    out(await listCategories(db)));

  mcp.registerTool(
    "categorize_transactions",
    {
      description: "Assign high-level categories to movements in bulk. Categories are created if missing.",
      inputSchema: { items: z.array(z.object({ id: z.number().int(), category: Name })).min(1) },
    },
    async ({ items }) => out(await categorizeTransactions(db, items)),
  );

  mcp.registerTool(
    "set_budget_item",
    {
      description: "Create or replace a monthly budget item by name (e.g. a streaming subscription in Servicio, paid on day 1 with a given card).",
      inputSchema: BudgetItemIn.shape,
    },
    async (args) => out(await upsertBudgetItem(db, args)),
  );

  mcp.registerTool("list_budget", { description: "List the monthly budget items." }, async () => out(await listBudget(db)));

  mcp.registerTool(
    "add_ticket",
    {
      description:
        "Record a purchase ticket (supermarket, despensa) with its products. Products and product categories are created " +
        "if missing. Link it to the card movement with transaction_id.",
      inputSchema: TicketIn.shape,
    },
    async (args) => out(await addTicket(db, args)),
  );

  mcp.registerTool(
    "spending_summary",
    {
      description: "Real spending (purchases, fees, interest minus refunds; installments excluded) by category or month.",
      inputSchema: { start: IsoDate.optional(), end: IsoDate.optional(), group_by: z.enum(["category", "month"]).default("category") },
    },
    async (args) => out(await spendingSummary(db, args)),
  );

  mcp.registerTool(
    "product_spending",
    {
      description: "Ticket spending by product category (what the despensa is made of).",
      inputSchema: { start: IsoDate.optional(), end: IsoDate.optional() },
    },
    async (args) => out(await productSpending(db, args)),
  );

  mcp.registerTool(
    "installment_status",
    { description: "Purchases 'a meses': paid and remaining payments with their schedule." },
    async () => out(await installmentStatus(db)),
  );

  mcp.registerTool(
    "add_installment_plan",
    {
      description:
        "Record a purchase 'a meses' by hand, before any statement shows it: the full purchase (counted once as " +
        "spending) and its monthly payments for the forecast. Importing the statement later updates the same plan.",
      inputSchema: ManualInstallmentPlanIn.shape,
    },
    async (args) => out(await addInstallmentPlan(db, args)),
  );

  mcp.registerTool(
    "update_installment_plan",
    {
      description:
        "Edit a purchase 'a meses' (id from installment_status): rename it, set its high-level category (also applied " +
        "to the purchase movement) or move it to another credit card.",
      inputSchema: { id: z.number().int(), ...InstallmentPlanPatch.shape },
    },
    async ({ id, ...patch }) => out(await updateInstallmentPlan(db, id, patch)),
  );

  mcp.registerTool(
    "loan_status",
    { description: "Loans with payments made, remaining payments and amount, next payment and end date." },
    async () => out(await loanStatus(db)),
  );

  mcp.registerTool("list_upcoming_expenses", { description: "Próximos gastos: upcoming events with their expenses." },
    async () => out(await listUpcoming(db)));

  mcp.registerTool(
    "add_upcoming_expense",
    {
      description: "Add a próximo gasto: an upcoming one-off event (trip, Christmas, car repair) with the expenses it brings.",
      inputSchema: UpcomingExpenseIn.shape,
    },
    async (args) => out(await addUpcoming(db, args)),
  );

  mcp.registerTool(
    "add_upcoming_expense_item",
    { description: "Add an expense to an existing próximo gasto.", inputSchema: UpcomingItemIn.shape },
    async (args) => out(await addUpcomingItem(db, args)),
  );

  mcp.registerTool(
    "set_upcoming_item_paid",
    {
      description: "Mark an expense of a próximo gasto as paid (or not). Paid items leave the forecast.",
      inputSchema: { id: z.number().int(), paid: z.boolean() },
    },
    async ({ id, paid }) => out(await updateUpcomingItem(db, id, { paid })),
  );

  mcp.registerTool(
    "delete_upcoming_expense",
    { description: "Delete a próximo gasto and its expenses.", inputSchema: { id: z.number().int() } },
    async ({ id }) => out(await deleteUpcoming(db, id)),
  );

  mcp.registerTool(
    "list_incomes",
    {
      description: "Income approximations (expected monthly amount per source) with what was received for each in a month.",
      inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM, default this month") },
    },
    async ({ month }) => out(await listIncomes(db, month)),
  );

  mcp.registerTool(
    "add_income",
    { description: "Add an income approximation: a source and its expected net monthly amount.", inputSchema: IncomeIn.shape },
    async (args) => out(await addIncome(db, args)),
  );

  mcp.registerTool(
    "add_income_item",
    {
      description:
        "Record a real deposit (abono) to an account, tied to the income approximation it fulfils (or none for an " +
        "extra deposit). The forecast uses deposits for past and current months.",
      inputSchema: IncomeItemIn.shape,
    },
    async (args) => out(await addIncomeItem(db, args)),
  );

  mcp.registerTool(
    "list_income_items",
    {
      description: "Deposits (abonos) received, optionally for one month.",
      inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM") },
    },
    async ({ month }) => out(await listIncomeItems(db, { month })),
  );

  mcp.registerTool(
    "forecast",
    {
      description:
        "Cash flow per month: income minus budget, pending installments, loan payments, card statements due and " +
        "próximos gastos; net and cumulative. Starts this month unless `from` is given.",
      inputSchema: { months: z.number().int().min(1).max(24).default(3), from: IsoDate.optional() },
    },
    async (args) => out(await forecast(db, args)),
  );

  mcp.registerTool(
    "budget_vs_actual",
    {
      description: "Budget vs. real spending per category for a month.",
      inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/).describe("YYYY-MM") },
    },
    async ({ month }) => out(await budgetVsActual(db, month)),
  );

  return mcp;
}
