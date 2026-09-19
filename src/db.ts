import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { databasePath } from "./config";
import * as schema from "./schema";

export type Db = ReturnType<typeof makeDb>;

/** Opens the DB, enables FKs and applies pending migrations from ./drizzle. */
export function makeDb(path = databasePath()) {
  const sqlite = new Database(path, { create: true });
  sqlite.run("PRAGMA foreign_keys=ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  return db;
}
