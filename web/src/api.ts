/** Typed fetchers for the tracky /api routes (proxied by Vite, which adds the API key). */

export type Transaction = {
  id: number; operationDate: string; chargeDate: string | null; description: string; amount: string;
  currency: string; kind: string; category: string | null; source: string | null; notes: string | null;
  installmentPlanId: number | null; installmentNumber: number | null;
};
export type Category = { id: number; name: string };
export type Group = { group: string; total: string; movements: number };
export type BudgetItem = {
  id: number; name: string; category: string | null; amount: string; currency: string; payday: number | null;
  creditCard: string | null; debitAccount: string | null; notes: string | null; active: boolean;
};
export type BudgetVsActual = { category: string; budget: string; actual: string; difference: string };
export type Installment = {
  id: number; description: string; creditCard: string; totalAmount: string; months: number; monthlyAmount: string;
  purchaseDate: string; firstPaymentDate: string; paidCount: number; paidAmount: string; remainingAmount: string;
  remainingPayments: number; schedule: { number: number; date: string; amount: string; paid: boolean }[];
};
export type ForecastMonth = {
  month: string; budget: string; installmentsTotal: string; loansTotal: string; total: string;
  installments: { description: string; creditCard: string; number: number; of: number; amount: string; date: string }[];
  loans: { name: string; amount: string; date: string }[];
};
export type Statement = {
  id: number; periodStart: string; periodEnd: string; closingDate: string; dueDate: string;
  previousBalance: string | null; paymentNoInterest: string | null; minimumPayment: string | null; creditCard?: string;
};
export type Bank = {
  id: number; name: string;
  creditCards: {
    id: number; name: string; last4: string | null; closingDay: number | null; dueDay: number | null;
    creditLimit: string | null; latestStatement: Statement | null;
  }[];
  debitAccounts: { id: number; name: string; last4: string | null }[];
  loans: { id: number; name: string; principal: string; monthlyPayment: string; termMonths: number; startDate: string }[];
};
export type Ticket = {
  id: number; store: string; purchaseDate: string; total: string; transactionId: number | null; notes: string | null;
  items: { product: string; productCategory: string | null; quantity: number; total: string }[];
};
export type ProductGroup = { group: string; total: string; items: number };
export type Income = { id: number; name: string; amount: string; currency: string; payday: number | null };

export async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  const res = await fetch(`/api/${path}${qs.size ? `?${qs}` : ""}`);
  if (!res.ok) throw new Response((await res.json().catch(() => null))?.error ?? res.statusText, { status: res.status });
  return res.json();
}

/** Writes (POST/PATCH/DELETE). Throws an Error with the server's message so callers can show it inline. */
export async function send<T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data;
}
