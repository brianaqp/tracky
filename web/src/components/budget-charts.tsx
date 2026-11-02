/** Budget chart: spending plan by category (donut). */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BudgetItem } from "../api";
import { Card, chipHues, money } from "../ui";

const sum = (xs: { amount: string }[]) => xs.reduce((s, x) => s + Number(x.amount), 0);

export function BudgetPie({ items }: { items: BudgetItem[] }) {
  const active = items.filter((i) => i.active && i.currency === "MXN");
  const hues = chipHues(active.map((i) => i.category ?? "Sin categoría"));
  const data = [...hues.keys()]
    .map((name) => ({ name, value: sum(active.filter((i) => (i.category ?? "Sin categoría") === name)) }))
    .sort((a, b) => b.value - a.value);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card title="Presupuesto por categoría">
      <div className="pie">
        <div className="pie-chart">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={70} outerRadius={120} stroke="var(--surface-1)">
              {data.map((d) => <Cell key={d.name} fill={`hsl(${hues.get(d.name)} 60% 52%)`} />)}
            </Pie>
            <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8 }}
              itemStyle={{ color: "var(--text-primary)" }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pie-center"><span className="muted small">Total</span><strong>{money(total)}</strong></div>
        </div>
        <ul className="pie-legend">
          {data.map((d) => (
            <li key={d.name}>
              <span className="swatch" style={{ background: `hsl(${hues.get(d.name)} 60% 52%)` }} />
              <span>{d.name}</span>
              <span className="muted">{total ? Math.round((d.value / total) * 100) : 0}%</span>
              <span className="num">{money(d.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
