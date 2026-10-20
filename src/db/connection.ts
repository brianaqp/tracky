import { drizzle } from "drizzle-orm/neon-http";

const db = drizzle(process.env.TRACKY_DATABASE_URL ?? "");