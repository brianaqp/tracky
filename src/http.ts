import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Db } from "./db";
import { buildServer } from "./server";

function validToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** x-api-key-protected, stateless Streamable HTTP handler at /mcp. */
export function makeHandler(db: Db, token: string) {
  return async (req: Request): Promise<Response> => {
    if (new URL(req.url).pathname !== "/mcp") return new Response("Not found", { status: 404 });

    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || !validToken(apiKey, token)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await buildServer(db).connect(transport);
    return transport.handleRequest(req);
  };
}
