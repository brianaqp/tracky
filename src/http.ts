import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Db } from "./db";
import { buildServer } from "./server";

function validToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Bearer-protected, stateless Streamable HTTP handler at /mcp. */
export function makeHandler(db: Db, token: string) {
  return async (req: Request): Promise<Response> => {
    if (new URL(req.url).pathname !== "/mcp") return new Response("Not found", { status: 404 });

    const bearer = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
    if (!bearer || !validToken(bearer, token)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
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
