import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Db } from "./db";
import * as s from "./services";
import { IsoDate, Name, ProductRef, PurchaseIn } from "./schemas";

const out = async (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

export function buildServer(db: Db): McpServer {
  const mcp = new McpServer(
    { name: "tracky", version: "0.1.0" },
    {
      instructions:
        "Home manager: tracks products, purchases (price/quantity). " +
        "Call list_products before add_purchase if unsure of the exact product name.",
    },
  );

  mcp.registerTool("list_categories", { description: "List all categories." }, async () => out(await s.listCategories(db)));

  mcp.registerTool(
    "add_category",
    { description: "Create a category (idempotent, case-insensitive).", inputSchema: { name: Name } },
    async ({ name }) => out(await s.addCategory(db, name)),
  );

  mcp.registerTool(
    "add_product",
    {
      description: "Create a product (a package). Put the description in the name, e.g. 'Coca Cola 355ml x 24 pz'. The category is created if missing.",
      inputSchema: { name: Name, category: Name.optional() },
    },
    async ({ name, category }) => out(await s.addProduct(db, name, category)),
  );

  mcp.registerTool(
    "list_products",
    {
      description: "List products, optionally filtered by category or name substring.",
      inputSchema: { category: z.string().optional(), search: z.string().optional() },
    },
    async ({ category, search }) => out(await s.listProducts(db, category, search)),
  );

  mcp.registerTool(
    "add_purchase",
    {
      description:
        "Record a purchase. `product` is a name or id; `quantity` is the number of packages and `total_price` is the TOTAL paid. " +
        "E.g. 2 packs of 'Lala 100 x 12 pz' for 878.00 -> quantity=2, total_price=878. Returns the price per package.",
      inputSchema: PurchaseIn.shape,
    },
    async (args) => out(await s.addPurchase(db, args)),
  );

  mcp.registerTool(
    "price_history",
    {
      description: "Latest purchases of a product with unit price, newest first. Use it to spot price changes.",
      inputSchema: { product: ProductRef, limit: z.number().int().min(1).max(200).default(20) },
    },
    async ({ product, limit }) => out(await s.priceHistory(db, product, limit)),
  );

  mcp.registerTool(
    "spending_summary",
    {
      description: "Total spent in a period (start inclusive, end exclusive), grouped by category, product or month.",
      inputSchema: {
        start: IsoDate.optional(),
        end: IsoDate.optional(),
        group_by: z.enum(["category", "product", "month"]).default("category"),
        category: z.string().optional(),
      },
    },
    async ({ start, end, group_by, category }) => out(await s.spendingSummary(db, start, end, group_by, category)),
  );

  return mcp;
}
