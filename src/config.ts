export const databasePath = () => process.env.TRACKY_DATABASE_URL ?? "tracky.db";

export function allowToken(): string {
  const token = (process.env.ALLOW_TOKEN ?? "").trim();
  if (!token) throw new Error("ALLOW_TOKEN is empty: refusing to start without auth");
  return token;
}
