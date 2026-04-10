import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { formatAuditScore, formatNumber, formatPeriodMonth } from "../lib/format";
import { chart, chartTooltipLight } from "../theme/colors";

export type YearTrendPoint = {
  periodId: string;
  label: string;
  fullLabel: string;
  audit: number | null;
  csat: number | null;
  isCurrent: boolean;
};

function formatShortMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) {
    return period;
  }

  const formatter = new Intl.DateTimeFormat("tr-TR", { month: "short" });
  const label = formatter.format(new Date(Date.UTC(year, month - 1, 1))).replace(".", "");
  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1);
}

export function buildYearTrendPoints(input: {
  year: string;
  currentPeriodId?: string | undefined;
  points: Array<{
    periodId: string;
    period: string;
    title: string;
    audit: number | null;
    csat: number | null;
  }>;
}) {
  const pointMap = new Map(input.points.map((point) => [point.period, point]));

  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    const period = `${input.year}-${month}`;
    const point = pointMap.get(period);

    return {
      periodId: point?.periodId ?? period,
      label: formatShortMonth(period),
      fullLabel: point ? `${formatPeriodMonth(period, { includeYear: true })} • ${point.title}` : formatPeriodMonth(period, { includeYear: true }),
      audit: point?.audit ?? null,
      csat: point?.csat ?? null,
      isCurrent: point?.periodId === input.currentPeriodId
    };
  });
}

export function TrendLineCard(props: {
  title: string;
  data: YearTrendPoint[];
  metricKey: "audit" | "csat";
  color: string;
  valueFormatter: (value: number | null | undefined) => string;
  emptyMessage: string;
  yDomain: [number, number];
  yTicks?: number[] | undefined;
}) {
  const hasValues = props.data.some((item) => item[props.metricKey] !== null);

  return (
    <div className="min-w-0 rounded-[10px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] dark:border-slate-600/40 dark:bg-slate-800 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">{props.title}</h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400">
          Aylık görünüm
        </span>
      </div>

      {hasValues ? (
        <div className="mt-4 h-72 min-w-0">
          <ResponsiveContainer height="100%" minWidth={0} width="100%">
            <LineChart data={props.data} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
              <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} />
              <YAxis
                domain={props.yDomain}
                tick={{ fontSize: 11, fill: chart.axis }}
                tickFormatter={(value) =>
                  props.metricKey === "audit" ? formatAuditScore(Number(value)) : formatNumber(Number(value), 1)
                }
                tickLine={false}
                {...(props.yTicks ? { ticks: props.yTicks } : {})}
              />
              <Tooltip
                contentStyle={{ ...chartTooltipLight }}
                formatter={(value) => [props.valueFormatter(Number(value)), props.title]}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as YearTrendPoint | undefined;
                  return point?.fullLabel ?? _;
                }}
              />
              <Line
                activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }}
                connectNulls={false}
                dataKey={props.metricKey}
                dot={(dotProps) => {
                  const payload = dotProps.payload as YearTrendPoint;
                  const index = typeof dotProps.index === "number" ? dotProps.index : 0;
                  if (dotProps.cx == null || dotProps.cy == null || payload[props.metricKey] === null) {
                    return null;
                  }

                  const verticalOffset = props.metricKey === "csat" ? (index % 2 === 0 ? -14 : 18) : -14;

                  return (
                    <g>
                      <circle
                        cx={dotProps.cx}
                        cy={dotProps.cy}
                        fill={payload.isCurrent ? props.color : "#ffffff"}
                        r={payload.isCurrent ? 5 : 3.5}
                        stroke={props.color}
                        strokeWidth={payload.isCurrent ? 3 : 2}
                      />
                      <text
                        className="trend-value-label"
                        fill={props.color}
                        fontSize={11}
                        fontWeight={700}
                        paintOrder="stroke"
                        stroke="var(--trend-label-stroke, #ffffff)"
                        strokeWidth={4}
                        textAnchor="middle"
                        x={dotProps.cx}
                        y={dotProps.cy + verticalOffset}
                      >
                        {props.valueFormatter(payload[props.metricKey])}
                      </text>
                    </g>
                  );
                }}
                stroke={props.color}
                strokeLinecap="round"
                strokeWidth={3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4 flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
          {props.emptyMessage}
        </div>
      )}
    </div>
  );
}
