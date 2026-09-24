import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { databaseUrl } from "./config";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Connects to Postgres and applies pending migrations from ./drizzle. */
export async function makeDb(url = databaseUrl()): Promise<Db> {
  const db = drizzle(url, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
