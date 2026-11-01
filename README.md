# tracky (TS)

Personal finance MCP server: Bun + TypeScript + `@modelcontextprotocol/server` + Drizzle (PostgreSQL) + Zod, with a small React Router dashboard in `web/`.

- **Banks** hold credit cards, debit accounts and loans.
- **Statements** (`import_statement`): Claude reads the PDF and sends every movement; re-importing is safe. Purchases "a meses" become installment plans so the remaining payments can be forecast.
- **Categories** group movements (Despensa, Servicio, Viajes…) and the monthly **budget**.
- **Tickets** (`add_ticket`) break a purchase into products with their own categories (Lácteos, Fruta…).
- **Reports**: spending by category, budget vs. actual, installment status and a monthly forecast.

```bash
bun install
cp .env.example .env
export ALLOW_TOKEN=$(openssl rand -base64 32)
bun start            # http://0.0.0.0:8000/mcp (migrations run on boot)
bun run dev          # same, on an embedded PGlite database in ./.pglite (no Docker needed)
bun test
bun run db:generate  # after editing src/db/schema.ts
```

Dashboard (proxies `/api` to the server and adds the API key, so it never reaches the browser):

```bash
cd web && bun install
ALLOW_TOKEN=<token> bun run dev   # http://localhost:5173 (TRACKY_API defaults to http://localhost:8000)
```

Auth: single API key sent in the `x-api-key` header (`ALLOW_TOKEN`), for both `/mcp` and `/api/*`. Env: `TRACKY_DATABASE_URL` (Postgres URL, or `pglite:<dir>` for local dev), `HOST` (default `0.0.0.0`), `PORT`, `TZ`.

Connect: `claude mcp add --transport http tracky http://localhost:8000/mcp --header "x-api-key: <token>"`

`data/` is gitignored: keep real statements and seed scripts there.
