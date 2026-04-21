import { ChampionSpotlightCard, Leaderboard, PageHeader, SurfaceCard } from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { selectDefaultReportPeriod } from "@kalitedb/shared";
import type { SalesKpiAgent, SalesKpiData } from "@kalitedb/shared";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { TrendLineCard, buildYearTrendPoints } from "../components/year-trend-card";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import {
  aggregateMultiPeriodKpi,
  computeActivePeriodIds,
  derivePeriodRangeSelectors
} from "../lib/period-aggregation";
import { DataTable } from "../components/data-table";
import { MonthlyTable, buildAgentAvatar, type MonthlyAgentRow } from "../components/audit-shared";
import { BadgeFilter } from "../components/badge-filter";
import { CompactStatCard } from "../components/compact-stat-card";
import { RepNameCell } from "../components/rep-name-cell";
import { useRepresentativesMap } from "../lib/use-representatives-map";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber, formatPercent } from "../lib/format";
import { chart } from "../theme/colors";

type PerformanceAgentRow = {
  id: string;
  agentKey: string;
  agentName: string;
  listIndex: number;
  perfScoreDisplay: number | null;
  salesAmountDisplay: number;
  licenseCountDisplay: number;
  conversionRateDisplay: number;
};

const columnHelper = createColumnHelper<PerformanceAgentRow>();

function formatPerfScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return formatNumber(value, Number.isInteger(value) ? 0 : 2);
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `${formatNumber(value)} TRY`;
}

function PerformanceBadge(props: { value: number | null | undefined }) {
  if (props.value === null || props.value === undefined) {
    return <span className="text-slate-400">-</span>;
  }

  const toneClass =
    props.value < 70
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400"
      : props.value < 85
        ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-400"
        : "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-600/40 dark:bg-emerald-900/40 dark:text-emerald-300";

  return (
    <span className={`inline-flex min-w-24 justify-center rounded-full border px-3 py-1.5 text-sm font-semibold ${toneClass}`}>
      {formatPerfScore(props.value)}
    </span>
  );
}

function average(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

export function SalesPerformancePage() {
  const auth = useAuth();
  const now = new Date();
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  });

  const selectedYear = periodRange.year;

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
  const periodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId)
    ? periodRange.monthPeriodId
    : defaultPeriod?.id;
  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) {
      setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
    }
  }, [defaultPeriod?.id, periodRange.monthPeriodId]);

  /* ── Yıl boyu sales KPI (her ay için tekil sorgu) ── */
  const salesKpiQueries = useQueries({
    queries: yearPeriods.map((period) => ({
      queryKey: ["sales-kpi", auth.token, period.id],
      queryFn: () => api.getSalesKpiData(auth.token, period.id),
      staleTime: 5 * 60 * 1000
    }))
  });

  const salesKpiByPeriodId = useMemo<Map<string, SalesKpiData | null>>(() => {
    const map = new Map<string, SalesKpiData | null>();
    yearPeriods.forEach((period, idx) => {
      map.set(period.id, salesKpiQueries[idx]?.data ?? null);
    });
    return map;
  }, [yearPeriods, salesKpiQueries]);

  const isKpiLoading = salesKpiQueries.some((q) => q.isPending);

  /* ── ViewMode'a göre aktif dönem ID'leri ── */
  const activePeriodIds = useMemo(
    () =>
      computeActivePeriodIds(yearPeriods, {
        ...periodRange,
        monthPeriodId: periodId
      }),
    [yearPeriods, periodRange, periodId]
  );

  /* ── ViewMode'a göre toplulaştırılmış temsilci listesi ──
   * aylık  → seçili dönemin kayıtları
   * çeyreklik → çeyreğin 3 ayı için temsilci bazında toplulaştırma
   * yıllık → yılın tüm ayları için temsilci bazında toplulaştırma
   */
  const aggregatedAgents = useMemo<SalesKpiAgent[]>(() => {
    if (activePeriodIds.length === 0) return [];
    const datasets = activePeriodIds.map((pid) => salesKpiByPeriodId.get(pid) ?? null);
    const { agents } = aggregateMultiPeriodKpi(datasets);
    return agents;
  }, [activePeriodIds, salesKpiByPeriodId]);

  /* ── Detay tablo satırları ── */
  const agents = useMemo<PerformanceAgentRow[]>(() => {
    if (aggregatedAgents.length === 0) return [];
    const sorted = [...aggregatedAgents].sort((a, b) => {
      const as_ = a.perfScore;
      const bs_ = b.perfScore;
      if (as_ === null && bs_ === null) return a.agentName.localeCompare(b.agentName, "tr");
      if (as_ === null) return 1;
      if (bs_ === null) return -1;
      if (bs_ !== as_) return bs_ - as_;
      return a.agentName.localeCompare(b.agentName, "tr");
    });
    return sorted.map((a, i) => ({
      id: a.agentKey,
      agentKey: a.agentKey,
      agentName: a.agentName,
      listIndex: i + 1,
      perfScoreDisplay: a.perfScore,
      salesAmountDisplay: a.salesAmount,
      licenseCountDisplay: a.licenseCount,
      conversionRateDisplay: a.conversionRate
    }));
  }, [aggregatedAgents]);

  const repsMap = useRepresentativesMap();
  const [badgeFilter, setBadgeFilter] = useState<string>("");
  const filteredAgents = useMemo(() => {
    if (!badgeFilter) return agents;
    return agents.filter((a) => (repsMap.get(a.agentKey)?.badges ?? []).includes(badgeFilter));
  }, [agents, badgeFilter, repsMap]);
  const filterMonthly = (data: MonthlyAgentRow[]) =>
    badgeFilter ? data.filter((r) => (repsMap.get(r.agentKey)?.badges ?? []).includes(badgeFilter)) : data;

  /* ── Takım performans ortalaması ── */
  const teamPerfAverage = useMemo(
    () => average(aggregatedAgents.map((a) => a.perfScore)),
    [aggregatedAgents]
  );

  const evaluatedAgentCount = useMemo(
    () => aggregatedAgents.filter((a) => a.perfScore !== null).length,
    [aggregatedAgents]
  );

  /* ── Şampiyon & en düşük ── */
  const perfLeaders = useMemo(() => {
    const scored = aggregatedAgents.filter(
      (a): a is SalesKpiAgent & { perfScore: number } => a.perfScore !== null
    );
    if (scored.length === 0) return [];
    const topScore = Math.max(...scored.map((a) => a.perfScore));
    return scored
      .filter((a) => a.perfScore === topScore)
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"))
      .map((a, i) => ({ name: a.agentName, imageAlt: a.agentName, imageSrc: buildAgentAvatar(a.agentName, i) }));
  }, [aggregatedAgents]);
  const perfLeaderNames = perfLeaders.map((l) => l.name).join(", ");

  const topPerfScore = useMemo(() => {
    const scored = aggregatedAgents
      .map((a) => a.perfScore)
      .filter((v): v is number => v !== null);
    return scored.length > 0 ? Math.max(...scored) : null;
  }, [aggregatedAgents]);

  const lowestPerfGroup = useMemo(() => {
    const scored = aggregatedAgents.filter(
      (a): a is SalesKpiAgent & { perfScore: number } => a.perfScore !== null
    );
    if (scored.length === 0) return null;
    const lowestScore = Math.min(...scored.map((a) => a.perfScore));
    const leaders = scored
      .filter((a) => a.perfScore === lowestScore)
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));
    return { names: leaders.map((a) => a.agentName).join(", "), score: lowestScore };
  }, [aggregatedAgents]);

  /* ── Lider tablosu (top 5) ── */
  const perfLeaderboardItems = useMemo(() => {
    return aggregatedAgents
      .filter((a): a is SalesKpiAgent & { perfScore: number } => a.perfScore !== null)
      .sort((a, b) => b.perfScore - a.perfScore || a.agentName.localeCompare(b.agentName, "tr"))
      .slice(0, 5)
      .map((a) => ({ id: a.agentKey, label: a.agentName, value: formatPerfScore(a.perfScore) }));
  }, [aggregatedAgents]);

  /* ── Yıl trend grafiği (aylık takım ortalaması) ── */
  const perfHistory = useMemo(() => {
    const points = yearPeriods.map((period) => {
      const data = salesKpiByPeriodId.get(period.id);
      const teamAvg = data ? average(data.agents.map((a) => a.perfScore)) : null;
      return { periodId: period.id, period: period.month, title: period.title, audit: teamAvg, csat: null };
    });
    return buildYearTrendPoints({ year: selectedYear, currentPeriodId: periodId, points });
  }, [yearPeriods, salesKpiByPeriodId, selectedYear, periodId]);

  /* ── Performans değişimi (önceki dönemle delta) ──
   * aylık  → önceki ay
   * çeyreklik → önceki çeyrek ortalaması
   * yıllık → yok
   */
  const previousPeriodIds = useMemo<string[]>(() => {
    if (periodRange.viewMode === "aylik") {
      if (!periodId) return [];
      const idx = yearPeriods.findIndex((p) => p.id === periodId);
      return idx > 0 ? [yearPeriods[idx - 1]!.id] : [];
    }
    if (periodRange.viewMode === "ceyreklik") {
      const prevQuarter = (periodRange.quarter ?? 1) - 1;
      if (prevQuarter < 1) return [];
      const startMonth = (prevQuarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      return yearPeriods
        .filter((p) => {
          const m = Number(p.month.split("-")[1]);
          return m >= startMonth && m <= endMonth;
        })
        .map((p) => p.id);
    }
    return [];
  }, [periodRange.viewMode, periodRange.quarter, periodId, yearPeriods]);

  const previousAggregatedAgents = useMemo<SalesKpiAgent[] | null>(() => {
    if (previousPeriodIds.length === 0) return null;
    const datasets = previousPeriodIds.map((pid) => salesKpiByPeriodId.get(pid) ?? null);
    const { agents: prevAgents } = aggregateMultiPeriodKpi(datasets);
    return prevAgents;
  }, [previousPeriodIds, salesKpiByPeriodId]);

  const performanceShiftTitlePrefix =
    periodRange.viewMode === "ceyreklik" ? "Çeyreklik" : "Aylık";

  const performanceShift = useMemo(() => {
    if (!previousAggregatedAgents) return null;

    const prevMap = new Map(
      previousAggregatedAgents
        .filter((a): a is SalesKpiAgent & { perfScore: number } => a.perfScore !== null)
        .map((a) => [a.agentKey, a.perfScore])
    );

    const changes = aggregatedAgents
      .filter((a): a is SalesKpiAgent & { perfScore: number } => a.perfScore !== null)
      .map((a) => {
        const prev = prevMap.get(a.agentKey);
        return prev !== undefined
          ? { label: a.agentName, score: a.perfScore, delta: Number((a.perfScore - prev).toFixed(2)) }
          : null;
      })
      .filter((item): item is { label: string; score: number; delta: number } => item !== null);

    if (changes.length === 0) return null;

    const maxDelta = Math.max(...changes.map((c) => c.delta));
    if (maxDelta > 0) {
      const leaders = changes.filter((c) => c.delta === maxDelta).sort((a, b) => a.label.localeCompare(b.label, "tr"));
      return {
        title: "Yükselen performans",
        names: leaders.map((l) => l.label).join(", "),
        delta: maxDelta,
        score: leaders.length === 1 ? leaders[0]!.score : null
      };
    }

    const minDelta = Math.min(...changes.map((c) => c.delta));
    if (minDelta < 0) {
      const leaders = changes.filter((c) => c.delta === minDelta).sort((a, b) => a.label.localeCompare(b.label, "tr"));
      return {
        title: "Düşen performans",
        names: leaders.map((l) => l.label).join(", "),
        delta: minDelta,
        score: leaders.length === 1 ? leaders[0]!.score : null
      };
    }

    return {
      title: `${performanceShiftTitlePrefix} değişim`,
      names: changes.map((c) => c.label).sort((a, b) => a.localeCompare(b, "tr")).join(", "),
      delta: 0,
      score: null
    };
  }, [aggregatedAgents, previousAggregatedAgents, performanceShiftTitlePrefix]);

  /* ── Roleplay verileri (her ay için) ── */
  const roleplayQueries = useQueries({
    queries: yearPeriods.map((period) => ({
      queryKey: ["roleplay-metrics", auth.token, period.id],
      queryFn: () => api.getRoleplayMetrics(auth.token, period.id),
      staleTime: 5 * 60 * 1000
    }))
  });

  /* ── Aylık performans pivot (ortalama değil, dönemsel tek değer) ── */
  const perfMonthlyData = useMemo<MonthlyAgentRow[]>(() => {
    const agentMap = new Map<string, string>();
    const agentMonths = new Map<string, (number | null)[]>();

    for (const period of yearPeriods) {
      const monthIdx = Number(period.month.split("-")[1]) - 1;
      const data = salesKpiByPeriodId.get(period.id);
      if (!data) continue;
      for (const entry of data.agents) {
        agentMap.set(entry.agentKey, entry.agentName);
        if (!agentMonths.has(entry.agentKey)) agentMonths.set(entry.agentKey, Array(12).fill(null));
        agentMonths.get(entry.agentKey)![monthIdx] = entry.perfScore;
      }
    }

    return Array.from(agentMap.entries())
      .map(([key, name]) => ({ agentKey: key, agentName: name, months: agentMonths.get(key) ?? Array(12).fill(null) }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));
  }, [salesKpiByPeriodId, yearPeriods]);

  /* ── Aylık role-play pivot (toplam) ── */
  const rolePlayData = useMemo<MonthlyAgentRow[]>(() => {
    const agentMap = new Map<string, string>();
    const agentMonths = new Map<string, (number | null)[]>();

    for (let i = 0; i < yearPeriods.length; i++) {
      const monthIdx = Number(yearPeriods[i]!.month.split("-")[1]) - 1;
      const data = roleplayQueries[i]?.data;
      if (!data) continue;
      for (const entry of data) {
        agentMap.set(entry.agentKey, entry.agentName);
        if (!agentMonths.has(entry.agentKey)) agentMonths.set(entry.agentKey, Array(12).fill(null));
        agentMonths.get(entry.agentKey)![monthIdx] = entry.rolePlayCount;
      }
    }

    return Array.from(agentMap.entries())
      .map(([key, name]) => ({ agentKey: key, agentName: name, months: agentMonths.get(key) ?? Array(12).fill(null) }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));
  }, [yearPeriods, roleplayQueries]);

  /* ── Aylık RevOPS pivot (toplam) ── */
  const revOpsData = useMemo<MonthlyAgentRow[]>(() => {
    const agentMap = new Map<string, string>();
    const agentMonths = new Map<string, (number | null)[]>();

    for (let i = 0; i < yearPeriods.length; i++) {
      const monthIdx = Number(yearPeriods[i]!.month.split("-")[1]) - 1;
      const data = roleplayQueries[i]?.data;
      if (!data) continue;
      for (const entry of data) {
        if (entry.revOpsCount === null || entry.revOpsCount === undefined) continue;
        agentMap.set(entry.agentKey, entry.agentName);
        if (!agentMonths.has(entry.agentKey)) agentMonths.set(entry.agentKey, Array(12).fill(null));
        agentMonths.get(entry.agentKey)![monthIdx] = entry.revOpsCount;
      }
    }

    return Array.from(agentMap.entries())
      .map(([key, name]) => ({ agentKey: key, agentName: name, months: agentMonths.get(key) ?? Array(12).fill(null) }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));
  }, [yearPeriods, roleplayQueries]);

  /* ── Seçili dönem için roleplay notları ── */
  const queryClient = useQueryClient();

  const roleplayNoteMap = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    if (!periodId) return map;
    const idx = yearPeriods.findIndex((p) => p.id === periodId);
    if (idx < 0) return map;
    const data = roleplayQueries[idx]?.data;
    if (!data) return map;
    for (const entry of data) {
      if (entry.note) {
        map.set(entry.agentKey, entry.note);
      }
    }
    return map;
  }, [periodId, yearPeriods, roleplayQueries]);

  const [noteModal, setNoteModal] = useState<{ agentKey: string; agentName: string; note: string } | null>(null);

  const saveNoteMutation = useMutation({
    mutationFn: async ({ agentKey, note }: { agentKey: string; note: string }) => {
      if (!periodId) return;
      const idx = yearPeriods.findIndex((p) => p.id === periodId);
      if (idx < 0) return;
      const currentData = roleplayQueries[idx]?.data ?? [];
      const entries = currentData.map((entry) => ({
        agentKey: entry.agentKey,
        agentName: entry.agentName,
        rolePlayCount: entry.rolePlayCount,
        revOpsCount: entry.revOpsCount ?? null,
        ...(entry.agentKey === agentKey
          ? (note.trim() ? { note: note.trim() } : {})
          : (entry.note ? { note: entry.note } : {}))
      }));
      await api.saveRoleplayMetrics(auth.token, periodId!, entries);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roleplay-metrics"] });
      setNoteModal(null);
    }
  });

  const isLoading = periodsQuery.isPending || isKpiLoading;
  const hasAnyData = aggregatedAgents.length > 0;

  const columns: ColumnDef<PerformanceAgentRow, any>[] = [
    columnHelper.accessor("listIndex", {
      header: "#",
      cell: (info) => <span className="font-medium text-slate-500 dark:text-slate-400">{info.getValue()}</span>
    }),
    columnHelper.accessor("agentName", {
      header: "Temsilci",
      cell: (info) => <RepNameCell name={info.getValue()} rep={repsMap.get(info.row.original.agentKey)} />
    }),
    columnHelper.accessor("perfScoreDisplay", {
      header: "Performans puanı",
      cell: (info) => <PerformanceBadge value={info.getValue()} />
    }),
    columnHelper.accessor("salesAmountDisplay", {
      header: "Satış tutarı",
      cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>
    }),
    columnHelper.accessor("licenseCountDisplay", {
      header: "Lisans",
      cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>
    }),
    columnHelper.accessor("conversionRateDisplay", {
      header: "Dönüşüm",
      cell: (info) => <span className="tabular-nums">{formatPercent(info.getValue())}</span>
    })
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Satış Audit"
        actions={
          <PeriodRangeFilter
            onChange={setPeriodRange}
            periods={salesPeriods}
            value={{ ...periodRange, monthPeriodId: periodId }}
          />
        }
      />

      {isLoading ? (
        <SurfaceCard title="Yükleniyor..." variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">Veriler yükleniyor...</p>
        </SurfaceCard>
      ) : !hasAnyData ? (
        <SurfaceCard title="Henüz veri yok" variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {selectedYear} yılı için satış performans verisi bulunamadı.
          </p>
        </SurfaceCard>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CompactStatCard
              label="Takım performans ortalaması"
              value={formatPerfScore(teamPerfAverage)}
            />
            <CompactStatCard
              label="Değerlendirilen temsilci"
              value={formatNumber(evaluatedAgentCount)}
            />
            <CompactStatCard
              label={performanceShift?.title ?? "Yükselen performans"}
              valueClassName="text-base font-semibold leading-snug"
              value={
                <span className="flex items-start gap-1.5">
                  <TrendingUp className="mt-0.5 shrink-0 text-emerald-500" size={16} />
                  <span className="min-w-0 break-words">{performanceShift?.names ?? "Henüz yok"}</span>
                </span>
              }
              hint={
                performanceShift
                  ? performanceShift.score !== null
                    ? `${formatPerfScore(performanceShift.score)} puan · ${performanceShift.delta > 0 ? "+" : ""}${formatNumber(performanceShift.delta, 2)}`
                    : `${performanceShift.delta > 0 ? "+" : ""}${formatNumber(performanceShift.delta, 2)} puan`
                  : undefined
              }
            />
            <CompactStatCard
              label="En düşük performans"
              valueClassName="text-base font-semibold leading-snug"
              value={
                <span className="flex items-start gap-1.5">
                  <TrendingDown className="mt-0.5 shrink-0 text-rose-500" size={16} />
                  <span className="min-w-0 break-words">{lowestPerfGroup?.names ?? "Henüz yok"}</span>
                </span>
              }
              hint={lowestPerfGroup ? formatPerfScore(lowestPerfGroup.score) : undefined}
            />
          </div>

          <div>
            <ChampionSpotlightCard
              kicker={perfLeaders.length > 1 ? "Öne çıkan temsilciler" : "Öne çıkan temsilci"}
              metricLabel={perfLeaders.length > 1 ? "Lider temsilciler" : "Lider temsilci"}
              name={perfLeaderNames || "Takip ediliyor"}
              people={perfLeaders}
              score={formatPerfScore(topPerfScore)}
              showPodium={false}
              theme="ink"
              title="En yüksek performans puanı"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <TrendLineCard
              color={chart.barDefault}
              data={perfHistory}
              emptyMessage={
                isKpiLoading
                  ? "Yıllık performans verisi yükleniyor..."
                  : "Bu yıl için performans verisi bulunamadı."
              }
              metricKey="audit"
              title="Performans"
              valueFormatter={(value) => formatPerfScore(value)}
              yDomain={[0, 100]}
            />

            <Leaderboard
              items={perfLeaderboardItems}
              title="Performans lider tablosu"
            />
          </div>

          <SurfaceCard
            title="Temsilci detay tablosu"
            variant="default"
            headerClassName="bg-emerald-800 border-emerald-700 dark:bg-emerald-900"
            titleClassName="text-white"
            actions={<BadgeFilter onChange={setBadgeFilter} value={badgeFilter} />}
          >
            <DataTable
              columns={columns}
              data={filteredAgents}
              density="comfortable"
              emptyState="Seçilen dönemde gösterilecek performans kaydı bulunamadı."
            />
          </SurfaceCard>

          <MonthlyTable
            data={filterMonthly(perfMonthlyData)}
            summaryMode="average"
            title="Aylık Performans Puanları"
            valueFormatter={(v) => formatPerfScore(v)}
            actions={<BadgeFilter onChange={setBadgeFilter} value={badgeFilter} />}
            repsMap={repsMap}
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <MonthlyTable
              data={filterMonthly(rolePlayData)}
              noteMap={roleplayNoteMap}
              onNoteClick={(agentKey, agentName, currentNote) =>
                setNoteModal({ agentKey, agentName, note: currentNote })
              }
              summaryMode="total"
              title="IS Role-Play Adet"
              emptyNote="Role-play verileri henüz girilmemiş. Yönetim panelinden giriş yapabilirsiniz."
              colorScale="count"
              actions={<BadgeFilter onChange={setBadgeFilter} value={badgeFilter} />}
              repsMap={repsMap}
            />

            <MonthlyTable
              data={filterMonthly(revOpsData)}
              summaryMode="total"
              title="RevOPS"
              emptyNote="RevOPS verileri henüz girilmemiş. Yönetim panelinden giriş yapabilirsiniz."
              colorScale="count"
              actions={<BadgeFilter onChange={setBadgeFilter} value={badgeFilter} />}
              repsMap={repsMap}
            />
          </div>
        </>
      )}

      {noteModal && (
        <RoleplayNoteModal
          agentName={noteModal.agentName}
          isSaving={saveNoteMutation.isPending}
          note={noteModal.note}
          onClose={() => setNoteModal(null)}
          onSave={(value) => saveNoteMutation.mutate({ agentKey: noteModal.agentKey, note: value })}
        />
      )}
    </div>
  );
}

/* ── Roleplay Not Modalı ── */

function RoleplayNoteModal(props: {
  agentName: string;
  note: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(props.note);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}>
      <div
        className="mx-4 w-full max-w-md rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-950 dark:text-slate-100">
            {props.agentName} &mdash; Role-Play Notu
          </h3>
          <button
            className="inline-flex size-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300"
            onClick={props.onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
        <textarea
          autoFocus
          className="mt-4 h-32 w-full resize-none rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 transition focus:border-primary/40 focus:outline-none"
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Temsilci hakkında not girin..."
          value={draft}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-[10px] border border-slate-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-slate-700"
            onClick={props.onClose}
            type="button"
          >
            Vazgeç
          </button>
          <button
            className="rounded-[10px] bg-[#2f6b7a] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(47,107,122,0.18)] transition hover:bg-[#285d6a] disabled:opacity-50"
            disabled={props.isSaving}
            onClick={() => props.onSave(draft)}
            type="button"
          >
            {props.isSaving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
