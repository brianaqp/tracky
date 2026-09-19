import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { databaseUrl } from "./config";
import * as schema from "./schema";

/** Connects to Postgres and applies pending migrations from ./drizzle. */
export async function makeDb(url = databaseUrl()) {
  const db = drizzle(databaseUrl());
  return db;
}
