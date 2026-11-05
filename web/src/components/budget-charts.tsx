/** Budget chart: spending plan by category (donut), plus a dynamic "Restante" slice for the monthly income left unbudgeted. */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BudgetItem, Income } from "../api";
import { Card, chipHues, money } from "../ui";

const sum = (xs: { amount: string }[]) => xs.reduce((s, x) => s + Number(x.amount), 0);

const REMAINING = "Restante";
const color = (name: string, hues: Map<string, number>) =>
  name === REMAINING ? "var(--text-muted)" : `hsl(${hues.get(name)} 60% 52%)`;

/** Income left after the budgeted categories; negative when the budget exceeds it. */
export function remainingOf(categories: { value: number }[], total: number): number {
  return total - categories.reduce((s, c) => s + c.value, 0);
}

export function BudgetPie({ items, incomes }: { items: BudgetItem[]; incomes: Income[] }) {
  const active = items.filter((i) => i.active && i.currency === "MXN");
  const hues = chipHues(active.map((i) => i.category ?? "Sin categoría"));
  const data = [...hues.keys()]
    .map((name) => ({ name, value: sum(active.filter((i) => (i.category ?? "Sin categoría") === name)) }))
    .sort((a, b) => b.value - a.value);
  const budgeted = data.reduce((s, d) => s + d.value, 0);
  const income = sum(incomes.filter((i) => i.currency === "MXN"));
  const remaining = remainingOf(data, income);
  if (remaining > 0) data.push({ name: REMAINING, value: remaining });
  // With income registered, shares are of the salary; otherwise of the budget.
  const total = Math.max(income, budgeted);

  return (
    <Card title="Presupuesto por categoría">
      <div className="pie">
        <div className="pie-chart">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={70} outerRadius={120} stroke="var(--surface-1)">
              {data.map((d) => <Cell key={d.name} fill={color(d.name, hues)} />)}
            </Pie>
            <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8 }}
              itemStyle={{ color: "var(--text-primary)" }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pie-center">
          <span className="muted small">{income > 0 ? "Ingreso" : "Total"}</span><strong>{money(income > 0 ? income : budgeted)}</strong>
        </div>
        </div>
        <ul className="pie-legend">
          {data.map((d) => (
            <li key={d.name}>
              <span className="swatch" style={{ background: color(d.name, hues) }} />
              <span>{d.name}</span>
              <span className="muted">{total ? Math.round((d.value / total) * 100) : 0}%</span>
              <span className="num">{money(d.value)}</span>
            </li>
          ))}
        </ul>
      </div>
      {income > 0 && remaining < 0 && <p className="note">El presupuesto excede el ingreso mensual por {money(-remaining)}.</p>}
    </Card>
  );
}
