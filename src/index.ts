import { allowToken } from "./config";
import { makeDb } from "./db";
import { makeHandler } from "./http";

const server = Bun.serve({
  hostname: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 8000),
  fetch: makeHandler(await makeDb(), allowToken()),
});
console.log(`tracky listening on ${server.url}mcp`);
