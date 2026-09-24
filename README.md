# tracky (TS)

Home-manager MCP server: Bun + TypeScript + `@modelcontextprotocol/server` + Drizzle (PostgreSQL) + Zod.

```bash
bun install
cp .env.example .env
export ALLOW_TOKEN=$(openssl rand -base64 32)
bun start            # http://0.0.0.0:8000/mcp (migrations run on boot)
bun test
bun run db:generate  # after editing src/schema.ts
```

Auth: single API key sent in the `x-api-key` header (`ALLOW_TOKEN`). Env: `TRACKY_DATABASE_URL` (Postgres URL, default `postgres://postgres:postgres@localhost:5432/tracky`; migrations run on startup), `HOST` (default `0.0.0.0`), `PORT`.

Connect: `claude mcp add --transport http tracky http://localhost:8000/mcp --header "x-api-key: <token>"`
