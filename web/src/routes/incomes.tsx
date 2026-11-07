import { Form, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { type Bank, get, type Income as IncomeRow, type IncomeItem } from "../api";
import { Income } from "../components/income";
import { IncomeItems } from "../components/income-items";
import { month as monthName } from "../ui";

export async function loader({ request }: LoaderFunctionArgs) {
  const month = new URL(request.url).searchParams.get("month") ?? new Date().toLocaleDateString("en-CA").slice(0, 7);
  const [incomes, items, banks] = await Promise.all([
    get<IncomeRow[]>("incomes", { month }),
    get<IncomeItem[]>("income-items", { month }),
    get<Bank[]>("accounts"),
  ]);
  return { incomes, items, accounts: banks.flatMap((b) => b.debitAccounts), month };
}

export default function Incomes() {
  const { incomes, items, accounts, month } = useLoaderData<typeof loader>();
  const label = monthName(month);
  return (
    <>
      <h1>Ingresos</h1>
      <Form method="get" className="filters">
        <input type="month" name="month" aria-label="Mes" defaultValue={month} key={month}
          onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </Form>
      <Income incomes={incomes} monthLabel={label} />
      <IncomeItems items={items} incomes={incomes} accounts={accounts} month={month} monthLabel={label} />
    </>
  );
}
