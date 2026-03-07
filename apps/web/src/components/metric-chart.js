import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
export function MetricBarChart(props) {
    return (_jsx("div", { className: "h-80 rounded-3xl border border-slate-200 bg-white p-4 shadow-panel", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: props.data, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#e2e8f0" }), _jsx(XAxis, { dataKey: "label", tick: { fontSize: 12 } }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: "value", fill: props.color ?? "#0B2239", radius: [10, 10, 0, 0] })] }) }) }));
}
