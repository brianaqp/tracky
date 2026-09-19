import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "./db";
import * as s from "./services";
import { ConsumptionIn, IsoDate, Name, ProductRef, PurchaseIn } from "./schemas";

const USER = "home";
const out = async (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

export function buildServer(db: Db): McpServer {
  const mcp = new McpServer(
    { name: "tracky", version: "0.1.0" },
    {
      instructions:
        "Home manager: tracks products, purchases (price/quantity) and consumption. " +
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
      description: "Create a product. `unit` is how it is measured (L, kg, pza). The category is created if missing.",
      inputSchema: { name: Name, unit: Name, category: Name.optional() },
    },
    async ({ name, unit, category }) => out(await s.addProduct(db, name, unit, category)),
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
        "Record a purchase. `product` is a name or id; `total_price` is the TOTAL paid (not per unit). " +
        "E.g. 24 L of milk for 480.00 -> quantity=24, total_price=480. Returns the computed unit price.",
      inputSchema: PurchaseIn.shape,
    },
    async (args) => out(await s.addPurchase(db, args, USER)),
  );

  mcp.registerTool(
    "log_consumption",
    {
      description: "Record that some quantity of a product was consumed (used to estimate stock and days left).",
      inputSchema: ConsumptionIn.shape,
    },
    async (args) => out(await s.logConsumption(db, args, USER)),
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

  mcp.registerTool(
    "stock_estimate",
    {
      description:
        "Estimated stock (purchased - consumed) and days left, based on average consumption over the last `window_days`.",
      inputSchema: { product: ProductRef, window_days: z.number().int().min(1).max(365).default(30) },
    },
    async ({ product, window_days }) => out(await s.stockEstimate(db, product, window_days)),
  );

  return mcp;
}
