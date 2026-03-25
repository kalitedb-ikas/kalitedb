import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { chart } from "../theme/colors";

type MetricBarChartDatum = {
  label: string;
  value: number;
  fill?: string;
  tooltipValue?: string;
  valueLabel?: string;
};

export function MetricBarChart(props: {
  data: MetricBarChartDatum[];
  color?: string;
  description?: string;
  defs?: ReactNode;
  showValueLabels?: boolean;
  title?: string;
  tooltipMetricLabel?: string;
  valueFormatter?: (value: number, item: MetricBarChartDatum) => string;
}) {
  const formatValue = (value: number, item: MetricBarChartDatum) =>
    item.valueLabel ?? props.valueFormatter?.(value, item) ?? String(value);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      {props.title ? <h3 className="text-base font-semibold text-slate-900">{props.title}</h3> : null}
      {props.description ? <p className="mt-1 text-sm text-slate-600">{props.description}</p> : null}
      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={props.data}>
            {props.defs}
            <CartesianGrid strokeDasharray="3 3" stroke={chart.gridMuted} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: chart.axisMuted }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: chart.axisMuted }} tickLine={false} />
            <Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload?.length) {
                  return null;
                }

                const item = payload[0]?.payload as MetricBarChartDatum;
                return (
                  <div className="rounded-lg border border-slate-100 bg-white px-4 py-3 text-sm shadow-medium">
                    <p className="font-semibold text-slate-900">{label}</p>
                    <p className="mt-1 text-slate-600">
                      {props.tooltipMetricLabel ?? "Değer"}: {item.tooltipValue ?? formatValue(item.value, item)}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" fill={props.color ?? chart.barDefault} radius={[6, 6, 0, 0]}>
              {props.data.map((item) => (
                <Cell key={item.label} fill={item.fill ?? props.color ?? chart.barDefault} />
              ))}
              {props.showValueLabels ? (
                <LabelList
                  content={(labelProps: any) => {
                    const {
                      height = 0,
                      payload,
                      value = 0,
                      width = 0,
                      x = 0,
                      y = 0
                    } = labelProps as {
                      height?: number;
                      payload?: MetricBarChartDatum;
                      value?: number;
                      width?: number;
                      x?: number;
                      y?: number;
                    };

                    if (!payload || height < 20) {
                      return null;
                    }

                    return (
                      <text
                        dominantBaseline="middle"
                        fill="#ffffff"
                        fontSize={12}
                        fontWeight={600}
                        textAnchor="middle"
                        x={x + width / 2}
                        y={y + height / 2}
                      >
                        {formatValue(value, payload)}
                      </text>
                    );
                  }}
                  dataKey="value"
                />
              ) : null}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
