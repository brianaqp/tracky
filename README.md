# tracky (TS)

Home-manager MCP server: Bun + TypeScript + `@modelcontextprotocol/sdk` + Drizzle (SQLite) + Zod.

```bash
bun install
export ALLOW_TOKEN=$(openssl rand -base64 32)
bun start            # http://0.0.0.0:8000/mcp (migrations run on boot)
bun test
bun run db:generate  # after editing src/schema.ts
```

Auth: single bearer token (`ALLOW_TOKEN`). Env: `TRACKY_DATABASE_URL` (path, default `tracky.db`), `HOST`, `PORT`.

Connect: `claude mcp add --transport http tracky http://localhost:8000/mcp --header "Authorization: Bearer <token>"`
