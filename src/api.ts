/** JSON API for the dashboard (web/). Same services as the MCP tools. Reads are GET /api/<route>; writes are listed in `writes`. */
import { z } from "zod";
import type { Db } from "./db/connection";
import { IncomeIn, IncomePatch, InstallmentPlanPatch, UpcomingExpenseIn, UpcomingExpensePatch, UpcomingItemIn, UpcomingItemPatch } from "./schemas";
import { listAccounts, listStatements } from "./services/accounts";
import { listBudget } from "./services/budget";
import { listCategories, today } from "./services/common";
import { addIncome, deleteIncome, listIncomes, updateIncome } from "./services/incomes";
import { budgetVsActual, forecast, installmentStatus, loanStatus, productSpending, spendingSummary } from "./services/reports";
import {
  addUpcoming, addUpcomingItem, deleteUpcoming, deleteUpcomingItem, listUpcoming, updateUpcoming, updateUpcomingItem,
} from "./services/upcoming";
import { listTickets } from "./services/tickets";
import { listTransactions, updateInstallmentPlan } from "./services/transactions";

type Query = URLSearchParams;
const opt = (q: Query, k: string) => q.get(k) || undefined;

const routes: Record<string, (db: Db, q: Query) => Promise<unknown>> = {
  accounts: (db) => listAccounts(db),
  statements: (db) => listStatements(db),
  categories: (db) => listCategories(db),
  transactions: (db, q) => listTransactions(db, {
    start: opt(q, "start"), end: opt(q, "end"), category: opt(q, "category"), kind: opt(q, "kind"),
    uncategorized: q.get("uncategorized") === "true",
  }),
  budget: (db) => listBudget(db),
  incomes: (db) => listIncomes(db),
  tickets: (db) => listTickets(db),
  installments: (db) => installmentStatus(db),
  loans: (db) => loanStatus(db),
  upcoming: (db) => listUpcoming(db),
  forecast: (db, q) => forecast(db, { months: Math.min(Math.max(Number(q.get("months") ?? 3) || 3, 1), 36) }),
  "spending-summary": (db, q) => spendingSummary(db, {
    start: opt(q, "start"), end: opt(q, "end"), group_by: q.get("group_by") === "month" ? "month" : "category",
  }),
  "product-spending": (db, q) => productSpending(db, { start: opt(q, "start"), end: opt(q, "end") }),
  "budget-vs-actual": (db, q) => budgetVsActual(db, q.get("month") ?? today().slice(0, 7)),
};

/** Write routes: "<METHOD> <route>", with an optional numeric id as the last path segment. */
const writes: Record<string, (db: Db, body: unknown, id: number) => Promise<unknown>> = {
  "POST incomes": (db, body) => addIncome(db, IncomeIn.parse(body)),
  "PATCH incomes": (db, body, id) => updateIncome(db, id, IncomePatch.parse(body)),
  "DELETE incomes": (db, _body, id) => deleteIncome(db, id),
  "PATCH installments": (db, body, id) => updateInstallmentPlan(db, id, InstallmentPlanPatch.parse(body)),
  "POST upcoming": (db, body) => addUpcoming(db, UpcomingExpenseIn.parse(body)),
  "PATCH upcoming": (db, body, id) => updateUpcoming(db, id, UpcomingExpensePatch.parse(body)),
  "DELETE upcoming": (db, _body, id) => deleteUpcoming(db, id),
  "POST upcoming-items": (db, body) => addUpcomingItem(db, UpcomingItemIn.parse(body)),
  "PATCH upcoming-items": (db, body, id) => updateUpcomingItem(db, id, UpcomingItemPatch.parse(body)),
  "DELETE upcoming-items": (db, _body, id) => deleteUpcomingItem(db, id),
};

export async function handleApi(db: Db, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.slice("/api/".length);
  let handler: (() => Promise<unknown>) | undefined;
  if (req.method === "GET") {
    const route = routes[path];
    if (route) handler = () => route(db, url.searchParams);
  } else {
    const [, name, id] = path.match(/^([\w-]+)(?:\/(\d+))?$/) ?? [];
    const write = writes[`${req.method} ${name}`];
    const needsId = req.method !== "POST";
    if (write && needsId === (id !== undefined)) {
      handler = async () => write(db, req.method === "DELETE" ? undefined : await req.json(), Number(id));
    }
  }
  if (!handler) return Response.json({ error: "not found" }, { status: 404 });
  try {
    return Response.json(await handler());
  } catch (e) {
    const message = e instanceof z.ZodError ? z.prettifyError(e) : (e as Error).message;
    return Response.json({ error: message }, { status: 400 });
  }
}
