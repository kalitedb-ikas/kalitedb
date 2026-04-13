import { ChampionSpotlightCard, InsightTile, Leaderboard, PageHeader, StatCard, SurfaceCard } from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { average, resolveThresholdTone, selectAuditMetrics, selectDefaultReportPeriod } from "@kalitedb/shared";
import { LineChart, ShieldCheck, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { PeriodSelect } from "../components/period-select";
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
  const [searchParams] = useSearchParams();

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });
  const sortedPeriods = useMemo(
    () => [...(periodsQuery.data ?? [])].sort((left, right) => left.month.localeCompare(right.month)),
    [periodsQuery.data]
  );
  const periodId = searchParams.get("periodId") ?? selectDefaultReportPeriod(periodsQuery.data ?? [])?.id;
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === periodId);
  const selectedYear = selectedPeriod?.month.slice(0, 4);
  const compareToPeriodId = searchParams.get("compareToPeriodId") ?? undefined;
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const snapshot = dashboardQuery.data;
  const previousAuditAccuracyLabel = useMemo(() => {
    const previousPeriod = getPreviousPeriod(snapshot?.period.month);
    return previousPeriod ? `${formatPeriodMonth(previousPeriod, { includeYear: true })} audit doğruluk oranı` : "Önceki audit doğruluk oranı";
  }, [snapshot?.period.month]);
  const auditThreshold = snapshot?.thresholds.auditScore;
  const currentAudits = useMemo(() => (snapshot ? selectAuditMetrics(snapshot.datasets) : []), [snapshot]);
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
  const evaluatedAgentCount = useMemo(
    () =>
      (snapshot?.datasets.auditMetrics ?? []).filter(
        (agent) => agent.auditScore !== null && !isAuditSummaryRow(agent.agentName)
      ).length,
    [snapshot]
  );
  const auditLeaders = useMemo(() => {
    const scoredAgents = currentAudits.filter(
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
  }, [currentAudits]);
  const auditLeaderNames = auditLeaders.map((leader) => leader.name).join(", ");
  const lowestAuditGroup = useMemo(() => {
    const scoredAgents = currentAudits.filter(
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
  }, [currentAudits]);

  /* ── CS dönemleri (yıla göre) ── */
  const csYearPeriods = useMemo(
    () =>
      sortedPeriods.filter(
        (p) => (p.department ?? "cs") === "cs" && selectedYear && p.month.startsWith(`${selectedYear}-`)
      ),
    [sortedPeriods, selectedYear]
  );
  const csYearPeriodIds = useMemo(() => csYearPeriods.map((p) => p.id), [csYearPeriods]);

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

    const points = csYearPeriods.map((period) => {
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
  }, [auditHistoryMap, csYearPeriods, periodId, selectedYear]);
  const auditHistoryLoading = auditHistoryBulkQuery.isPending;
  const auditHistoryError = auditHistoryBulkQuery.isError;

  /* ── Önceki dönem karşılaştırma ── */
  const previousPeriod = useMemo(() => {
    const idx = csYearPeriods.findIndex((p) => p.id === periodId);
    return idx > 0 ? csYearPeriods[idx - 1] : undefined;
  }, [csYearPeriods, periodId]);
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

    const changes = currentAudits
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
  }, [currentAudits, previousAuditMetrics]);

  /* ── Aylık audit pivot tablosu (ortalama) ── */
  const auditMonthlyData = useMemo<MonthlyAgentRow[]>(() => {
    if (!auditHistoryMap || !selectedYear) return [];

    const agentMap = new Map<string, string>();
    const agentMonths = new Map<string, (number | null)[]>();

    for (const period of csYearPeriods) {
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
  }, [auditHistoryMap, csYearPeriods, selectedYear]);

  /* ── Aylık role-play pivot tablosu (toplam) ── */
  const columns: ColumnDef<AuditAgentRow, any>[] = [
    columnHelper.accessor("listIndex", {
      header: "#",
      cell: (info) => <span className="font-medium text-slate-500">{info.getValue()}</span>
    }),
    columnHelper.accessor("agentName", { header: "Temsilci" }),
    columnHelper.accessor("auditScoreDisplay", {
      header: "Audit skoru",
      cell: (info) => <AuditTableBadge value={info.getValue()} />
    }),
    columnHelper.accessor("previousAuditAccuracyDisplay", {
      header: "Önceki audit doğruluk",
      cell: (info) => <AuditTableBadge value={info.getValue()} isPercent />
    })
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Audit" actions={<PeriodSelect />} />

      {snapshot ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <StatCard
              icon={<ShieldCheck size={18} />}
              label="Takım audit ortalaması"
              tone={auditThreshold ? resolveThresholdTone(snapshot.summary.auditAverage, auditThreshold) : "neutral"}
              value={formatAuditScore(snapshot.summary.auditAverage)}
            />
            <StatCard
              icon={<LineChart size={18} />}
              label={previousAuditAccuracyLabel}
              tone="neutral"
              value={formatPercent(snapshot.summary.previousAuditAccuracyAverage)}
            />
            <StatCard
              icon={<Users size={18} />}
              label="Değerlendirilen temsilci"
              tone="neutral"
              value={formatNumber(evaluatedAgentCount)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <ChampionSpotlightCard
              kicker={auditLeaders.length > 1 ? "Öne çıkan temsilciler" : "Öne çıkan temsilci"}
              metricLabel={auditLeaders.length > 1 ? "Lider temsilciler" : "Lider temsilci"}
              name={auditLeaderNames || snapshot.highlights.bestAudit?.label || "Takip ediliyor"}
              people={auditLeaders}
              score={formatAuditScore(snapshot.highlights.bestAudit?.value)}
              showPodium={false}
              theme="orange"
              title="En yüksek audit skoru"
            />

            <div className="grid gap-4">
              <InsightTile
                description={performanceShift ? `${performanceShift.delta > 0 ? "+" : ""}${formatNumber(performanceShift.delta, 2)} puan` : undefined}
                icon={<TrendingUp size={16} />}
                title={performanceShift?.title ?? "Yükselen performans"}
                value={performanceShift?.names ?? "Henüz yok"}
              />
              <InsightTile
                description={formatAuditScore(lowestAuditGroup?.score)}
                icon={<TrendingDown size={16} />}
                title="En düşük audit"
                value={lowestAuditGroup?.names ?? "Henüz yok"}
              />
            </div>
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
              items={snapshot.rankings.auditTop.slice(0, 5).map((item) => ({
                id: item.id,
                label: item.label,
                value: formatAuditScore(item.value)
              }))}
              title="Audit lider tablosu"
            />
          </div>

          <SurfaceCard
            title="Detay tablo görünümü"
            variant="default"
            headerClassName="bg-emerald-800 border-emerald-700 dark:bg-emerald-900"
            titleClassName="text-white"
          >
            <DataTable
              columns={columns}
              data={agents}
              density="comfortable"
              emptyState="Seçilen dönemde gösterilecek audit kaydı bulunamadı."
            />
          </SurfaceCard>

          <MonthlyTable
            data={auditMonthlyData}
            summaryMode="average"
            title="Aylık Audit Skorları"
            valueFormatter={(v) => formatAuditScore(v)}
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
