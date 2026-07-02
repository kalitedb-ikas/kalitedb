import { PageHeader, SurfaceCard } from "@kalitedb/ui";
import { getTwoPlusOneCount, getTwoPlusOnePercent, selectDefaultReportPeriod } from "@kalitedb/shared";
import type { SalesKpiAgent } from "@kalitedb/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber, formatPeriodMonth } from "../lib/format";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import { useUrlPeriodRange, useUrlParam } from "../lib/use-url-filters";
import { AgentSearch, matchesAgentSearch } from "../components/agent-search";
import { CsvDownloadButton } from "../components/csv-download-button";
import { exportToCsv } from "../lib/csv-export";
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

  // Nullable metrikler (Pre Onb, Hubspot vb.): değeri olan temsilciler üzerinden ortalama
  const avgOf = (values: number[]): number | null =>
    values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
  const nonNull = (values: (number | null | undefined)[]): number[] =>
    values.filter((v): v is number => typeof v === "number");

  const avgPerfScore = scored.length > 0 ? scored.reduce((s, a) => s + a.perfScore, 0) / scored.length : null;
  const avgSalesAmount = count > 0 ? agents.reduce((s, a) => s + a.salesAmount, 0) / count : 0;
  const avgLicenseCount = count > 0 ? agents.reduce((s, a) => s + a.licenseCount, 0) / count : 0;
  const avgLicensePrice = count > 0 ? agents.reduce((s, a) => s + a.avgLicensePrice, 0) / count : 0;
  const avgTalkDuration = count > 0 ? agents.reduce((s, a) => s + a.talkDurationSeconds, 0) / count : 0;
  const avgCallAttempts = count > 0 ? agents.reduce((s, a) => s + a.callAttempts, 0) / count : 0;
  const avgConversion = count > 0 ? agents.reduce((s, a) => s + a.conversionRate, 0) / count : 0;
  const avgTwoPlusOneCount = count > 0 ? agents.reduce((s, a) => s + getTwoPlusOneCount(a), 0) / count : 0;
  const avgTwoPlusOnePercent = count > 0 ? agents.reduce((s, a) => s + getTwoPlusOnePercent(a), 0) / count : 0;
  const avgPreOnbCount = avgOf(nonNull(agents.map((a) => a.preOnbCount)));
  const avgHubspotScore = avgOf(nonNull(agents.map((a) => a.hubspotScore)));
  const avgDomainCount = avgOf(nonNull(agents.map((a) => a.domainCount)));
  const avgOutboundLeadCount = avgOf(nonNull(agents.map((a) => a.outboundLeadCount)));

  const totalSalesAmount = agents.reduce((s, a) => s + a.salesAmount, 0);
  const totalLicenseCount = agents.reduce((s, a) => s + a.licenseCount, 0);
  const totalCallAttempts = agents.reduce((s, a) => s + a.callAttempts, 0);
  const totalTwoPlusOneCount = agents.reduce((s, a) => s + getTwoPlusOneCount(a), 0);
  const totalPreOnbCount = agents.reduce((s, a) => s + (a.preOnbCount ?? 0), 0);
  const totalDomainCount = agents.reduce((s, a) => s + (a.domainCount ?? 0), 0);
  const totalOutboundLeadCount = agents.reduce((s, a) => s + (a.outboundLeadCount ?? 0), 0);

  return {
    avg: {
      perfScore: avgPerfScore, salesAmount: avgSalesAmount, licenseCount: avgLicenseCount,
      avgLicensePrice: avgLicensePrice, talkDuration: avgTalkDuration, callAttempts: avgCallAttempts,
      conversionRate: avgConversion, twoPlusOneCount: avgTwoPlusOneCount, twoPlusOnePercent: avgTwoPlusOnePercent,
      preOnbCount: avgPreOnbCount, hubspotScore: avgHubspotScore, domainCount: avgDomainCount,
      outboundLeadCount: avgOutboundLeadCount
    },
    total: {
      salesAmount: totalSalesAmount, licenseCount: totalLicenseCount, callAttempts: totalCallAttempts,
      twoPlusOneCount: totalTwoPlusOneCount, preOnbCount: totalPreOnbCount,
      domainCount: totalDomainCount, outboundLeadCount: totalOutboundLeadCount
    }
  };
}

/* ── Sorting ── */

type SortKey = "agentName" | "perfScore" | "salesAmount" | "licenseCount" | "avgLicensePrice" | "talkDurationSeconds" | "callAttempts" | "conversionRate" | "twoPlusOneCount" | "twoPlusOnePercent" | "preOnbCount" | "hubspotScore" | "domainCount" | "outboundLeadCount";
type SortDir = "asc" | "desc";

function getSortValue(agent: SalesKpiAgent, key: SortKey): number | string {
  // 2+1 alanları eski dönem kayıtlarında Scale alanlarından türetilir
  if (key === "twoPlusOneCount") return getTwoPlusOneCount(agent);
  if (key === "twoPlusOnePercent") return getTwoPlusOnePercent(agent);
  const v = agent[key];
  if (v === null || v === undefined) return -Infinity;
  return v;
}

/* ── Component ── */

export function SalesKpiPage() {
  const auth = useAuth();
  const now = new Date();
  const periodRangeDefaults = useMemo<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [periodRange, setPeriodRange] = useUrlPeriodRange(periodRangeDefaults);
  const [, setSearchParams] = useSearchParams();
  const [sortKeyParam] = useUrlParam("sort", "salesAmount");
  const [sortDirParam] = useUrlParam("dir", "desc");
  const [agentSearch, setAgentSearch] = useUrlParam("search", "");
  const sortKey = (sortKeyParam || null) as SortKey | null;
  const sortDir = (sortDirParam === "asc" ? "asc" : "desc") as SortDir;

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
    const filtered = agentSearch
      ? agents.filter((a) => matchesAgentSearch(a.agentName, agentSearch))
      : agents;
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [agents, sortKey, sortDir, agentSearch]);

  const toggleSort = (key: SortKey) => {
    const nextDir: SortDir = sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "desc";
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("sort", key);
        p.set("dir", nextDir);
        return p;
      },
      { replace: true }
    );
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
            <AgentSearch onChange={setAgentSearch} value={agentSearch} />
            <PeriodRangeFilter
              onChange={setPeriodRange}
              periods={salesPeriods}
              value={{ ...periodRange, monthPeriodId: monthlyPeriodId }}
            />
            <CsvDownloadButton
              disabled={sortedAgents.length === 0}
              onClick={() => {
                const periodTag = selectedPeriod?.month ?? selectedYear;
                exportToCsv(
                  `sales-kpi-${periodTag}`,
                  [
                    "#",
                    "Temsilci",
                    "Perf. Değ.",
                    "Satış (TRY)",
                    "Lisans Adeti",
                    "Ort. Lisans Fiyatı (TRY)",
                    "2+1",
                    "%2+1",
                    "Top. Konuşma Süresi (sn)",
                    "Arama Denemesi",
                    "Pre Onb",
                    "Hubspot",
                    "Domain",
                    "Outbound / Eski Lead",
                    "Dönüşüm Oranı (%)"
                  ],
                  sortedAgents.map((a, idx) => [
                    idx + 1,
                    a.agentName,
                    a.perfScore,
                    a.salesAmount,
                    a.licenseCount,
                    a.avgLicensePrice,
                    getTwoPlusOneCount(a),
                    getTwoPlusOnePercent(a),
                    a.talkDurationSeconds,
                    a.callAttempts,
                    a.preOnbCount,
                    a.hubspotScore,
                    a.domainCount,
                    a.outboundLeadCount,
                    a.conversionRate
                  ])
                );
              }}
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
                    <th className={`${thBase} text-center cursor-default hover:bg-emerald-800 dark:hover:bg-emerald-900`}>#</th>
                    {sortTh("KPI's", "agentName", "left")}
                    {sortTh("Perf. Değ.", "perfScore")}
                    {sortTh(monthLabel, "salesAmount")}
                    {sortTh("Lisans Adeti", "licenseCount")}
                    {sortTh("Ort. Lisans Fiyatı", "avgLicensePrice")}
                    {sortTh("2+1", "twoPlusOneCount")}
                    {sortTh("%2+1", "twoPlusOnePercent")}
                    {sortTh("Top. Konuşma Süresi", "talkDurationSeconds")}
                    {sortTh("Arama Denemesi", "callAttempts")}
                    {sortTh("Pre Onb", "preOnbCount")}
                    {sortTh("Hubspot", "hubspotScore")}
                    {sortTh("Domain", "domainCount")}
                    {sortTh("Outbound / Eski Lead", "outboundLeadCount")}
                    {sortTh("Dönüşüm Oranı", "conversionRate")}
                  </tr>
                </thead>

                <tbody>
                  {/* Hedef satırı */}
                  <tr className="bg-emerald-800 dark:bg-emerald-900">
                    <td className="px-4 py-2.5 text-sm font-bold text-white/70 whitespace-nowrap" />
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
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">
                      {targets.talkDurationLabel}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">
                      {formatNumber(targets.callAttempts)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">—</td>
                    <td className="px-4 py-2.5 text-center text-sm font-bold text-emerald-200 whitespace-nowrap">
                      %{formatNumber(targets.conversionRate, 2)}
                    </td>
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
                      <td className={`${tdCenterCls} font-medium text-slate-500 dark:text-slate-400`}>{idx + 1}</td>
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
                      <td className={tdCenterCls}>{formatNumber(getTwoPlusOneCount(agent))}</td>
                      <td className={tdCenterCls}>{formatNumber(getTwoPlusOnePercent(agent), 2)}%</td>
                      <td className={tdCenterCls}>{formatHMS(agent.talkDurationSeconds)}</td>
                      <td className={tdCenterCls}>{formatNumber(agent.callAttempts)}</td>
                      <td className={tdCenterCls}>{agent.preOnbCount !== null && agent.preOnbCount !== undefined ? formatNumber(agent.preOnbCount) : "—"}</td>
                      <td className={tdCenterCls}>{agent.hubspotScore !== null && agent.hubspotScore !== undefined ? formatNumber(agent.hubspotScore, 3) : "—"}</td>
                      <td className={tdCenterCls}>{agent.domainCount !== null && agent.domainCount !== undefined ? formatNumber(agent.domainCount) : "—"}</td>
                      <td className={tdCenterCls}>{agent.outboundLeadCount !== null && agent.outboundLeadCount !== undefined ? formatNumber(agent.outboundLeadCount) : "—"}</td>
                      <td className={tdCenterCls}>
                        <span className={
                          agent.conversionRate >= targets.conversionRate
                            ? "text-emerald-700 dark:text-emerald-400"
                            : ""
                        }>
                          {formatNumber(agent.conversionRate, 2)}%
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Ortalama satırı */}
                  <tr className="border-t-2 border-emerald-600 bg-emerald-800 dark:border-emerald-700 dark:bg-emerald-900">
                    <td className="px-4 py-3 text-sm font-bold text-white whitespace-nowrap" />
                    <td className="px-4 py-3 text-sm font-bold text-white whitespace-nowrap">ORTALAMA</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">
                      {summary.avg.perfScore !== null ? formatNumber(summary.avg.perfScore, 2) : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatCurrency(summary.avg.salesAmount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(Math.round(summary.avg.licenseCount))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatCurrency(Math.round(summary.avg.avgLicensePrice))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(Math.round(summary.avg.twoPlusOneCount))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.avg.twoPlusOnePercent, 2)}%</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatHMS(Math.round(summary.avg.talkDuration))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(Math.round(summary.avg.callAttempts))}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{summary.avg.preOnbCount !== null ? formatNumber(summary.avg.preOnbCount, 1) : "—"}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{summary.avg.hubspotScore !== null ? formatNumber(summary.avg.hubspotScore, 3) : "—"}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{summary.avg.domainCount !== null ? formatNumber(summary.avg.domainCount, 1) : "—"}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{summary.avg.outboundLeadCount !== null ? formatNumber(summary.avg.outboundLeadCount, 1) : "—"}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.avg.conversionRate, 2)}%</td>
                  </tr>

                  {/* Toplam satırı */}
                  <tr className="border-t border-emerald-600 bg-emerald-800 dark:border-emerald-700 dark:bg-emerald-900">
                    <td className="px-4 py-3 text-sm font-bold text-white whitespace-nowrap" />
                    <td className="px-4 py-3 text-sm font-bold text-white whitespace-nowrap">TOPLAM</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatCurrency(summary.total.salesAmount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.total.licenseCount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.total.twoPlusOneCount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.total.callAttempts)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.total.preOnbCount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center" />
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.total.domainCount)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-200 whitespace-nowrap text-center">{formatNumber(summary.total.outboundLeadCount)}</td>
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
