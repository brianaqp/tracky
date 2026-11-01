/** Read-only JSON API for the dashboard (web/). Same services as the MCP tools. */
import type { Db } from "./db/connection";
import { listAccounts, listStatements } from "./services/accounts";
import { listBudget } from "./services/budget";
import { listCategories, today } from "./services/common";
import { budgetVsActual, forecast, installmentStatus, productSpending, spendingSummary } from "./services/reports";
import { listTickets } from "./services/tickets";
import { listTransactions } from "./services/transactions";

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
  tickets: (db) => listTickets(db),
  installments: (db) => installmentStatus(db),
  forecast: (db, q) => forecast(db, { months: Number(q.get("months") ?? 3) }),
  "spending-summary": (db, q) => spendingSummary(db, {
    start: opt(q, "start"), end: opt(q, "end"), group_by: q.get("group_by") === "month" ? "month" : "category",
  }),
  "product-spending": (db, q) => productSpending(db, { start: opt(q, "start"), end: opt(q, "end") }),
  "budget-vs-actual": (db, q) => budgetVsActual(db, q.get("month") ?? today().slice(0, 7)),
};

export async function handleApi(db: Db, url: URL): Promise<Response> {
  const route = routes[url.pathname.slice("/api/".length)];
  if (!route) return Response.json({ error: "not found" }, { status: 404 });
  try {
    return Response.json(await route(db, url.searchParams));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
