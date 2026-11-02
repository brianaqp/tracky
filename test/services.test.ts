import { beforeAll, describe, expect, test } from "bun:test";
import { type Db, makeDb } from "../src/db/connection";
import { IncomeIn, StatementIn, TicketIn } from "../src/schemas";
import { addCreditCard } from "../src/services/accounts";
import { upsertBudgetItem } from "../src/services/budget";
import { addMonths } from "../src/services/common";
import { forecast, installmentStatus, productSpending, spendingSummary } from "../src/services/reports";
import { addIncome, deleteIncome, listIncomes, updateIncome } from "../src/services/incomes";
import { addTicket } from "../src/services/tickets";
import { categorizeTransactions, importStatement, listTransactions } from "../src/services/transactions";

let db: Db;

const statement = StatementIn.parse({
  credit_card: "Platinum",
  period_start: "2026-09-23",
  period_end: "2026-10-22",
  closing_date: "2026-10-22",
  due_date: "2026-11-11",
  transactions: [
    { operation_date: "2026-09-23", description: "SUPERMERCADO CENTRO", amount: 1500, category: "Despensa" },
    { operation_date: "2026-09-25", description: "PAGO TARJETA", amount: 5000, kind: "payment" },
    { operation_date: "2026-10-15", description: "AUTOBUS WEB", amount: 500 },
    { operation_date: "2026-10-15", description: "AUTOBUS WEB", amount: 500 },
    { operation_date: "2026-10-15", description: "AEROLINEA A 03 MESES S/I", amount: 9000.01, category: "Viajes" },
    { operation_date: "2026-10-22", description: "01 DE 03 AEROLINEA", amount: 3000 },
  ],
  installment_plans: [{
    description: "Aerolinea", total_amount: 9000.01, months: 3, monthly_amount: 3000,
    purchase_date: "2026-10-15", first_payment_date: "2026-10-22", purchase_index: 4, payments: [{ index: 5, number: 1 }],
  }],
});

beforeAll(async () => {
  db = await makeDb("pglite:");
  await addCreditCard(db, { bank: "BBVA", name: "Platinum", closing_day: 22, due_day: 11 });
});

describe("importStatement", () => {
  test("stores movements, keeps identical rows apart and is idempotent", async () => {
    const first = await importStatement(db, statement);
    expect(first).toMatchObject({ inserted: 6, skipped: 0 });
    const again = await importStatement(db, statement);
    expect(again).toMatchObject({ inserted: 0, skipped: 6, uploadedStatementId: first.uploadedStatementId });
    expect(again.transactionIds).toEqual(first.transactionIds);
    expect(await listTransactions(db, { start: "2026-10-15", end: "2026-10-16" })).toHaveLength(3);
  });

  test("links installment payments and excludes them from spending", async () => {
    const [plan] = await installmentStatus(db);
    expect(plan).toMatchObject({ paidCount: 1, remainingPayments: 2, remainingAmount: "6000.01" });
    expect(plan!.schedule.map((s) => s.amount)).toEqual(["3000.00", "3000.00", "3000.01"]);

    const summary = await spendingSummary(db, {});
    expect(summary.find((s) => s.group === "Viajes")?.total).toBe("9000.01");
    expect(summary.reduce((s, r) => s + Number(r.total), 0)).toBeCloseTo(1500 + 2 * 500 + 9000.01);
  });
});

test("categorizeTransactions creates categories and updates rows", async () => {
  const bus = await listTransactions(db, { uncategorized: true, kind: "purchase" });
  expect(bus.map((t) => t.description)).toEqual(["AUTOBUS WEB", "AUTOBUS WEB"]);
  expect(await categorizeTransactions(db, bus.map((t) => ({ id: t.id, category: "Viajes" })))).toEqual({ updated: 2 });
  expect(await listTransactions(db, { uncategorized: true, kind: "purchase" })).toHaveLength(0);
});

test("forecast adds budget and pending installments per month", async () => {
  await upsertBudgetItem(db, { name: "Streaming", category: "Servicio", amount: 200, currency: "MXN", active: true });
  const months = await forecast(db, { from: "2026-11-01", months: 3 });
  expect(months.map((m) => [m.month, m.total])).toEqual([
    ["2026-11", "3200.00"],
    ["2026-12", "3200.01"],
    ["2027-01", "200.00"],
  ]);
});

test("addTicket links products to the card movement", async () => {
  const [market] = await listTransactions(db, { category: "Despensa" });
  const ticket = await addTicket(db, TicketIn.parse({
    store: "Supermercado", purchase_date: "2026-09-23", transaction_id: market!.id,
    items: [
      { product: "Leche Lala 12 pz", product_category: "Lácteos", quantity: 2, total: 578 },
      { product: "Manzana 2 kg", product_category: "Fruta", total: 85.5 },
    ],
  }));
  expect(ticket).toMatchObject({ total: "663.50", items: 2 });
  expect(await productSpending(db, {})).toEqual([
    { group: "Lácteos", total: "578.00", items: 1 },
    { group: "Fruta", total: "85.50", items: 1 },
  ]);
});

test("addMonths clamps to the end of the month", () => {
  expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  expect(addMonths("2026-10-22", 3)).toBe("2027-01-22");
});

describe("incomes", () => {
  test("add, rename, clear payday and delete; names stay unique", async () => {
    const a = await addIncome(db, IncomeIn.parse({ name: "Sueldo 15", amount: 1000, payday: 15 }));
    await addIncome(db, IncomeIn.parse({ name: "Extra", amount: 250.5 }));
    await expect(addIncome(db, IncomeIn.parse({ name: "sueldo 15", amount: 1 }))).rejects.toThrow("Ya existe");
    await expect(updateIncome(db, a.id, { name: "Extra" })).rejects.toThrow("Ya existe");

    const renamed = await updateIncome(db, a.id, { name: "Sueldo", payday: null });
    expect(renamed).toMatchObject({ name: "Sueldo", amount: "1000.00", payday: null, currency: "MXN" });
    expect((await listIncomes(db)).reduce((s, i) => s + Number(i.amount), 0)).toBe(1250.5);

    await deleteIncome(db, a.id);
    expect((await listIncomes(db)).map((i) => i.name)).toEqual(["Extra"]);
  });
});
