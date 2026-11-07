# tracky

Personal finance MCP server (Bun + TypeScript + Drizzle/Postgres + Zod) with a React Router dashboard in `web/`. Amounts are MXN; the user and data are Mexican (BBVA statements, Spanish descriptions).

## Private data: never commit `data/`

`data/` holds real personal financial data (bank statement PDFs with card numbers, RFC, CLABE, address; seed scripts built from them). The repo is public.

- `data/` is gitignored and `.githooks/pre-commit` rejects any staged path under `data/`. After cloning, enable it with `git config core.hooksPath .githooks`.
- Never `git add -f` anything in `data/`, never copy its contents into tracked files (tests, fixtures, README, commit messages) and never publish it anywhere. Tests use made-up or minimal values.
- `.pglite/` (local database with the same data) is gitignored too.

## Commands

```bash
bun run dev          # server on embedded PGlite (./.pglite); migrations run on boot
bun test             # service tests on in-memory PGlite
bun run db:generate  # after editing src/db/schema.ts
node_modules/.bin/tsc --noEmit -p .        # typecheck server
cd web && ALLOW_TOKEN=<token> bun run dev  # dashboard on :5173, proxies /api to :8000 with the key
ALLOW_TOKEN=<token> bun data/seed.ts       # load the mock data through the MCP tools
```

`.env` points at a Neon database that may be production. `bun start` runs migrations against `TRACKY_DATABASE_URL`, so for local work use `bun run dev` (or set `TRACKY_DATABASE_URL=pglite:./.pglite`), and don't run migrations or seeds against Neon without asking.

## Layout

- `src/db/schema.ts`: tables use `snakeCase.table` (camelCase in TS, snake_case in Postgres). Drizzle is 1.0 RC: check its docs for API changes.
- `src/db/connection.ts`: `pglite:<dir>` → PGlite, anything else → Bun SQL.
- `src/services/*`: business logic, plain functions over `Db`. MCP tools (`src/tools/index.ts`) and the dashboard API (`src/api.ts`) only call services.
- `src/schemas.ts`: Zod inputs for tools (snake_case fields).
- `web/`: Vite + React + React Router (data mode, loaders). No component libraries or design frameworks; plain CSS in `web/src/styles.css` with light/dark tokens.

## Domain rules

- Banks hold `credit_cards`, `debit_accounts` and `loans`; a transaction belongs to exactly one of them (DB check).
- `transactions.amount` is always positive; `kind` gives the meaning. Spending = purchase + fee + interest − refund. Payments, cash withdrawals and installments are not spending.
- Purchases "a meses": the full purchase is one `purchase` (counted once), the "01 DE 03 ..." rows are `installment` rows linked to an `installment_plans` row; the forecast uses the plan's pending payments.
- Re-importing a statement is idempotent through `transactions.dedupe_key` (identical rows get an ordinal); rows already recorded by hand with the same key get attached to the statement.
- Two separate taxonomies: `categories` (high level: Despensa, Servicio...) for transactions and budget; `product_categories` (Lácteos, Fruta...) for ticket items.
- Budget items mirror the user's Notion table; the per-quincena "half value" is intentionally not stored.
- Loans are `monthly` or `biweekly` (quincenal: start day and +15 days). `payment`/`term_payments` count payments, not months; payments dated before today count as paid.
- Próximos gastos (`upcoming_expenses` + items): one-off events; unpaid items enter the forecast in the event's month (overdue ones in the current month).
- Income has two layers: `incomes` is the approximation (expected monthly amount per source) and `income_items` are the real dated deposits (abonos), optionally linked to an approximation and a debit account. In the forecast's first month income = deposits + what each approximation still owes (never below 0); later months use the approximation.
- `forecast` is a cash flow: income − (budget + pending installments + loan payments + card statements due that month + próximos gastos), with `net` and `cumulative`.
