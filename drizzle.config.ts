import { defineConfig } from "drizzle-kit";

// Same convention as src/db/connection.ts: "pglite:<dir>" is the local embedded DB, anything else is a Postgres URL.
const url = process.env.TRACKY_DATABASE_URL!;
const pglite = url?.startsWith("pglite:");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  ...(pglite
    ? { driver: "pglite", dbCredentials: { url: url.slice("pglite:".length) } }
    : { dbCredentials: { url } }),
});
