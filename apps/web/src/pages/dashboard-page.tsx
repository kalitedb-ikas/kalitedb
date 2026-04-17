import {
  Award,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import {
  ExecutiveChartCard,
  Leaderboard,
  PageHeader,
  StatCard,
  SurfaceCard
} from "@kalitedb/ui";
import {
  average,
  buildDashboardSnapshot,
  resolveThresholdTone,
  selectDefaultReportPeriod,
  type AgentMetric,
  type AuditMetric
} from "@kalitedb/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";

import { TrendLineCard, buildYearTrendPoints } from "../components/year-trend-card";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatAuditScore, formatDelta, formatNumber, formatPercent, formatPeriodMonth, getPreviousPeriod } from "../lib/format";
import { aggregateAgentMetrics, aggregateAuditMetrics, computeActivePeriodIds, derivePeriodRangeSelectors } from "../lib/period-aggregation";
import { useRepresentativeKeysWithBadge } from "../lib/use-active-representatives";
import { brand, chart } from "../theme/colors";

const TREND_DATASET_TYPES = ["agent-metrics", "audit-metrics"] as const;

export function DashboardPage() {
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

  const csPeriods = useMemo(
    () => [...(periodsQuery.data ?? [])].filter((p) => (p.department ?? "cs") === "cs").sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const { yearPeriods: csYearPeriods } = useMemo(
    () => derivePeriodRangeSelectors(csPeriods, periodRange.year),
    [csPeriods, periodRange.year]
  );

  const defaultPeriod = useMemo(() => {
    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
    return csYearPeriods.find((p) => p.month === prevMonth) ?? selectDefaultReportPeriod(csYearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csYearPeriods]);

  const monthlyPeriodId = csYearPeriods.some((p) => p.id === periodRange.monthPeriodId) ? periodRange.monthPeriodId : defaultPeriod?.id;

  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) {
      setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
    }
  }, [defaultPeriod?.id, periodRange.monthPeriodId]);

  const activePeriodIds = useMemo(
    () => computeActivePeriodIds(csYearPeriods, { ...periodRange, monthPeriodId: monthlyPeriodId }),
    [periodRange, monthlyPeriodId, csYearPeriods]
  );

  // Dashboard tek dönem gösterir; çeyreklik/yıllıkta en güncel dönemi kullan
  const periodId = activePeriodIds.length > 0 ? activePeriodIds[activePeriodIds.length - 1] : undefined;
  const compareToPeriodId = undefined;

  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const baseSnapshot = dashboardQuery.data;
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === periodId);
  const selectedYear = selectedPeriod?.month.slice(0, 4);

  const yearPeriods = csYearPeriods;
  const yearPeriodIds = useMemo(() => yearPeriods.map((p) => p.id), [yearPeriods]);
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

  // "Premium Onboarding" etiketlilerin CSAT skoru null'lanır → ortalama, leaderboard,
  // champion ve tablo CSAT sütunundan otomatik düşer.
  const premiumOnboardingKeys = useRepresentativeKeysWithBadge("premium_onboarding");
  const aggregatedSnapshotCsatAdjusted = useMemo(() => {
    if (!aggregatedSnapshot) return undefined;
    if (premiumOnboardingKeys.size === 0) return aggregatedSnapshot;
    const adjustedAgents = aggregatedSnapshot.datasets.agentMetrics.map((a) =>
      premiumOnboardingKeys.has(a.agentKey) ? { ...a, callEvaluationAverage: null } : a
    );
    return buildDashboardSnapshot({
      period: aggregatedSnapshot.period,
      datasets: { ...aggregatedSnapshot.datasets, agentMetrics: adjustedAgents },
      thresholds: aggregatedSnapshot.thresholds
    });
  }, [aggregatedSnapshot, premiumOnboardingKeys]);

  // "Satıcı Operasyon" etiketli temsilciler tablolardan/lider tablosundan gizlenir,
  // özet/ortalama hesaplarına dahil edilir.
  const hiddenAgentKeys = useRepresentativeKeysWithBadge("satici_operasyon");
  const snapshot = useMemo(() => {
    if (!aggregatedSnapshotCsatAdjusted) return undefined;
    if (hiddenAgentKeys.size === 0) return aggregatedSnapshotCsatAdjusted;
    const filteredAgents = aggregatedSnapshotCsatAdjusted.datasets.agentMetrics.filter(
      (a) => !hiddenAgentKeys.has(a.agentKey)
    );
    const filteredAudits = aggregatedSnapshotCsatAdjusted.datasets.auditMetrics.filter(
      (a) => !hiddenAgentKeys.has(a.agentKey)
    );
    const rebuilt = buildDashboardSnapshot({
      period: aggregatedSnapshotCsatAdjusted.period,
      datasets: {
        ...aggregatedSnapshotCsatAdjusted.datasets,
        agentMetrics: filteredAgents,
        auditMetrics: filteredAudits
      },
      thresholds: aggregatedSnapshotCsatAdjusted.thresholds
    });
    return { ...rebuilt, summary: aggregatedSnapshotCsatAdjusted.summary };
  }, [aggregatedSnapshotCsatAdjusted, hiddenAgentKeys]);

  const yearlyTrendQuery = useQuery({
    enabled: yearPeriods.length > 0,
    queryKey: ["dashboard-yearly-trends", auth.token, selectedYear, yearPeriods.map((period) => period.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        yearPeriods.map(async (period) => {
          const summary = await api.getDashboard(auth.token, period.id, undefined, {
            datasetTypes: [...TREND_DATASET_TYPES]
          });

          return {
            periodId: period.id,
            period: period.month,
            title: period.title,
            audit: summary.summary.auditAverage,
            csat: summary.summary.csatAverage
          };
        })
      );

      return buildYearTrendPoints({
        year: selectedYear!,
        currentPeriodId: periodId,
        points: results
      });
    },
    staleTime: 5 * 60 * 1000
  });

  const previousAuditAccuracyAverage = snapshot?.summary.previousAuditAccuracyAverage ?? null;
  const previousAuditAccuracyLabel = useMemo(() => {
    const previousPeriod = getPreviousPeriod(snapshot?.period.month);
    return previousPeriod ? `${formatPeriodMonth(previousPeriod, { includeYear: true })} audit doğruluk oranı` : "Önceki audit doğruluk oranı";
  }, [snapshot?.period.month]);

  const previousAuditAccuracyTone = useMemo(() => {
    if (previousAuditAccuracyAverage === null) {
      return "neutral" as const;
    }
    if (previousAuditAccuracyAverage >= 80) return "green" as const;
    if (previousAuditAccuracyAverage >= 60) return "yellow" as const;
    return "red" as const;
  }, [previousAuditAccuracyAverage]);

  const yearlyTrend = yearlyTrendQuery.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader className="dash-section" title="Genel Bakış" actions={<PeriodRangeFilter onChange={setPeriodRange} periods={csPeriods} value={{ ...periodRange, monthPeriodId: monthlyPeriodId }} />} />

      {snapshot ? (
        <>
          <div className="dash-section dash-delay-1 grid gap-4 lg:grid-cols-3">
            <StatCard
              icon={<CheckCircle2 size={18} />}
              label="Audit ortalaması"
              tone={snapshot.thresholds.auditScore ? resolveThresholdTone(snapshot.summary.auditAverage, snapshot.thresholds.auditScore) : "neutral"}
              value={formatAuditScore(snapshot.summary.auditAverage)}
            />
            <StatCard
              icon={<Award size={18} />}
              label="CSAT ortalaması"
              tone={
                snapshot.thresholds.callEvaluationAverage
                  ? resolveThresholdTone(snapshot.summary.csatAverage, snapshot.thresholds.callEvaluationAverage)
                  : "neutral"
              }
              value={formatNumber(snapshot.summary.csatAverage, 3)}
            />
            <StatCard
              icon={<BookOpen size={18} />}
              label={previousAuditAccuracyLabel}
              tone={previousAuditAccuracyTone}
              value={formatPercent(previousAuditAccuracyAverage)}
            />
          </div>

          <ExecutiveChartCard className="dash-section dash-delay-2" title="Yıllık">
            <div className="grid gap-4 xl:grid-cols-2">
              <TrendLineCard
                color={chart.barDefault}
                data={yearlyTrend}
                emptyMessage={
                  yearlyTrendQuery.isPending
                    ? "Yıllık audit verisi yükleniyor..."
                    : yearlyTrendQuery.isError
                      ? "Audit verisi alınamadı."
                      : "Bu yıl için audit verisi bulunamadı."
                }
                metricKey="audit"
                title="Audit"
                valueFormatter={(value) => formatAuditScore(value)}
                yDomain={[0, 100]}
              />
              <TrendLineCard
                color={brand.sky}
                data={yearlyTrend}
                emptyMessage={
                  yearlyTrendQuery.isPending
                    ? "Yıllık CSAT verisi yükleniyor..."
                    : yearlyTrendQuery.isError
                      ? "CSAT verisi alınamadı."
                      : "Bu yıl için CSAT verisi bulunamadı."
                }
                metricKey="csat"
                title="CSAT"
                valueFormatter={(value) => formatNumber(value, 3)}
                yDomain={[4.5, 5]}
                yTicks={[4.5, 4.6, 4.7, 4.8, 4.9, 5]}
              />
            </div>
          </ExecutiveChartCard>

          <div className="dash-section dash-delay-3 grid gap-6 xl:grid-cols-2">
            <Leaderboard
              items={snapshot.rankings.auditTop.slice(0, 5).map((agent) => ({
                id: agent.id,
                label: agent.label,
                value: formatAuditScore(agent.value),
                ...(agent.delta != null ? { delta: `Değişim ${formatDelta(agent.delta)}` } : {})
              }))}
              title="Audit lider tablosu"
            />
            <Leaderboard
              items={snapshot.rankings.csatTop.slice(0, 5).map((agent) => ({
                id: agent.id,
                label: agent.label,
                value: formatNumber(agent.value, 3),
                ...(agent.delta != null ? { delta: `Değişim ${formatNumber(agent.delta, 2)}` } : {})
              }))}
              title="CSAT lider tablosu"
            />
          </div>
        </>
      ) : (
        <SurfaceCard title="Genel Bakış" variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">Veri yükleniyor veya henüz dönem bulunmuyor.</p>
        </SurfaceCard>
      )}
    </div>
  );
}
