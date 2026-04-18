import { ChampionSpotlightCard, Leaderboard, PageHeader, SurfaceCard } from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  average,
  buildDashboardSnapshot,
  selectAuditMetrics,
  selectDefaultReportPeriod,
  type AgentMetric,
  type AuditMetric
} from "@kalitedb/shared";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import { TrendLineCard, buildYearTrendPoints } from "../components/year-trend-card";
import { DataTable } from "../components/data-table";
import {
  AuditTableBadge,
  MonthlyTable,
  buildAgentAvatar,
  isAuditSummaryRow,
  type MonthlyAgentRow
} from "../components/audit-shared";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatAuditScore, formatNumber, formatPercent, formatPeriodMonth, getPreviousPeriod } from "../lib/format";
import { aggregateAgentMetrics, aggregateAuditMetrics, computeActivePeriodIds, derivePeriodRangeSelectors } from "../lib/period-aggregation";
import { useRepresentativeKeysWithBadge } from "../lib/use-active-representatives";
import { useRepresentativesMap } from "../lib/use-representatives-map";
import { RepNameCell } from "../components/rep-name-cell";
import { BadgeFilter } from "../components/badge-filter";
import { CompactStatCard } from "../components/compact-stat-card";
import { chart } from "../theme/colors";

type AuditAgentRow = {
  id: string;
  agentKey: string;
  agentName: string;
  listIndex: number;
  auditScoreDisplay: number | null;
  previousAuditAccuracyDisplay: number | null;
};

const columnHelper = createColumnHelper<AuditAgentRow>();

export function AuditPage() {
  const auth = useAuth();
  const now = new Date();
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  });

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });
  const sortedPeriods = useMemo(
    () => [...(periodsQuery.data ?? [])].filter((p) => (p.department ?? "cs") === "cs").sort((left, right) => left.month.localeCompare(right.month)),
    [periodsQuery.data]
  );
  const { yearPeriods: csYearPeriods } = useMemo(() => derivePeriodRangeSelectors(sortedPeriods, periodRange.year), [sortedPeriods, periodRange.year]);
  const defaultPeriod = useMemo(() => {
    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
    return csYearPeriods.find((p) => p.month === prevMonth) ?? selectDefaultReportPeriod(csYearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csYearPeriods]);
  const monthlyPeriodId = csYearPeriods.some((p) => p.id === periodRange.monthPeriodId) ? periodRange.monthPeriodId : defaultPeriod?.id;
  useEffect(() => { if (!periodRange.monthPeriodId && defaultPeriod?.id) setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id })); }, [defaultPeriod?.id, periodRange.monthPeriodId]);
  const activePeriodIds = useMemo(() => computeActivePeriodIds(csYearPeriods, { ...periodRange, monthPeriodId: monthlyPeriodId }), [periodRange, monthlyPeriodId, csYearPeriods]);
  const periodId = activePeriodIds.length > 0 ? activePeriodIds[activePeriodIds.length - 1] : undefined;
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === periodId);
  const selectedYear = selectedPeriod?.month.slice(0, 4);
  const compareToPeriodId = undefined;
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const baseSnapshot = dashboardQuery.data;
  const yearPeriodIds = useMemo(() => csYearPeriods.map((p) => p.id), [csYearPeriods]);
  const agentMetricsBulkQuery = useQuery({
    enabled: yearPeriodIds.length > 0 && periodRange.viewMode !== "aylik",
    queryKey: ["cs-agent-metrics-bulk", auth.token, yearPeriodIds],
    queryFn: () => api.getAgentMetricsForPeriods(auth.token, yearPeriodIds),
    staleTime: 5 * 60 * 1000
  });
  const auditMetricsBulkQuery = useQuery({
    enabled: yearPeriodIds.length > 0 && periodRange.viewMode !== "aylik",
    queryKey: ["cs-audit-metrics-bulk", auth.token, yearPeriodIds],
    queryFn: () => api.getAuditMetricsForPeriods(auth.token, yearPeriodIds),
    staleTime: 5 * 60 * 1000
  });
  const aggregatedSnapshot = useMemo(() => {
    if (!baseSnapshot) return undefined;
    if (periodRange.viewMode === "aylik") return baseSnapshot;
    if (activePeriodIds.length === 0) return baseSnapshot;

    const agentMap = agentMetricsBulkQuery.data;
    const auditMap = auditMetricsBulkQuery.data;
    if (!agentMap || !auditMap) return baseSnapshot;

    const agentPerPeriod = activePeriodIds.map((pid) => agentMap[pid] ?? []);
    const auditPerPeriod = activePeriodIds.map((pid) => auditMap[pid] ?? []);
    const aggregatedAgents: AgentMetric[] = aggregateAgentMetrics(agentPerPeriod);
    const aggregatedAudits: AuditMetric[] = aggregateAuditMetrics(auditPerPeriod);

    const aggregatedPeriod = { ...baseSnapshot.period, manualTotalCallCount: null, manualTotalChatMailCount: null, manualTotalTicketClosedCount: null };
    return buildDashboardSnapshot({
      period: aggregatedPeriod,
      datasets: {
        agentMetrics: aggregatedAgents,
        auditMetrics: aggregatedAudits,
        questionPerformance: baseSnapshot.datasets.questionPerformance,
        qtMetrics: baseSnapshot.datasets.qtMetrics
      },
      thresholds: baseSnapshot.thresholds
    });
  }, [baseSnapshot, periodRange.viewMode, activePeriodIds, agentMetricsBulkQuery.data, auditMetricsBulkQuery.data]);

  // Audit sayfasında tüm temsilciler gösterilir (Satıcı Operasyon, Premium Onboarding dahil).
  const snapshot = aggregatedSnapshot;
  // "Diğer" badge'li temsilciler tablo + ortalamalarda kalır, öne çıkanlardan (champion,
  // lider tablosu, insight tile) hariç tutulur.
  const highlightExcludedKeys = useRepresentativeKeysWithBadge("diger");
  const repsMap = useRepresentativesMap();
  const [badgeFilter, setBadgeFilter] = useState<string>("");
  const previousAuditAccuracyLabel = useMemo(() => {
    const previousPeriod = getPreviousPeriod(snapshot?.period.month);
    return previousPeriod ? `${formatPeriodMonth(previousPeriod, { includeYear: true })} audit doğruluk oranı` : "Önceki audit doğruluk oranı";
  }, [snapshot?.period.month]);
  const currentAudits = useMemo(() => (snapshot ? selectAuditMetrics(snapshot.datasets) : []), [snapshot]);
  const highlightAudits = useMemo(
    () => currentAudits.filter((a) => !highlightExcludedKeys.has(a.agentKey)),
    [currentAudits, highlightExcludedKeys]
  );
  const agents = useMemo<AuditAgentRow[]>(() => {
    if (!snapshot) return [];
    const auditMap = new Map(
      currentAudits.map((record) => [
        record.agentKey,
        {
          id: record.id,
          agentName: record.agentName,
          auditScore: record.auditScore,
          previousAuditAccuracy: record.previousAuditAccuracy
        }
      ])
    );
    const agentMetricMap = new Map(
      snapshot.datasets.agentMetrics.map((agent) => [
        agent.agentKey,
        {
          id: agent.id,
          agentName: agent.agentName,
          auditScore: agent.auditScore,
          previousAuditAccuracy: agent.previousAuditAccuracy
        }
      ])
    );
    const agentKeys = new Set([
      ...snapshot.datasets.agentMetrics.map((agent) => agent.agentKey),
      ...currentAudits.map((record) => record.agentKey)
    ]);

    const sortedAgents = Array.from(agentKeys)
      .map((agentKey) => {
        const audit = auditMap.get(agentKey);
        const agent = agentMetricMap.get(agentKey);

        return {
          id: agent?.id ?? audit?.id ?? agentKey,
          agentKey,
          agentName: audit?.agentName ?? agent?.agentName ?? agentKey,
          auditScoreDisplay: audit?.auditScore ?? agent?.auditScore ?? null,
          previousAuditAccuracyDisplay: audit?.previousAuditAccuracy ?? agent?.previousAuditAccuracy ?? null
        };
      })
      .sort((left, right) => {
        const leftScore = left.auditScoreDisplay;
        const rightScore = right.auditScoreDisplay;

        if (leftScore === null && rightScore === null) {
          return left.agentName.localeCompare(right.agentName, "tr");
        }

        if (leftScore === null) {
          return 1;
        }

        if (rightScore === null) {
          return -1;
        }

        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }

        return left.agentName.localeCompare(right.agentName, "tr");
      });

    return sortedAgents.map((agent, index) => ({
      ...agent,
      listIndex: index + 1
    }));
  }, [currentAudits, snapshot]);
  const filteredAgents = useMemo(() => {
    if (!badgeFilter) return agents;
    return agents.filter((a) => (repsMap.get(a.agentKey)?.badges ?? []).includes(badgeFilter));
  }, [agents, badgeFilter, repsMap]);
  const evaluatedAgentCount = useMemo(
    () =>
      (snapshot?.datasets.auditMetrics ?? []).filter(
        (agent) => agent.auditScore !== null && !isAuditSummaryRow(agent.agentName)
      ).length,
    [snapshot]
  );
  const auditLeaders = useMemo(() => {
    const scoredAgents = highlightAudits.filter(
      (agent): agent is typeof agent & { auditScore: number } => agent.auditScore !== null
    );

    if (scoredAgents.length === 0) {
      return [];
    }

    const topScore = Math.max(...scoredAgents.map((agent) => agent.auditScore));
    return scoredAgents
      .filter((agent) => agent.auditScore === topScore)
      .sort((left, right) => left.agentName.localeCompare(right.agentName, "tr"))
      .map((agent, index) => ({
        name: agent.agentName,
        imageAlt: agent.agentName,
        imageSrc: buildAgentAvatar(agent.agentName, index)
      }));
  }, [highlightAudits]);
  const auditLeaderNames = auditLeaders.map((leader) => leader.name).join(", ");
  const topHighlightScore = useMemo(() => {
    const scored = highlightAudits
      .map((a) => a.auditScore)
      .filter((v): v is number => v !== null);
    return scored.length === 0 ? null : Math.max(...scored);
  }, [highlightAudits]);
  const lowestAuditGroup = useMemo(() => {
    const scoredAgents = highlightAudits.filter(
      (agent): agent is typeof agent & { auditScore: number } => agent.auditScore !== null
    );

    if (scoredAgents.length === 0) {
      return null;
    }

    const lowestScore = Math.min(...scoredAgents.map((agent) => agent.auditScore));
    const leaders = scoredAgents
      .filter((agent) => agent.auditScore === lowestScore)
      .sort((left, right) => left.agentName.localeCompare(right.agentName, "tr"));

    return {
      names: leaders.map((agent) => agent.agentName).join(", "),
      score: lowestScore
    };
  }, [highlightAudits]);

  /* ── CS dönemleri (yıla göre — trend için) ── */
  const trendYearPeriods = useMemo(
    () =>
      sortedPeriods.filter(
        (p) => (p.department ?? "cs") === "cs" && selectedYear && p.month.startsWith(`${selectedYear}-`)
      ),
    [sortedPeriods, selectedYear]
  );
  const csYearPeriodIds = useMemo(() => trendYearPeriods.map((p) => p.id), [trendYearPeriods]);

  /* ── Toplu audit history ── */
  const auditHistoryBulkQuery = useQuery({
    enabled: csYearPeriodIds.length > 0,
    queryKey: ["audit-history-bulk", auth.token, csYearPeriodIds],
    queryFn: () => api.getAuditMetricsForPeriods(auth.token, csYearPeriodIds),
    staleTime: 5 * 60 * 1000
  });
  const auditHistoryMap = auditHistoryBulkQuery.data;

  const auditHistory = useMemo(() => {
    if (!auditHistoryMap || !selectedYear) return [];

    const points = trendYearPeriods.map((period) => {
      const audits = auditHistoryMap[period.id] ?? [];
      const auditAverage = average(audits.filter((a) => !isAuditSummaryRow(a.agentName)).map((a) => a.auditScore));
      return {
        periodId: period.id,
        period: period.month,
        title: period.title,
        audit: auditAverage,
        csat: null
      };
    });

    return buildYearTrendPoints({
      year: selectedYear,
      currentPeriodId: periodId,
      points
    });
  }, [auditHistoryMap, trendYearPeriods, periodId, selectedYear]);
  const auditHistoryLoading = auditHistoryBulkQuery.isPending;
  const auditHistoryError = auditHistoryBulkQuery.isError;

  /* ── Önceki dönem karşılaştırma ── */
  const previousPeriod = useMemo(() => {
    const idx = trendYearPeriods.findIndex((p) => p.id === periodId);
    return idx > 0 ? trendYearPeriods[idx - 1] : undefined;
  }, [trendYearPeriods, periodId]);
  const previousAuditMetrics = previousPeriod && auditHistoryMap ? auditHistoryMap[previousPeriod.id] : undefined;

  const performanceShift = useMemo(() => {
    if (!previousAuditMetrics) {
      return null;
    }

    const previousAuditMap = new Map(
      previousAuditMetrics
        .filter((agent): agent is typeof agent & { auditScore: number } => agent.auditScore !== null)
        .map((agent) => [agent.agentKey, agent.auditScore])
    );

    const changes = highlightAudits
      .filter((agent): agent is typeof agent & { auditScore: number } => agent.auditScore !== null)
      .map((agent) => {
        const previousScore = previousAuditMap.get(agent.agentKey);
        if (previousScore === undefined) {
          return null;
        }

        return {
          label: agent.agentName,
          delta: Number((agent.auditScore - previousScore).toFixed(2))
        };
      })
      .filter((item): item is { label: string; delta: number } => item !== null);

    if (changes.length === 0) {
      return null;
    }

    const highestIncrease = Math.max(...changes.map((item) => item.delta));
    if (highestIncrease > 0) {
      const leaders = changes
        .filter((item) => item.delta === highestIncrease)
        .sort((left, right) => left.label.localeCompare(right.label, "tr"));

      return {
        title: "Yükselen performans",
        names: leaders.map((item) => item.label).join(", "),
        delta: highestIncrease
      };
    }

    const biggestDecrease = Math.min(...changes.map((item) => item.delta));
    if (biggestDecrease < 0) {
      const leaders = changes
        .filter((item) => item.delta === biggestDecrease)
        .sort((left, right) => left.label.localeCompare(right.label, "tr"));

      return {
        title: "Düşen performans",
        names: leaders.map((item) => item.label).join(", "),
        delta: biggestDecrease
      };
    }

    return {
      title: "Aylık değişim",
      names: changes
        .map((item) => item.label)
        .sort((left, right) => left.localeCompare(right, "tr"))
        .join(", "),
      delta: 0
    };
  }, [highlightAudits, previousAuditMetrics]);

  /* ── Aylık audit pivot tablosu (ortalama) ── */
  const auditMonthlyData = useMemo<MonthlyAgentRow[]>(() => {
    if (!auditHistoryMap || !selectedYear) return [];

    const agentMap = new Map<string, string>();
    const agentMonths = new Map<string, (number | null)[]>();

    for (const period of trendYearPeriods) {
      const monthIdx = Number(period.month.split("-")[1]) - 1;
      const audits = auditHistoryMap[period.id] ?? [];

      for (const audit of audits) {
        if (isAuditSummaryRow(audit.agentName)) continue;
        agentMap.set(audit.agentKey, audit.agentName);
        if (!agentMonths.has(audit.agentKey)) {
          agentMonths.set(audit.agentKey, Array(12).fill(null));
        }
        agentMonths.get(audit.agentKey)![monthIdx] = audit.auditScore;
      }
    }

    return Array.from(agentMap.entries())
      .map(([key, name]) => ({
        agentKey: key,
        agentName: name,
        months: agentMonths.get(key) ?? Array(12).fill(null)
      }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));
  }, [auditHistoryMap, trendYearPeriods, selectedYear]);
  const filteredMonthlyData = useMemo(() => {
    if (!badgeFilter) return auditMonthlyData;
    return auditMonthlyData.filter((r) => (repsMap.get(r.agentKey)?.badges ?? []).includes(badgeFilter));
  }, [auditMonthlyData, badgeFilter, repsMap]);

  /* ── Aylık role-play pivot tablosu (toplam) ── */
  const columns: ColumnDef<AuditAgentRow, any>[] = [
    columnHelper.accessor("listIndex", {
      header: "#",
      cell: (info) => <span className="font-medium text-slate-500">{info.getValue()}</span>
    }),
    columnHelper.accessor("agentName", {
      header: "Temsilci",
      cell: (info) => <RepNameCell name={info.getValue()} rep={repsMap.get(info.row.original.agentKey)} />
    }),
    columnHelper.accessor("auditScoreDisplay", {
      header: "Audit skoru",
      cell: (info) => <AuditTableBadge value={info.getValue()} />
    }),
    columnHelper.accessor("previousAuditAccuracyDisplay", {
      header: "Önceki audit doğruluk",
      cell: (info) => <AuditTableBadge value={info.getValue()} isPercent />
    })
  ];

  const tableSummaryRows = useMemo(() => {
    // Ortalama satırı 'satıcı operasyon' etiketlileri de içerir.
    // Etiket filtresi aktifse ortalama yalnızca filtrelenmiş temsilciler üzerinden hesaplanır.
    let fullAudits = aggregatedSnapshot ? selectAuditMetrics(aggregatedSnapshot.datasets) : [];
    let fullAgents = aggregatedSnapshot?.datasets.agentMetrics ?? [];
    if (badgeFilter) {
      fullAudits = fullAudits.filter((a) => (repsMap.get(a.agentKey)?.badges ?? []).includes(badgeFilter));
      fullAgents = fullAgents.filter((a) => (repsMap.get(a.agentKey)?.badges ?? []).includes(badgeFilter));
    }
    const auditByKey = new Map(fullAudits.map((r) => [r.agentKey, r]));
    const allKeys = new Set<string>([
      ...fullAgents.map((a) => a.agentKey),
      ...fullAudits.map((a) => a.agentKey)
    ]);
    const auditScores: Array<number | null> = [];
    const prevAuditScores: Array<number | null> = [];
    allKeys.forEach((key) => {
      const audit = auditByKey.get(key);
      const agent = fullAgents.find((a) => a.agentKey === key);
      auditScores.push(audit?.auditScore ?? agent?.auditScore ?? null);
      prevAuditScores.push(audit?.previousAuditAccuracy ?? agent?.previousAuditAccuracy ?? null);
    });
    if (auditScores.every((v) => v === null)) {
      return [] as Array<Record<string, ReactNode> & { _tone?: "emerald" }>;
    }
    return [
      {
        _tone: "emerald" as const,
        listIndex: "",
        agentName: "ORTALAMA",
        auditScoreDisplay: formatAuditScore(average(auditScores)),
        previousAuditAccuracyDisplay: formatPercent(average(prevAuditScores))
      }
    ];
  }, [aggregatedSnapshot, badgeFilter, repsMap]);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit" actions={<PeriodRangeFilter onChange={setPeriodRange} periods={sortedPeriods} value={{ ...periodRange, monthPeriodId: monthlyPeriodId }} />} />

      {snapshot ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <CompactStatCard
              label="Takım audit ortalaması"
              value={formatAuditScore(snapshot.summary.auditAverage)}
            />
            <CompactStatCard
              label={previousAuditAccuracyLabel}
              value={formatPercent(snapshot.summary.previousAuditAccuracyAverage)}
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
              hint={performanceShift ? `${performanceShift.delta > 0 ? "+" : ""}${formatNumber(performanceShift.delta, 2)} puan` : undefined}
            />
            <CompactStatCard
              label="En düşük audit"
              valueClassName="text-base font-semibold leading-snug"
              value={
                <span className="flex items-start gap-1.5">
                  <TrendingDown className="mt-0.5 shrink-0 text-rose-500" size={16} />
                  <span className="min-w-0 break-words">{lowestAuditGroup?.names ?? "Henüz yok"}</span>
                </span>
              }
              hint={lowestAuditGroup ? formatAuditScore(lowestAuditGroup.score) : undefined}
            />
          </div>

          <div>
            <ChampionSpotlightCard
              kicker={auditLeaders.length > 1 ? "Öne çıkan temsilciler" : "Öne çıkan temsilci"}
              metricLabel={auditLeaders.length > 1 ? "Lider temsilciler" : "Lider temsilci"}
              name={auditLeaderNames || "Takip ediliyor"}
              people={auditLeaders}
              score={formatAuditScore(topHighlightScore)}
              showPodium={false}
              theme="orange"
              title="En yüksek audit skoru"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <TrendLineCard
              color={chart.barDefault}
              data={auditHistory}
              emptyMessage={
                auditHistoryLoading
                  ? "Yıllık audit verisi yükleniyor..."
                  : auditHistoryError
                    ? "Audit verisi alınamadı."
                    : "Bu yıl için audit verisi bulunamadı."
              }
              metricKey="audit"
              title="Audit"
              valueFormatter={(value) => formatAuditScore(value)}
              yDomain={[0, 100]}
            />

            <Leaderboard
              items={[...highlightAudits]
                .filter((a): a is typeof a & { auditScore: number } => a.auditScore !== null)
                .sort((left, right) => right.auditScore - left.auditScore)
                .slice(0, 5)
                .map((a) => ({
                  id: a.id,
                  label: a.agentName,
                  value: formatAuditScore(a.auditScore)
                }))}
              title="Audit lider tablosu"
            />
          </div>

          <SurfaceCard
            title="Detay tablo görünümü"
            variant="default"
            actions={<BadgeFilter onChange={setBadgeFilter} value={badgeFilter} />}
          >
            <DataTable
              columns={columns}
              data={filteredAgents}
              density="comfortable"
              variant="emerald"
              striped
              summaryRows={tableSummaryRows}
              emptyState="Seçilen dönemde gösterilecek audit kaydı bulunamadı."
            />
          </SurfaceCard>

          <MonthlyTable
            data={filteredMonthlyData}
            summaryMode="average"
            title="Aylık Audit Skorları"
            valueFormatter={(v) => formatAuditScore(v)}
            actions={<BadgeFilter onChange={setBadgeFilter} value={badgeFilter} />}
            repsMap={repsMap}
          />

        </>
      ) : (
        <SurfaceCard title="Audit" variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">Audit verisi yükleniyor...</p>
        </SurfaceCard>
      )}
    </div>
  );
}
