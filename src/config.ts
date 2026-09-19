export const databaseUrl = () => {
  const DB_URL = process.env.TRACKY_DATABASE_URL;
  if (!DB_URL) {
    throw new Error("Database URL must be present");
  }
  return DB_URL;
}

export function allowToken(): string {
  const token = (process.env.ALLOW_TOKEN ?? "").trim();
  if (!token) throw new Error("ALLOW_TOKEN is empty: refusing to start without auth");
  return token;
}
