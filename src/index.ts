import { allowToken } from "./config";
import { makeDb } from "./db";

const server = Bun.serve({
  hostname: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 8000),
  routes: {
    "/": new Response("ok")
  }
});

console.log(`tracky listening on ${server.url}mcp`);