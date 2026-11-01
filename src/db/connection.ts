import { drizzle as drizzleBunSql } from "drizzle-orm/bun-sql";
import { migrate as migrateBunSql } from "drizzle-orm/bun-sql/migrator";
import type { PgAsyncDatabase } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { databaseUrl } from "../config";

export type Db = PgAsyncDatabase<any>;

const migrationsFolder = "./drizzle";

/**
 * Connects and applies pending migrations from ./drizzle.
 * `pglite:<dir>` runs an embedded Postgres persisted in <dir> (local dev, no Docker);
 * anything else is a regular Postgres URL (Neon, docker-compose).
 */
export async function makeDb(url = databaseUrl()): Promise<Db> {
  if (url.startsWith("pglite:")) {
    const dir = url.slice("pglite:".length);
    const db = dir ? drizzlePglite(dir) : drizzlePglite();
    await migratePglite(db, { migrationsFolder });
    return db;
  }
  const db = drizzleBunSql(url);
  await migrateBunSql(db, { migrationsFolder });
  return db;
}
