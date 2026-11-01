import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { handleApi } from "./api";
import type { Db } from "./db/connection";
import { buildServer } from "./tools";

function validToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** x-api-key-protected routes: the stateless MCP handler at /mcp and the dashboard API at /api/*. */
export function makeHandler(db: Db, token: string) {
  const mcp = createMcpHandler(() => buildServer(db));

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("ok");
    const isMcp = url.pathname === "/mcp";
    if (!isMcp && !url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });

    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || !validToken(apiKey, token)) return Response.json({ error: "unauthorized" }, { status: 401 });

    return isMcp ? mcp.fetch(req) : handleApi(db, url);
  };
}
