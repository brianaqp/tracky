import { beforeAll, describe, expect, test } from "bun:test";
import { type Db, makeDb } from "../src/db/connection";
import { eq } from "drizzle-orm";
import { transactions } from "../src/db/schema";
import { IncomeIn, IncomeItemIn, LoanIn, StatementIn, TicketIn, TransactionIn, UpcomingExpenseIn } from "../src/schemas";
import { addCreditCard, addLoan } from "../src/services/accounts";
import { upsertBudgetItem } from "../src/services/budget";
import { addMonths, paymentDates } from "../src/services/common";
import { forecast, installmentStatus, loanStatus, productSpending, spendingSummary } from "../src/services/reports";
import { addUpcoming, listUpcoming, updateUpcomingItem } from "../src/services/upcoming";
import {
  addIncome, addIncomeItem, deleteIncome, deleteIncomeItem, listIncomeItems, listIncomes, updateIncome, updateIncomeItem,
} from "../src/services/incomes";
import { addTicket } from "../src/services/tickets";
import {
  addTransaction, categorizeTransactions, importStatement, listTransactions, updateInstallmentPlan,
} from "../src/services/transactions";

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
    expect(plan).toMatchObject({
      paidCount: 1, remainingPayments: 2, remainingAmount: "6000.01", creditCard: "Platinum", bank: "BBVA", category: "Viajes",
    });
    expect(plan!.schedule.map((s) => s.amount)).toEqual(["3000.00", "3000.00", "3000.01"]);

    const summary = await spendingSummary(db, {});
    expect(summary.find((s) => s.group === "Viajes")?.total).toBe("9000.01");
    expect(summary.reduce((s, r) => s + Number(r.total), 0)).toBeCloseTo(1500 + 2 * 500 + 9000.01);
  });
});

test("updateInstallmentPlan renames, recategorizes the plan and its purchase", async () => {
  const [plan] = await installmentStatus(db);
  await updateInstallmentPlan(db, plan!.id, { description: "Vuelos", category: "Transporte" });
  expect((await installmentStatus(db))[0]).toMatchObject({ description: "Vuelos", category: "Transporte" });
  expect((await listTransactions(db, { category: "Transporte" })).map((t) => t.description)).toEqual(["AEROLINEA A 03 MESES S/I"]);
  await updateInstallmentPlan(db, plan!.id, { description: "Aerolinea", category: "Viajes" });
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

  test("deposits (income items) count against their approximation in the first forecast month", async () => {
    const extra = (await listIncomes(db)).find((i) => i.name === "Extra")!;
    const first = await addIncomeItem(db, IncomeItemIn.parse({ date: "2027-03-02", amount: 100, income: "extra" }));
    await addIncomeItem(db, IncomeItemIn.parse({ date: "2027-03-10", amount: 50, notes: "Venta" }));
    await addIncomeItem(db, IncomeItemIn.parse({ date: "2027-04-01", amount: 999, income: extra.id }));
    await expect(addIncomeItem(db, IncomeItemIn.parse({ date: "2027-03-02", amount: 1, income: "Nope" }))).rejects.toThrow("not found");

    expect((await listIncomes(db, "2027-03")).find((i) => i.id === extra.id)).toMatchObject({ received: "100.00" });
    const items = await listIncomeItems(db, { month: "2027-03" });
    expect(items.map((i) => [i.amount, i.income])).toEqual([["100.00", "Extra"], ["50.00", null]]);

    // March: 150 received + 150.50 still due from "Extra"; April: the approximation.
    const [mar, apr] = await forecast(db, { from: "2027-03-01", months: 2 });
    expect(mar).toMatchObject({ income: "300.50", incomeReceived: "150.00", incomeExpected: "250.50" });
    expect(apr).toMatchObject({ income: "250.50" });

    // Receiving more than expected: no negative "still due".
    await updateIncomeItem(db, first.id, { amount: 400 });
    expect((await forecast(db, { from: "2027-03-01", months: 1 }))[0]).toMatchObject({ income: "450.00" });

    for (const i of await listIncomeItems(db)) await deleteIncomeItem(db, i.id);
    expect(await listIncomeItems(db)).toEqual([]);
  });
});

test("a statement adopts movements recorded by hand before it", async () => {
  await addCreditCard(db, { bank: "Banco", name: "Otra" });
  const row = { operation_date: "2026-10-01", description: "CAFE", amount: 80 };
  const manual = await addTransaction(db, { credit_card: "Otra" }, TransactionIn.parse(row));
  const imported = await importStatement(db, StatementIn.parse({
    credit_card: "Otra", period_start: "2026-09-18", period_end: "2026-10-18", closing_date: "2026-10-18",
    due_date: "2026-11-09", transactions: [row],
  }));
  expect(imported).toMatchObject({ inserted: 0, skipped: 1, transactionIds: [manual.id] });
  const [linked] = await db.select({ s: transactions.uploadedStatementId }).from(transactions).where(eq(transactions.id, manual.id!));
  expect(linked!.s).toBe(imported.uploadedStatementId);
});

test("paymentDates: monthly and biweekly (quincenal) schedules", () => {
  expect(paymentDates("2026-10-22", 3, "monthly")).toEqual(["2026-10-22", "2026-11-22", "2026-12-22"]);
  expect(paymentDates("2026-10-01", 4, "biweekly")).toEqual(["2026-10-01", "2026-10-16", "2026-11-01", "2026-11-16"]);
  expect(paymentDates("2027-01-15", 4, "biweekly")).toEqual(["2027-01-15", "2027-01-30", "2027-02-15", "2027-02-28"]);
  expect(paymentDates("2026-10-20", 3, "biweekly")).toEqual(["2026-10-20", "2026-11-05", "2026-11-20"]);
});

describe("cash flow", () => {
  test("loans, upcoming expenses and income feed the forecast", async () => {
    await addLoan(db, LoanIn.parse({
      bank: "Banco", name: "Préstamo", principal: 10000, payment: 500, term_payments: 24, frequency: "biweekly",
      start_date: "2026-10-01",
    }));
    const [loan] = await loanStatus(db, "2026-11-01");
    expect(loan).toMatchObject({ paidCount: 2, remainingPayments: 22, remainingAmount: "11000.00", nextPayment: "2026-11-01", monthlyEquivalent: "1000.00" });

    const trip = await addUpcoming(db, UpcomingExpenseIn.parse({
      name: "Viaje", due_date: "2026-12-20", items: [{ name: "Vuelos", amount: 4000 }, { name: "Hotel", amount: 3000 }],
    }));
    const [u] = await listUpcoming(db);
    await updateUpcomingItem(db, u!.items[1]!.id, { paid: true });
    expect((await listUpcoming(db))[0]).toMatchObject({ id: trip.id, total: "7000.00", pending: "4000.00" });

    const months = await forecast(db, { from: "2026-11-01", months: 2 });
    const income = (await listIncomes(db)).reduce((s, i) => s + Number(i.amount), 0);
    expect(months[0]).toMatchObject({ loansTotal: "1000.00", upcomingTotal: "0.00", income: income.toFixed(2) });
    expect(months[1]).toMatchObject({ loansTotal: "1000.00", upcomingTotal: "4000.00" });
    expect(Number(months[1]!.cumulative)).toBeCloseTo(Number(months[0]!.net) + Number(months[1]!.net));
  });
});
