import { PageHeader, SurfaceCard } from "@kalitedb/ui";
import { selectDefaultReportPeriod } from "@kalitedb/shared";
import type { SalesKpiAgent } from "@kalitedb/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber, formatPeriodMonth } from "../lib/format";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import {
  QUARTER_SHORT,
  aggregateMultiPeriodKpi,
  computeActivePeriodIds,
  derivePeriodRangeSelectors
} from "../lib/period-aggregation";

/* ── Formatters ── */

function formatCurrency(value: number | null): string {
  if (value === null) return "-";
  return formatNumber(value) + " TRY";
}

function formatHMS(totalSeconds: number | null): string {
  if (totalSeconds === null) return "-";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ── Calculations ── */

function computeSummary(agents: SalesKpiAgent[]) {
  const scored = agents.filter((a): a is SalesKpiAgent & { perfScore: number } => a.perfScore !== null);
  const count = agents.length;

  const avgPerfScore = scored.length > 0 ? scored.reduce((s, a) => s + a.perfScore, 0) / scored.length : null;
  const avgSalesAmount = count > 0 ? agents.reduce((s, a) => s + a.salesAmount, 0) / count : 0;
  const avgLicenseCount = count > 0 ? agents.reduce((s, a) => s + a.licenseCount, 0) / count : 0;
  const avgLicensePrice = count > 0 ? agents.reduce((s, a) => s + a.avgLicensePrice, 0) / count : 0;
  const avgTalkDuration = count > 0 ? agents.reduce((s, a) => s + a.talkDurationSeconds, 0) / count : 0;
  const avgCallAttempts = count > 0 ? agents.reduce((s, a) => s + a.callAttempts, 0) / count : 0;
  const avgConversion = count > 0 ? agents.reduce((s, a) => s + a.conversionRate, 0) / count : 0;
  const avgScaleCount = count > 0 ? agents.reduce((s, a) => s + (a.scaleCount ?? 0), 0) / count : 0;
  const avgScalePlusCount = count > 0 ? agents.reduce((s, a) => s + (a.scalePlusCount ?? 0), 0) / count : 0;
  const avgScaleConversion = count > 0 ? agents.reduce((s, a) => s + (a.scaleConversion ?? 0), 0) / count : 0;
  const avgScalePlusConversion = count > 0 ? agents.reduce((s, a) => s + (a.scalePlusConversion ?? 0), 0) / count : 0;
  const avgTotalConversion = count > 0 ? agents.reduce((s, a) => s + (a.totalConversion ?? 0), 0) / count : 0;

  const totalSalesAmount = agents.reduce((s, a) => s + a.salesAmount, 0);
  const totalLicenseCount = agents.reduce((s, a) => s + a.licenseCount, 0);
  const totalCallAttempts = agents.reduce((s, a) => s + a.callAttempts, 0);
  const totalScaleCount = agents.reduce((s, a) => s + (a.scaleCount ?? 0), 0);
  const totalScalePlusCount = agents.reduce((s, a) => s + (a.scalePlusCount ?? 0), 0);

  return {
    avg: { perfScore: avgPerfScore, salesAmount: avgSalesAmount, licenseCount: avgLicenseCount, avgLicensePrice: avgLicensePrice, talkDuration: avgTalkDuration, callAttempts: avgCallAttempts, conversionRate: avgConversion, scaleCount: avgScaleCount, scalePlusCount: avgScalePlusCount, scaleConversion: avgScaleConversion, scalePlusConversion: avgScalePlusConversion, totalConversion: avgTotalConversion },
    total: { salesAmount: totalSalesAmount, licenseCount: totalLicenseCount, callAttempts: totalCallAttempts, scaleCount: totalScaleCount, scalePlusCount: totalScalePlusCount }
  };
}

/* ── Sorting ── */

type SortKey = "agentName" | "perfScore" | "salesAmount" | "licenseCount" | "avgLicensePrice" | "talkDurationSeconds" | "callAttempts" | "conversionRate" | "scaleCount" | "scaleConversion" | "scalePlusCount" | "scalePlusConversion" | "totalConversion";
type SortDir = "asc" | "desc";

function getSortValue(agent: SalesKpiAgent, key: SortKey): number | string {
  const v = agent[key];
  if (v === null) return -Infinity;
  return v;
}

/* ── Component ── */

export function SalesKpiPage() {
  const auth = useAuth();
  const now = new Date();
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  });
  const [sortKey, setSortKey] = useState<SortKey | null>("salesAmount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const selectedYear = periodRange.year;
  const viewMode = periodRange.viewMode;
  const selectedQuarter = periodRange.quarter ?? 1;

  /* ── Dönemler ── */
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const salesPeriods = useMemo(
    () =>
      [...(periodsQuery.data ?? [])]
        .filter((p) => (p.department ?? "cs") === "sales")
        .sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const { yearPeriods } = useMemo(
    () => derivePeriodRangeSelectors(salesPeriods, selectedYear),
    [salesPeriods, selectedYear]
  );

  /* ── Seçili dönem ── */
  const defaultPeriod = useMemo(() => {
    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(
      now.getMonth() === 0 ? 12 : now.getMonth()
    ).padStart(2, "0")}`;
    return yearPeriods.find((p) => p.month === prevMonth) ?? selectDefaultReportPeriod(yearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearPeriods]);
  const monthlyPeriodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId)
    ? periodRange.monthPeriodId
    : defaultPeriod?.id;
  const selectedPeriod = yearPeriods.find((p) => p.id === monthlyPeriodId);

  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) {
      setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
    }
  }, [defaultPeriod?.id, periodRange.monthPeriodId]);

  const activePeriodIds = useMemo(
    () =>
      computeActivePeriodIds(yearPeriods, {
        ...periodRange,
        monthPeriodId: monthlyPeriodId
      }),
    [periodRange, monthlyPeriodId, yearPeriods]
  );

  /* ── KPI verisi ── */
  const kpiQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["sales-kpi", auth.token, activePeriodIds.join(",")],
    queryFn: async () => {
      if (activePeriodIds.length === 1) {
        return api.getSalesKpiData(auth.token, activePeriodIds[0]!);
      }
      const results = await Promise.all(
        activePeriodIds.map((pid) => api.getSalesKpiData(auth.token, pid))
      );
      return aggregateMultiPeriodKpi(results);
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const kpiData = kpiQuery.data;
  const agents: SalesKpiAgent[] =
    kpiData && "agents" in kpiData ? ((kpiData as any).agents ?? []) : [];
  const targets = kpiData && "targets" in kpiData ? (kpiData as any).targets ?? null : null;
  const summary = useMemo(() => computeSummary(agents), [agents]);

  const sortedAgents = useMemo(() => {
    if (!sortKey) return agents;
    return [...agents].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [agents, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const monthLabel = useMemo(() => {
    if (viewMode === "aylik") {
      return selectedPeriod
        ? formatPeriodMonth(selectedPeriod.month).toLocaleUpperCase("tr-TR")
        : "AY";
    }
    if (viewMode === "ceyreklik") {
      return `${selectedYear} ${QUARTER_SHORT[selectedQuarter - 1]}`;
    }
    return `${selectedYear} (YILLIK)`;
  }, [viewMode, selectedPeriod, selectedYear, selectedQuarter]);

  const isLoading = periodsQuery.isPending || kpiQuery.isPending;
  const hasData = kpiData && agents.length > 0 && targets;

  /* ── Hedef karşılaştırma yüzdesi ── */
  const targetPercent = useMemo(() => {
    if (!targets || summary.total.salesAmount === 0 || targets.salesAmount === 0) return 0;
    return (summary.total.salesAmount / targets.salesAmount) * 100;
  }, [summary.total.salesAmount, targets]);

  const tdCls = "px-4 py-3 text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap";
  const tdCenterCls = "px-4 py-3 text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap text-center";

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const thBase = "px-4 py-3 text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap cursor-pointer select-none hover:bg-emerald-700 dark:hover:bg-emerald-800 transition-colors";

  const sortTh = (label: string, key: SortKey, align: "left" | "center" = "center") => (
    <th
      className={`${thBase} ${align === "left" ? "text-left" : "text-center"}`}
      onClick={() => toggleSort(key)}
    >
      {label}{sortArrow(key)}
    </th>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPI"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodRangeFilter
              onChange={setPeriodRange}
              periods={salesPeriods}
              value={{ ...periodRange, monthPeriodId: monthlyPeriodId }}
            />
            <Link
              to="/sales/kpi/target-calibration"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-white/72 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white/90 dark:border-slate-600/50 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700/80"
            >
              <Target size={14} />
              Hedef Kalibrasyonu
            </Link>
            <Link
              to="/sales/kpi/compare"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-white/72 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white/90 dark:border-slate-600/50 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700/80"
            >
              <ArrowLeftRight size={14} />
              Karşılaştır
            </Link>
          </div>
        }
      />

      {isLoading ? (
        <SurfaceCard title="Yükleniyor..." variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">Veriler yükleniyor...</p>
        </SurfaceCard>
      ) : !hasData ? (
        <SurfaceCard title="Henüz veri yok" variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Seçilen dönem için KPI verisi bulunamadı. Yönetim panelinden CSV dosyası yükleyerek veri aktarabilirsiniz.
          </p>
        </SurfaceCard>
      ) : (
        <>
          {/* Hedef ilerleme özeti */}
          <div className="grid gap-4 sm:grid-cols-3">
            <SurfaceCard variant="default">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Toplam Satış</p>
                  <p className="mt-1 font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {formatCurrency(summary.total.salesAmount)}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Hedef</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(targets.salesAmount)}</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-400">Hedefe ulaşma</span>
                  <span className={[
                    "font-bold",
                    targetPercent >= 100 ? "text-emerald-600 dark:text-emerald-400" : targetPercent >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                  ].join(" ")}>
                    %{formatNumber(targetPercent, 1)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className={[
                      "h-full rounded-full transition-all duration-500",
                      targetPercent >= 100 ? "bg-emerald-500" : targetPercent >= 70 ? "bg-amber-500" : "bg-red-500"
                    ].join(" ")}
                    style={{ width: `${Math.min(targetPercent, 100)}%` }}
                  />
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard variant="default">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Toplam Lisans</p>
                  <p className="mt-1 font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {formatNumber(summary.total.licenseCount)}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Hedef (kişi başı)</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatNumber(targets.licenseCount)}</p>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard variant="default">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Ort. Dönüşüm Oranı</p>
                  <p className="mt-1 font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    %{formatNumber(summary.avg.conversionRate, 2)}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Hedef</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">%{formatNumber(targets.conversionRate, 2)}</p>
                </div>
              </div>
            </SurfaceCard>
          </div>

          {/* KPI Tablosu */}
          <SurfaceCard variant="default">
            <div className="-m-5 overflow-x-auto sm:-m-6">
              <table className="min-w-full">
                {/* Başlık satırı */}
                <thead>
                  <tr className="bg-emerald-800 dark:bg-emerald-900">
                    {sortTh("KPI's", "agentName", "left")}
                    {sortTh("Perf. Değ.", "perfScore")}
                    {sortTh(monthLabel, "salesAmount")}
                    {sortTh("Lisans Adeti", "licenseCount")}
                    {sortTh("Ort. Lisans Fiyatı", "avgLicensePrice")}
                    {sortTh("Top. Konuşma Süresi", "talkDurationSeconds")}
                    {sortTh("Arama Denemesi", "callAttempts")}
                    {sortTh("Dönüşüm Oranı", "conversionRate")}
                    {sortTh("Scale 2+1", "scaleCount")}
                    {sortTh("Scale %", "scaleConversion")}
                    {sortTh("Scale+ 2+1", "scalePlusCount")}
                    {sortTh("Scale+ %", "scalePlusConversion")}
                    {sortTh("Toplam %", "totalConversion")}
                  </tr>
                </thead>

                <tbody>
                  {/* Hedef satırı */}
                  <tr className="bg-emerald-800 dark:bg-emerald-900">
                    <td className="px-4 py-2.5 text-sm font-bold text-white/70 whitespace-nowrap" />
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">
                      {formatNumber(targets.perfScore)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">
                      {formatCurrency(targets.salesAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">
                      {formatNumber(targets.licenseCount)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">
                      {formatCurrency(targets.avgLicensePrice)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">
                      {targets.talkDurationLabel}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">
                      {formatNumber(targets.callAttempts)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">
                      %{formatNumber(targets.conversionRate, 2)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                  </tr>

                  {/* Temsilci satırları */}
                  {sortedAgents.map((agent, idx) => (
                    <tr
                      key={agent.agentKey}
                      className={[
                        "border-b border-slate-200/70 transition-colors hover:bg-slate-50/80 dark:border-slate-700/50 dark:hover:bg-slate-700/30",
                        idx % 2 === 0
                          ? "bg-white dark:bg-slate-800/30"
                          : "bg-slate-50/50 dark:bg-slate-800/50"
                      ].join(" ")}
                    >
                      <td className={`${tdCls} font-semibold`}>{agent.agentName}</td>
                      <td className={tdCenterCls}>
                        {agent.perfScore !== null ? (
                          <span className={
                            agent.perfScore >= targets.perfScore
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }>
                            {formatNumber(agent.perfScore, Number.isInteger(agent.perfScore) ? 0 : 2)}
                          </span>
                        ) : (
                          <span className="text-slate-400">*</span>
                        )}
                      </td>
                      <td className={tdCenterCls}>{formatCurrency(agent.salesAmount)}</td>
                      <td className={tdCenterCls}>
                        <span className={
                          agent.licenseCount >= targets.licenseCount
                            ? "text-emerald-700 dark:text-emerald-400"
                            : ""
                        }>
                          {formatNumber(agent.licenseCount)}
                        </span>
                      </td>
                      <td className={tdCenterCls}>{formatCurrency(agent.avgLicensePrice)}</td>
                      <td className={tdCenterCls}>{formatHMS(agent.talkDurationSeconds)}</td>
                      <td className={tdCenterCls}>{formatNumber(agent.callAttempts)}</td>
                      <td className={tdCenterCls}>
                        <span className={
                          agent.conversionRate >= targets.conversionRate
                            ? "text-emerald-700 dark:text-emerald-400"
                            : ""
                        }>
                          {formatNumber(agent.conversionRate, 2)}%
                        </span>
                      </td>
                      <td className={tdCenterCls}>{formatNumber(agent.scaleCount ?? 0)}</td>
                      <td className={tdCenterCls}>{formatNumber(agent.scaleConversion ?? 0, 2)}%</td>
                      <td className={tdCenterCls}>{formatNumber(agent.scalePlusCount ?? 0)}</td>
                      <td className={tdCenterCls}>{formatNumber(agent.scalePlusConversion ?? 0, 2)}%</td>
                      <td className={tdCenterCls}>{formatNumber(agent.totalConversion ?? 0, 2)}%</td>
                    </tr>
                  ))}

                  {/* Ortalama satırı */}
                  <tr className="border-t-2 border-emerald-600 bg-emerald-800 dark:border-emerald-700 dark:bg-emerald-900">
                    <td className="px-4 py-3 text-sm font-bold text-white whitespace-nowrap">ORTALAMA</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">
                      {summary.avg.perfScore !== null ? formatNumber(summary.avg.perfScore, 2) : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatCurrency(summary.avg.salesAmount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(Math.round(summary.avg.licenseCount))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatCurrency(Math.round(summary.avg.avgLicensePrice))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatHMS(Math.round(summary.avg.talkDuration))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(Math.round(summary.avg.callAttempts))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.avg.conversionRate, 2)}%</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(Math.round(summary.avg.scaleCount))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.avg.scaleConversion, 2)}%</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(Math.round(summary.avg.scalePlusCount))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.avg.scalePlusConversion, 2)}%</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.avg.totalConversion, 2)}%</td>
                  </tr>

                  {/* Toplam satırı */}
                  <tr className="border-t border-emerald-600 bg-emerald-800 dark:border-emerald-700 dark:bg-emerald-900">
                    <td className="px-4 py-3 text-sm font-bold text-white whitespace-nowrap">TOPLAM</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatCurrency(summary.total.salesAmount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.total.licenseCount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.total.callAttempts)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.total.scaleCount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.total.scalePlusCount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                  </tr>
                </tbody>
              </table>
            </div>
          </SurfaceCard>
        </>
      )}
    </div>
  );
}
