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
import { resolveThresholdTone, selectDefaultReportPeriod } from "@kalitedb/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { PeriodSelect } from "../components/period-select";
import { useSearchParams } from "react-router-dom";

import { TrendLineCard, buildYearTrendPoints } from "../components/year-trend-card";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatAuditScore, formatDelta, formatNumber, formatPercent, formatPeriodMonth, getPreviousPeriod } from "../lib/format";
import { brand, chart } from "../theme/colors";

const TREND_DATASET_TYPES = ["agent-metrics", "audit-metrics"] as const;

export function DashboardPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const periodId = searchParams.get("periodId") ?? selectDefaultReportPeriod(periodsQuery.data ?? [])?.id;
  const compareToPeriodId = searchParams.get("compareToPeriodId") ?? undefined;

  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const snapshot = dashboardQuery.data;
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === periodId);
  const selectedYear = selectedPeriod?.month.slice(0, 4);

  const yearPeriods = useMemo(
    () =>
      selectedYear
        ? (periodsQuery.data ?? [])
            .filter((period) => period.month.startsWith(`${selectedYear}-`))
            .sort((left, right) => left.month.localeCompare(right.month))
        : [],
    [periodsQuery.data, selectedYear]
  );

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
    <div className="space-y-6">
      <PageHeader title="Genel Bakış" actions={<PeriodSelect />} />

      {snapshot ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
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

          <ExecutiveChartCard title="Yıllık">
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

          <div className="grid gap-6 xl:grid-cols-2">
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
