import { useLoaderData } from "react-router";
import { get, type Income as IncomeRow } from "../api";
import { Income } from "../components/income";

export async function loader() {
  return { incomes: await get<IncomeRow[]>("incomes") };
}

export default function Incomes() {
  const { incomes } = useLoaderData<typeof loader>();
  return (
    <>
      <h1>Ingresos</h1>
      <Income incomes={incomes} />
    </>
  );
}
