import { selectDefaultReportPeriod } from "@kalitedb/shared";
import type { SalesKpiAgent } from "@kalitedb/shared";
import { SectionCard } from "@kalitedb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";

import { useAuth } from "../lib/auth";
import { useDarkMode } from "../lib/use-dark-mode";
import { api } from "../lib/api";
import { formatNumber, formatPercent, formatPeriodMonth, parseTalkDurationLabelToSeconds } from "../lib/format";
import { brand, chartTooltipLight, chartTooltipDark } from "../theme/colors";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import {
  QUARTER_SHORT,
  aggregateMultiPeriodKpi,
  computeActivePeriodIds,
  derivePeriodRangeSelectors
} from "../lib/period-aggregation";
import { CompareMetricRow } from "../components/compare/compare-metric-row";

/* ── Formatters ── */

function formatTryCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR").format(value) + " TRY";
}

function formatHms(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ── Toplam hesaplama ── */

function computeTotals(agents: SalesKpiAgent[]) {
  const count = agents.length;
  if (count === 0) return null;

  const scored = agents.filter((a): a is SalesKpiAgent & { perfScore: number } => a.perfScore !== null);

  return {
    salesAmount: agents.reduce((s, a) => s + a.salesAmount, 0),
    licenseCount: agents.reduce((s, a) => s + a.licenseCount, 0),
    avgLicensePrice: count > 0 ? agents.reduce((s, a) => s + a.avgLicensePrice, 0) / count : 0,
    avgPerfScore: scored.length > 0 ? scored.reduce((s, a) => s + a.perfScore, 0) / scored.length : null,
    avgConversionRate: count > 0 ? agents.reduce((s, a) => s + a.conversionRate, 0) / count : 0,
    totalCallAttempts: agents.reduce((s, a) => s + a.callAttempts, 0),
    avgTalkDurationSeconds: count > 0 ? agents.reduce((s, a) => s + a.talkDurationSeconds, 0) / count : 0,
    totalTalkDurationSeconds: agents.reduce((s, a) => s + a.talkDurationSeconds, 0),
    totalScaleCount: agents.reduce((s, a) => s + (a.scaleCount ?? 0), 0),
    totalScalePlusCount: agents.reduce((s, a) => s + (a.scalePlusCount ?? 0), 0),
    avgScaleConversion: count > 0 ? agents.reduce((s, a) => s + (a.scaleConversion ?? 0), 0) / count : 0,
    avgScalePlusConversion: count > 0 ? agents.reduce((s, a) => s + (a.scalePlusConversion ?? 0), 0) / count : 0,
    avgTotalConversion: count > 0 ? agents.reduce((s, a) => s + (a.totalConversion ?? 0), 0) / count : 0,
    agentCount: count
  };
}

/* ── Dönem veri hook'u ── */

function makeDefaultPeriodRange(monthOffset: number): () => PeriodRangeValue {
  return () => {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const year = String(target.getFullYear());
    const quarter = Math.ceil((target.getMonth() + 1) / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  };
}

function useCompanySideData(
  auth: { token: string | null },
  salesPeriods: any[],
  periodRange: PeriodRangeValue,
  setPeriodRange: (fn: (prev: PeriodRangeValue) => PeriodRangeValue) => void
) {
  const yearPeriods = useMemo(() => {
    return derivePeriodRangeSelectors(salesPeriods, periodRange.year).yearPeriods;
  }, [salesPeriods, periodRange.year]);

  const now = new Date();
  const defaultPeriod = useMemo(() => {
    const prev = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
    return yearPeriods.find((p) => p.month === prev) ?? selectDefaultReportPeriod(yearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearPeriods]);

  const periodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId) ? periodRange.monthPeriodId : defaultPeriod?.id;

  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
  }, [defaultPeriod?.id, periodRange.monthPeriodId, setPeriodRange]);

  const activePeriodIds = useMemo(
    () => computeActivePeriodIds(yearPeriods, { ...periodRange, monthPeriodId: periodId }),
    [periodRange, periodId, yearPeriods]
  );

  const kpiQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["sales-company-kpi", auth.token, activePeriodIds.join(",")],
    queryFn: async () => {
      const results = await Promise.all(activePeriodIds.map((pid) => api.getSalesKpiData(auth.token, pid)));
      return results.length === 1 ? results[0] : aggregateMultiPeriodKpi(results);
    },
    staleTime: 60 * 1000
  });

  const agents: SalesKpiAgent[] = kpiQuery.data && "agents" in kpiQuery.data ? kpiQuery.data.agents : [];
  const targets = kpiQuery.data && "targets" in kpiQuery.data ? (kpiQuery.data as any).targets ?? null : null;
  const totals = useMemo(() => computeTotals(agents), [agents]);

  return { kpiQuery, agents, targets, totals, periodId, yearPeriods };
}

/* ── Dönem etiketi ── */

function usePeriodLabel(
  yearPeriods: any[],
  periodRange: PeriodRangeValue,
  periodId: string | undefined
) {
  return useMemo(() => {
    if (periodRange.viewMode === "aylik") {
      const p = yearPeriods.find((pp: any) => pp.id === periodId);
      return p ? formatPeriodMonth(p.month) : "Dönem";
    }
    if (periodRange.viewMode === "ceyreklik") {
      return `${periodRange.year} ${QUARTER_SHORT[(periodRange.quarter ?? 1) - 1]}`;
    }
    return `${periodRange.year} (Yıllık)`;
  }, [periodRange, periodId, yearPeriods]);
}

/* ── Sayfa ── */

export function SalesCompanyComparePage() {
  const auth = useAuth();
  const { isDark } = useDarkMode();
  const tooltipStyle = isDark ? { ...chartTooltipDark } : { ...chartTooltipLight };

  /* Dönem filtreleri — sol varsayılan bir önceki ay, sağ mevcut ay */
  const [periodRangeA, setPeriodRangeA] = useState<PeriodRangeValue>(makeDefaultPeriodRange(1));
  const [periodRangeB, setPeriodRangeB] = useState<PeriodRangeValue>(makeDefaultPeriodRange(0));

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const salesPeriods = useMemo(
    () => [...(periodsQuery.data ?? [])].filter((p) => (p.department ?? "cs") === "sales").sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const sideA = useCompanySideData(auth, salesPeriods, periodRangeA, setPeriodRangeA);
  const sideB = useCompanySideData(auth, salesPeriods, periodRangeB, setPeriodRangeB);

  const labelA = usePeriodLabel(sideA.yearPeriods, periodRangeA, sideA.periodId);
  const labelB = usePeriodLabel(sideB.yearPeriods, periodRangeB, sideB.periodId);

  const totalsA = sideA.totals;
  const totalsB = sideB.totals;

  /* Radar verisi */
  const radarData = useMemo(() => {
    if (!totalsA && !totalsB) return [];
    const targets = sideA.targets;

    const norm = (actual: number | null | undefined, target: number | null | undefined) => {
      if (actual == null || target == null || target <= 0) return 0;
      return Math.min(100, (actual / target) * 100);
    };

    const talkTargetSeconds =
      targets?.talkDurationTargetSeconds ?? parseTalkDurationLabelToSeconds(targets?.talkDurationLabel ?? "");

    const metrics = [
      { metric: "Satış", a: totalsA?.salesAmount, b: totalsB?.salesAmount, target: targets?.salesAmount },
      { metric: "Lisans", a: totalsA?.licenseCount, b: totalsB?.licenseCount, target: targets?.licenseCount != null && totalsA ? targets.licenseCount * totalsA.agentCount : null },
      { metric: "Performans", a: totalsA?.avgPerfScore, b: totalsB?.avgPerfScore, target: targets?.perfScore },
      { metric: "Dönüşüm", a: totalsA?.avgConversionRate, b: totalsB?.avgConversionRate, target: targets?.conversionRate },
      { metric: "Arama", a: totalsA?.totalCallAttempts, b: totalsB?.totalCallAttempts, target: targets?.callAttempts != null && totalsA ? targets.callAttempts * totalsA.agentCount : null },
      { metric: "Konuşma", a: totalsA?.totalTalkDurationSeconds, b: totalsB?.totalTalkDurationSeconds, target: talkTargetSeconds != null && totalsA ? talkTargetSeconds * totalsA.agentCount : null }
    ];

    return metrics.map((m) => ({
      metric: m.metric,
      left: norm(m.a, m.target),
      right: norm(m.b, m.target)
    }));
  }, [totalsA, totalsB, sideA.targets]);

  const hasData = totalsA || totalsB;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Şirket Karşılaştırma"
        actions={
          <Link
            to="/sales/kpi"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-white/72 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white/90 dark:border-slate-600/50 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700/80"
          >
            <ArrowLeft size={14} />
            KPI
          </Link>
        }
      >
        {/* Dönem seçiciler */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/40 dark:bg-slate-800/30">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Sol</span>
            <PeriodRangeFilter onChange={setPeriodRangeA} periods={salesPeriods} value={{ ...periodRangeA, monthPeriodId: sideA.periodId }} />
          </div>
          <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/40 dark:bg-slate-800/30">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Sağ</span>
            <PeriodRangeFilter onChange={setPeriodRangeB} periods={salesPeriods} value={{ ...periodRangeB, monthPeriodId: sideB.periodId }} />
          </div>
        </div>

        {!hasData ? (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Seçilen dönemlerde veri bulunamadı.
          </p>
        ) : (
          <div className="space-y-6">
            {/* Özet kartları */}
            <div className="relative grid gap-6 lg:grid-cols-2">
              <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-px bg-slate-200 dark:bg-slate-700 lg:block" />
              <PeriodSummaryCard label={labelA} totals={totalsA} targets={sideA.targets} />
              <PeriodSummaryCard label={labelB} totals={totalsB} targets={sideB.targets} />
            </div>

            {/* Radar chart */}
            {radarData.length > 0 && totalsA && totalsB && (
              <SectionCard title="Radar Karşılaştırma">
                <div className="mx-auto h-72 max-w-md">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"} />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{ fontSize: 11, fill: isDark ? "rgba(255,255,255,0.6)" : "#64748b" }}
                      />
                      <Radar
                        name={labelA}
                        dataKey="left"
                        stroke={brand.primary}
                        fill={brand.primary}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                      <Radar
                        name={labelB}
                        dataKey="right"
                        stroke={brand.accent}
                        fill={brand.accent}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                      <Tooltip
                        contentStyle={{
                          ...tooltipStyle,
                          borderRadius: "8px",
                          border: "none",
                          fontSize: "12px"
                        }}
                        formatter={(value) => `${Math.round(Number(value))}%`}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex items-center justify-center gap-6 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: brand.primary }} />
                    {labelA}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: brand.accent }} />
                    {labelB}
                  </span>
                </div>
              </SectionCard>
            )}

            {/* Metrik karşılaştırma */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Detaylı Karşılaştırma</h3>

              <div className="space-y-1.5">
                <CompareMetricRow label="Toplam Satış" leftValue={totalsA?.salesAmount} rightValue={totalsB?.salesAmount} format={formatTryCurrency} />
                <CompareMetricRow label="Toplam Lisans" leftValue={totalsA?.licenseCount} rightValue={totalsB?.licenseCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Ort. Perf. Değ." leftValue={totalsA?.avgPerfScore} rightValue={totalsB?.avgPerfScore} format={(v) => formatNumber(v, 1)} />
                <CompareMetricRow label="Ort. Lisans Fiyatı" leftValue={totalsA?.avgLicensePrice} rightValue={totalsB?.avgLicensePrice} format={formatTryCurrency} />
                <CompareMetricRow label="Ort. Dönüşüm" leftValue={totalsA?.avgConversionRate} rightValue={totalsB?.avgConversionRate} format={formatPercent} />
                <CompareMetricRow label="Toplam Arama" leftValue={totalsA?.totalCallAttempts} rightValue={totalsB?.totalCallAttempts} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Ort. Konuşma" leftValue={totalsA?.avgTalkDurationSeconds} rightValue={totalsB?.avgTalkDurationSeconds} format={formatHms} />
                <CompareMetricRow label="Top. Konuşma" leftValue={totalsA?.totalTalkDurationSeconds} rightValue={totalsB?.totalTalkDurationSeconds} format={formatHms} />
                <CompareMetricRow label="Scale 2+1" leftValue={totalsA?.totalScaleCount} rightValue={totalsB?.totalScaleCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Scale+ 2+1" leftValue={totalsA?.totalScalePlusCount} rightValue={totalsB?.totalScalePlusCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Ort. Scale %" leftValue={totalsA?.avgScaleConversion} rightValue={totalsB?.avgScaleConversion} format={formatPercent} />
                <CompareMetricRow label="Ort. Scale+ %" leftValue={totalsA?.avgScalePlusConversion} rightValue={totalsB?.avgScalePlusConversion} format={formatPercent} />
                <CompareMetricRow label="Ort. Toplam %" leftValue={totalsA?.avgTotalConversion} rightValue={totalsB?.avgTotalConversion} format={formatPercent} />
                <CompareMetricRow label="Temsilci Sayısı" leftValue={totalsA?.agentCount} rightValue={totalsB?.agentCount} format={(v) => formatNumber(v)} />
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ── Dönem özet kartı ── */

function PeriodSummaryCard(props: {
  label: string;
  totals: ReturnType<typeof computeTotals>;
  targets: any;
}) {
  const { label, totals, targets } = props;

  if (!totals) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-[10px] border border-dashed border-slate-300 bg-slate-50/50 dark:border-slate-600 dark:bg-slate-800/30">
        <p className="text-sm text-slate-400 dark:text-slate-500">Veri yok</p>
      </div>
    );
  }

  const targetPercent = targets?.salesAmount ? (totals.salesAmount / targets.salesAmount) * 100 : null;

  return (
    <div className="surface-default rounded-[10px] border border-white/75 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:shadow-none">
      <h3 className="font-display text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
        {label}
      </h3>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Toplam Satış</span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatTryCurrency(totals.salesAmount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Toplam Lisans</span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatNumber(totals.licenseCount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Ort. Dönüşüm</span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatPercent(totals.avgConversionRate)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Temsilci</span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{totals.agentCount}</span>
        </div>
        {targetPercent != null && (
          <div className="pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Hedefe ulaşma</span>
              <span className={[
                "font-bold",
                targetPercent >= 100 ? "text-emerald-600 dark:text-emerald-400" : targetPercent >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
              ].join(" ")}>
                %{formatNumber(targetPercent, 1)}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                className={[
                  "h-full rounded-full transition-all duration-500",
                  targetPercent >= 100 ? "bg-emerald-500" : targetPercent >= 70 ? "bg-amber-500" : "bg-red-500"
                ].join(" ")}
                style={{ width: `${Math.min(targetPercent, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
