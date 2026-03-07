import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function MetricBarChart(props: {
  data: Array<{ label: string; value: number }>;
  color?: string;
}) {
  return (
    <div className="h-80 rounded-3xl border border-slate-200 bg-white p-4 shadow-panel">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={props.data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill={props.color ?? "#0B2239"} radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

