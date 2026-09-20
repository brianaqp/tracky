import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Db } from "./db";
import { buildServer } from "./server";

function validToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** x-api-key-protected, stateless MCP handler at /mcp (serves 2026-07-28 and legacy 2025 clients). */
export function makeHandler(db: Db, token: string) {
  const mcp = createMcpHandler(() => buildServer(db));

  return async (req: Request): Promise<Response> => {
    if (new URL(req.url).pathname !== "/mcp") return new Response("Not found", { status: 404 });

    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || !validToken(apiKey, token)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    return mcp.fetch(req);
  };
}
