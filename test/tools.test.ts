import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { makeDb } from "../src/db";
import { makeHandler } from "../src/http";
import { buildServer } from "../src/server";

async function connect() {
  const db = makeDb(":memory:");
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await buildServer(db).connect(st);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(ct);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r: any = await client.callTool({ name, arguments: args });
    return { error: r.isError, data: r.isError ? r.content[0].text : JSON.parse(r.content[0].text) };
  };
  return { call, db };
}

test("full flow", async () => {
  const { call } = await connect();
  await call("add_product", { name: "Leche", unit: "L", category: "Lácteos" });
  const p = await call("add_purchase", { product: "leche", quantity: 24, total_price: 480, store: "Costco" });
  expect(p.data.unit_price).toBe("20.0000");
  expect(p.data.total_price).toBe("480.00");

  await call("log_consumption", { product: "Leche", quantity: 6 });
  const stock = await call("stock_estimate", { product: "Leche" });
  expect(stock.data.in_stock).toBe(18);
  expect(stock.data.days_left).toBe(90);

  const spend = await call("spending_summary", { group_by: "month" });
  expect(spend.data[0].total_spent).toBe("480.00");
  const hist = await call("price_history", { product: 1 });
  expect(hist.data).toHaveLength(1);
});

test("unknown product suggests similar", async () => {
  const { call } = await connect();
  await call("add_product", { name: "Leche entera", unit: "L" });
  const r = await call("add_purchase", { product: "Leche", quantity: 1, total_price: 20 });
  expect(r.error).toBe(true);
  expect(r.data).toContain("Leche entera");
});

test("bad quantity rejected", async () => {
  const { call } = await connect();
  await call("add_product", { name: "Leche", unit: "L" });
  const r = await call("add_purchase", { product: "Leche", quantity: 0, total_price: 20 });
  expect(r.error).toBe(true);
});

test("bearer auth", async () => {
  const handle = makeHandler(makeDb(":memory:"), "tok");
  const req = (auth?: string) =>
    handle(new Request("http://x/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }));
  expect((await req()).status).toBe(401);
  expect((await req("Bearer nope")).status).toBe(401);
  expect((await req("Bearer tok")).status).toBe(200);
});
