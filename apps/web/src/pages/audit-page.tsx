import { ChampionSpotlightCard, ExecutiveChartCard, InsightTile, Leaderboard, PageHeader, StatCard, SurfaceCard } from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { average, normalizeKey, resolveThresholdTone, selectAuditMetrics, selectDefaultReportPeriod } from "@kalitedb/shared";
import { LineChart, ShieldCheck, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { TrendLineCard, buildYearTrendPoints } from "../components/year-trend-card";
import { DataTable } from "../components/data-table";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatAuditScore, formatNumber, formatPercent, formatPeriodMonth, getPreviousPeriod } from "../lib/format";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";
import { chart } from "../theme/colors";

function isAuditSummaryRow(agentName: string) {
  return normalizeKey(agentName).includes("ortalama");
}

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

  const auditHistoryQueries = useQueries({
    queries: sortedPeriods.map((period) => ({
      enabled: true,
      queryKey: ["audit-history", auth.token, period.id],
      queryFn: () =>
        api.getPeriodDetails(auth.token, period.id, {
          datasetTypes: ["audit-metrics"],
          includeImportJobs: false
        }),
      staleTime: 5 * 60 * 1000
    }))
  });
  const auditHistory = useMemo(() => {
    const points = sortedPeriods
      .map((period, index) => {
        const detail = auditHistoryQueries[index]?.data;
        const auditAverage = detail
          ? average(selectAuditMetrics(detail.datasets).map((item) => item.auditScore))
          : null;
        return {
          periodId: period.id,
          period: period.month,
          title: period.title,
          audit: auditAverage,
          csat: null
        };
      })
      .filter((item) => selectedYear ? item.period.startsWith(`${selectedYear}-`) : false);

    return selectedYear
      ? buildYearTrendPoints({
          year: selectedYear,
          currentPeriodId: periodId,
          points
        })
      : [];
  }, [auditHistoryQueries, periodId, selectedYear, sortedPeriods]);
  const auditHistoryLoading = auditHistoryQueries.some((query) => query.isPending);
  const auditHistoryError = auditHistoryQueries.some((query) => query.isError);
  const previousPeriodIndex = useMemo(
    () => sortedPeriods.findIndex((period) => period.id === periodId) - 1,
    [periodId, sortedPeriods]
  );
  const previousAuditDetail = previousPeriodIndex >= 0 ? auditHistoryQueries[previousPeriodIndex]?.data : undefined;
  const performanceShift = useMemo(() => {
    if (!previousAuditDetail) {
      return null;
    }

    const previousAuditMap = new Map(
      selectAuditMetrics(previousAuditDetail.datasets)
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
  }, [currentAudits, previousAuditDetail]);

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
      <PageHeader title="Audit" />

      {snapshot ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <StatCard
              emphasis="primary"
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
              delta={
                snapshot.highlights.bestAudit?.delta != null
                  ? `Değişim ${snapshot.highlights.bestAudit.delta > 0 ? "+" : ""}${formatNumber(snapshot.highlights.bestAudit.delta, 2)}`
                  : undefined
              }
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
              <SurfaceCard
                title="Kısa özet"
                variant="default"
              >
                <div className="space-y-3">
                  <SummaryLine
                    title="Değerlendirilen temsilci"
                    value={formatNumber(evaluatedAgentCount)}
                  />
                  <SummaryLine
                    title="En yüksek audit"
                    value={formatAuditScore(snapshot.highlights.bestAudit?.value)}
                  />
                  <SummaryLine
                    title="En düşük audit"
                    value={formatAuditScore(snapshot.highlights.lowestAudit?.value)}
                  />
                </div>
              </SurfaceCard>
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
                value: formatAuditScore(item.value),
                ...(item.delta != null ? { delta: `Değişim ${formatNumber(item.delta, 2)}` } : {})
              }))}
              title="Audit lider tablosu"
            />
          </div>

          <SurfaceCard
            title="Detay tablo görünümü"
            variant="default"
          >
            <DataTable
              columns={columns}
              data={agents}
              density="comfortable"
              emptyState="Seçilen dönemde gösterilecek audit kaydı bulunamadı."
            />
          </SurfaceCard>
        </>
      ) : (
        <SurfaceCard title="Audit" variant="default">
          <p className="text-sm text-slate-600">Audit verisi yükleniyor...</p>
        </SurfaceCard>
      )}
    </div>
  );
}

function SummaryLine(props: { title: string; value: string; detail?: string | undefined }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/92 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{props.title}</p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{props.value}</p>
      {props.detail ? <p className="mt-1 text-sm text-slate-500">{props.detail}</p> : null}
    </div>
  );
}

function AuditTableBadge(props: { value: number | null | undefined; isPercent?: boolean }) {
  if (props.value === null || props.value === undefined) {
    return <span className="text-slate-400">-</span>;
  }

  const toneClass =
    props.value < 70
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : props.value < 85
        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
        : "border-emerald-300 bg-emerald-100 text-emerald-800";

  return (
    <span className={`inline-flex min-w-24 justify-center rounded-full border px-3 py-1.5 text-sm font-semibold ${toneClass}`}>
      {props.isPercent ? formatPercent(props.value) : formatAuditScore(props.value)}
    </span>
  );
}

function buildAgentAvatar(name: string, index: number) {
  const repositoryPhoto = getRepresentativePhotoSrc(name);
  if (repositoryPhoto) {
    return repositoryPhoto;
  }

  const palettes: Array<{ start: string; end: string }> = [
    { start: "#fb923c", end: "#f97316" },
    { start: "#38bdf8", end: "#0ea5e9" },
    { start: "#34d399", end: "#10b981" },
    { start: "#a78bfa", end: "#8b5cf6" }
  ];
  const palette = palettes[index % palettes.length] || { start: "#fb923c", end: "#f97316" };
  const initials = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="40" fill="url(#bg)" />
      <text
        x="50%"
        y="54%"
        dominant-baseline="middle"
        text-anchor="middle"
        fill="white"
        font-family="Inter, Arial, sans-serif"
        font-size="52"
        font-weight="700"
        letter-spacing="4"
      >
        ${initials}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
