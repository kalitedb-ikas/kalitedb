import {
  average,
  buildDashboardSnapshot,
  resolveThresholdTone,
  selectAuditMetrics,
  selectDefaultReportPeriod,
  sum,
  type AgentMetric,
  type AuditMetric
} from "@kalitedb/shared";
import {
  ChampionSpotlightCard,
  ExecutiveChartCard,
  HeatChip,
  Leaderboard,
  PageHeader,
  StatCard
} from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardList, Gauge, PhoneCall, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import { TrendLineCard, buildYearTrendPoints } from "../components/year-trend-card";
import { DataTable } from "../components/data-table";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatAuditScore, formatNumber, formatPercent, formatSeconds } from "../lib/format";
import { aggregateAgentMetrics, aggregateAuditMetrics, computeActivePeriodIds, derivePeriodRangeSelectors } from "../lib/period-aggregation";
import { useRepresentativeKeysWithBadge } from "../lib/use-active-representatives";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";
import { brand } from "../theme/colors";

type CsatRow = AgentMetric & {
  auditScoreDisplay: number | null;
  previousAuditAccuracyDisplay: number | null;
};

const columnHelper = createColumnHelper<CsatRow>();
const TREND_DATASET_TYPES = ["agent-metrics", "audit-metrics"] as const;

function formatNameList(names: string[]) {
  if (names.length <= 1) {
    return names[0] ?? "";
  }

  if (names.length === 2) {
    return names.join(" ve ");
  }

  return `${names.slice(0, -1).join(", ")} ve ${names.at(-1)}`;
}

export function CsatPage() {
  const auth = useAuth();
  const now = new Date();
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  });
  const datasetTypes = ["agent-metrics", "audit-metrics"] as const;
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });
  const csPeriods = useMemo(() => [...(periodsQuery.data ?? [])].filter((p) => (p.department ?? "cs") === "cs").sort((a, b) => a.month.localeCompare(b.month)), [periodsQuery.data]);
  const { yearPeriods: csYearPeriods } = useMemo(() => derivePeriodRangeSelectors(csPeriods, periodRange.year), [csPeriods, periodRange.year]);
  const defaultPeriod = useMemo(() => {
    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
    return csYearPeriods.find((p) => p.month === prevMonth) ?? selectDefaultReportPeriod(csYearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csYearPeriods]);
  const monthlyPeriodId = csYearPeriods.some((p) => p.id === periodRange.monthPeriodId) ? periodRange.monthPeriodId : defaultPeriod?.id;
  useEffect(() => { if (!periodRange.monthPeriodId && defaultPeriod?.id) setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id })); }, [defaultPeriod?.id, periodRange.monthPeriodId]);
  const activePeriodIds = useMemo(() => computeActivePeriodIds(csYearPeriods, { ...periodRange, monthPeriodId: monthlyPeriodId }), [periodRange, monthlyPeriodId, csYearPeriods]);
  const periodId = activePeriodIds.length > 0 ? activePeriodIds[activePeriodIds.length - 1] : undefined;
  const compareToPeriodId = undefined;
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === periodId);
  const selectedYear = selectedPeriod?.month.slice(0, 4);
  const yearPeriods = csYearPeriods;
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId, datasetTypes.join(",")],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId, { datasetTypes: [...datasetTypes] }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });
  const yearlyTrendQuery = useQuery({
    enabled: yearPeriods.length > 0,
    queryKey: ["csat-yearly-trends", auth.token, selectedYear, yearPeriods.map((period) => period.id).join(",")],
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

  const baseSnapshot = dashboardQuery.data;
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

  // "Premium Onboarding" etiketli temsilcilerin CSAT puanları ortalamaya dahil edilmez
  const premiumOnboardingKeys = useRepresentativeKeysWithBadge("premium_onboarding");
  const aggregatedSnapshotCsatAdjusted = useMemo(() => {
    if (!aggregatedSnapshot) return undefined;
    if (premiumOnboardingKeys.size === 0) return aggregatedSnapshot;
    const csatValues = aggregatedSnapshot.datasets.agentMetrics
      .filter((a) => !premiumOnboardingKeys.has(a.agentKey))
      .map((a) => a.callEvaluationAverage);
    return {
      ...aggregatedSnapshot,
      summary: { ...aggregatedSnapshot.summary, csatAverage: average(csatValues) }
    };
  }, [aggregatedSnapshot, premiumOnboardingKeys]);

  // "Satıcı Operasyon" etiketli temsilciler tablolardan/lider tablosundan gizlenir,
  // ama özet (summary / ortalama / toplam) hesaplarında korunur.
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

  const yearlyTrend = yearlyTrendQuery.data ?? [];
  const rows = useMemo(() => {
    if (!snapshot) return [];

    const auditMap = new Map(
      selectAuditMetrics(snapshot.datasets).map((record) => [
        record.agentKey,
        {
          auditScore: record.auditScore,
          previousAuditAccuracy: record.previousAuditAccuracy
        }
      ])
    );

    return snapshot.datasets.agentMetrics
      .map((item) => {
        const audit = auditMap.get(item.agentKey);
        return {
          ...item,
          auditScoreDisplay: audit?.auditScore ?? item.auditScore,
          previousAuditAccuracyDisplay: audit?.previousAuditAccuracy ?? item.previousAuditAccuracy
        };
      })
      .sort((left, right) => {
        const leftCsat = left.callEvaluationAverage;
        const rightCsat = right.callEvaluationAverage;

        if (leftCsat === null && rightCsat === null) {
          return left.agentName.localeCompare(right.agentName, "tr");
        }

        if (leftCsat === null) {
          return 1;
        }

        if (rightCsat === null) {
          return -1;
        }

        if (rightCsat !== leftCsat) {
          return rightCsat - leftCsat;
        }

        return left.agentName.localeCompare(right.agentName, "tr");
      });
  }, [snapshot]);
  const csatLeaders = useMemo(() => {
    const scoredAgents = rows.filter(
      (row): row is CsatRow & { callEvaluationAverage: number } => row.callEvaluationAverage !== null
    );

    if (scoredAgents.length === 0) {
      return [];
    }

    const topScore = Math.max(...scoredAgents.map((row) => row.callEvaluationAverage));

    return scoredAgents
      .filter((row) => row.callEvaluationAverage === topScore)
      .sort((left, right) => left.agentName.localeCompare(right.agentName, "tr"))
      .map((row) => ({
        name: row.agentName,
        imageAlt: row.agentName,
        imageSrc: getRepresentativePhotoSrc(row.agentName) ?? undefined
      }));
  }, [rows]);
  const csatLeaderNames = formatNameList(csatLeaders.map((leader) => leader.name));

  const csatSummary = useMemo(() => {
    // Özet toplamlar satıcı operasyon etiketlileri de içerir
    const fullAgents = aggregatedSnapshot?.datasets.agentMetrics ?? [];
    const totalCalls = aggregatedSnapshot?.period.manualTotalCallCount ?? sum(fullAgents.map((a) => a.totalCallCount));
    const totalDigital = aggregatedSnapshot?.period.manualTotalChatMailCount ?? sum(fullAgents.map((a) => a.totalChatMailCount));
    const totalTickets =
      aggregatedSnapshot?.period.manualTotalTicketClosedCount ?? sum(fullAgents.map((a) => a.totalTicketClosedCount));
    const mixTotal = totalCalls + totalDigital + totalTickets || 1;

    return {
      totalCalls,
      totalDigital,
      totalTickets,
      channelMix: [
        {
          label: "Çağrı",
          value: totalCalls,
          ratio: totalCalls / mixTotal,
          className: "bg-primary"
        },
        {
          label: "Chat / E-posta",
          value: totalDigital,
          ratio: totalDigital / mixTotal,
          className: "bg-accent"
        },
        {
          label: "Ticket",
          value: totalTickets,
          ratio: totalTickets / mixTotal,
          className: "bg-emerald-500"
        }
      ]
    };
  }, [rows]);

  const columns: ColumnDef<CsatRow, any>[] = [
    columnHelper.accessor("agentName", { header: "Temsilci" }),
    columnHelper.accessor("auditScoreDisplay", {
      header: "Audit skoru",
      cell: (info) => formatAuditScore(info.getValue())
    }),
    columnHelper.accessor("previousAuditAccuracyDisplay", {
      header: "Önceki audit doğruluk",
      cell: (info) => formatPercent(info.getValue())
    }),
    columnHelper.accessor("totalCallCount", { header: "Toplam çağrı" }),
    columnHelper.accessor("totalChatMailCount", { header: "Chat / e-posta" }),
    columnHelper.accessor("totalTicketClosedCount", { header: "Ticket" }),
    columnHelper.accessor("totalConversationCount", { header: "Toplam görüşme" }),
    columnHelper.accessor("avgTalkDurationSeconds", {
      header: "Ortalama konuşma süresi",
      cell: (info) => (
        <HeatChip
          tone={
            snapshot
              ? resolveThresholdTone(info.getValue(), snapshot.thresholds.avgTalkDurationSeconds)
              : "neutral"
          }
          value={formatSeconds(info.getValue())}
        />
      )
    }),
    columnHelper.accessor("localCloseRate", {
      header: "Lokal kapatma",
      cell: (info) => (
        <HeatChip
          tone={snapshot ? resolveThresholdTone(info.getValue(), snapshot.thresholds.localCloseRate) : "neutral"}
          value={formatPercent(info.getValue())}
        />
      )
    }),
    columnHelper.accessor("missedCalls", { header: "Kaçan çağrılar" }),
    columnHelper.accessor("callEvaluationAverage", {
      header: "CSAT ortalaması",
      cell: (info) => (
        <HeatChip
          tone={snapshot ? resolveThresholdTone(info.getValue(), snapshot.thresholds.callEvaluationAverage) : "neutral"}
          value={formatNumber(info.getValue(), 3)}
        />
      )
    }),
    columnHelper.accessor("evaluationCount", { header: "Değerlendirme" })
  ];

  const tableSummaryRows = useMemo(() => {
    // Özet satırları 'satıcı operasyon' etiketlileri de dahil tüm temsilcilerden hesaplanır
    const fullAgents = aggregatedSnapshot?.datasets.agentMetrics ?? [];
    const fullAudits = aggregatedSnapshot ? selectAuditMetrics(aggregatedSnapshot.datasets) : [];
    if (fullAgents.length === 0) return [] as Array<Record<string, ReactNode> & { _label?: string; _tone?: "emerald" }>;
    const auditByKey = new Map(fullAudits.map((r) => [r.agentKey, r]));
    const enriched = fullAgents.map((a) => ({
      ...a,
      auditScoreDisplay: auditByKey.get(a.agentKey)?.auditScore ?? a.auditScore,
      previousAuditAccuracyDisplay:
        auditByKey.get(a.agentKey)?.previousAuditAccuracy ?? a.previousAuditAccuracy
    }));
    const avgRow: Record<string, ReactNode> & { _label?: string; _tone?: "emerald" } = {
      _label: "ORTALAMA",
      _tone: "emerald",
      agentName: "ORTALAMA",
      auditScoreDisplay: formatAuditScore(average(enriched.map((r) => r.auditScoreDisplay))),
      previousAuditAccuracyDisplay: formatPercent(average(enriched.map((r) => r.previousAuditAccuracyDisplay))),
      totalCallCount: formatNumber(Math.round(sum(enriched.map((r) => r.totalCallCount)) / enriched.length)),
      totalChatMailCount: formatNumber(Math.round(sum(enriched.map((r) => r.totalChatMailCount)) / enriched.length)),
      totalTicketClosedCount: formatNumber(Math.round(sum(enriched.map((r) => r.totalTicketClosedCount)) / enriched.length)),
      totalConversationCount: formatNumber(Math.round(sum(enriched.map((r) => r.totalConversationCount)) / enriched.length)),
      avgTalkDurationSeconds: formatSeconds(average(enriched.map((r) => r.avgTalkDurationSeconds))),
      localCloseRate: formatPercent(average(enriched.map((r) => r.localCloseRate))),
      missedCalls: formatNumber(Math.round(sum(enriched.map((r) => r.missedCalls)) / enriched.length)),
      callEvaluationAverage: formatNumber(average(enriched.filter((r) => !premiumOnboardingKeys.has(r.agentKey)).map((r) => r.callEvaluationAverage)), 3),
      evaluationCount: formatNumber(Math.round(sum(enriched.map((r) => r.evaluationCount)) / enriched.length))
    };
    const totalRow: Record<string, ReactNode> & { _label?: string; _tone?: "emerald" } = {
      _label: "TOPLAM",
      _tone: "emerald",
      agentName: "TOPLAM",
      auditScoreDisplay: "",
      previousAuditAccuracyDisplay: "",
      totalCallCount: formatNumber(sum(enriched.map((r) => r.totalCallCount))),
      totalChatMailCount: formatNumber(sum(enriched.map((r) => r.totalChatMailCount))),
      totalTicketClosedCount: formatNumber(sum(enriched.map((r) => r.totalTicketClosedCount))),
      totalConversationCount: formatNumber(sum(enriched.map((r) => r.totalConversationCount))),
      avgTalkDurationSeconds: "",
      localCloseRate: "",
      missedCalls: formatNumber(sum(enriched.map((r) => r.missedCalls))),
      callEvaluationAverage: "",
      evaluationCount: formatNumber(sum(enriched.map((r) => r.evaluationCount)))
    };
    return [avgRow, totalRow];
  }, [aggregatedSnapshot, premiumOnboardingKeys]);

  return (
    <div className="space-y-6">
      <PageHeader title="CSAT" actions={<PeriodRangeFilter onChange={setPeriodRange} periods={csPeriods} value={{ ...periodRange, monthPeriodId: monthlyPeriodId }} />} />
      {snapshot ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <ChampionSpotlightCard
              kicker="Müşteri memnuniyeti"
              metricLabel={csatLeaders.length > 1 ? "Lider temsilciler" : "Lider temsilci"}
              name={csatLeaderNames || (snapshot.highlights.bestCsat?.label ?? "Takip ediliyor")}
              people={csatLeaders}
              score={formatNumber(snapshot.highlights.bestCsat?.value, 3)}
              showPodium={false}
              theme="violet"
              title="En yüksek CSAT skoru"
            />

            <div className="grid gap-6">
              <div className="grid gap-4 sm:grid-cols-1">
                <StatCard
                  badge={`${snapshot.summary.agentCount} temsilci`}
                  badgeTone="green"
                  icon={<Gauge size={18} />}
                  label="Takım CSAT ortalaması"
                  tone={resolveThresholdTone(snapshot.summary.csatAverage, snapshot.thresholds.callEvaluationAverage)}
                  value={formatNumber(snapshot.summary.csatAverage, 3)}
                />
              </div>

              <ExecutiveChartCard title="CSAT durum özeti">
                <div className="grid gap-3">
                  <MetricInsight
                    icon={<CheckCircle2 size={16} />}
                    title="En güçlü temsilci"
                    value={snapshot.highlights.bestCsat?.label ?? "Henüz yok"}
                    detail={formatNumber(snapshot.highlights.bestCsat?.value, 3)}
                  />
                  <MetricInsight
                    icon={<AlertTriangle size={16} />}
                    title="İzlenmesi gereken"
                    value={snapshot.highlights.lowestCsat?.label ?? "Henüz yok"}
                    detail={formatNumber(snapshot.highlights.lowestCsat?.value, 3)}
                  />
                </div>
              </ExecutiveChartCard>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            <StatCard
              icon={<PhoneCall size={18} />}
              label="Toplam çağrı"
              tone="neutral"
              value={formatNumber(csatSummary.totalCalls)}
            />
            <StatCard
              icon={<Users size={18} />}
              label="Chat / e-posta"
              tone="neutral"
              value={formatNumber(csatSummary.totalDigital)}
            />
            <StatCard
              icon={<ClipboardList size={18} />}
              label="Ticket adedi"
              tone="neutral"
              value={formatNumber(csatSummary.totalTickets)}
            />
          </div>

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

          <div className="grid gap-6 xl:grid-cols-2">
            <ExecutiveChartCard title="Kanal dağılımı">
              <div className="space-y-4">
                {csatSummary.channelMix.map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-600 dark:text-slate-400">{item.label}</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{formatNumber(item.value)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700">
                      <div
                        className={`h-full rounded-full ${item.className}`}
                        style={{ width: `${Math.max(item.ratio * 100, 8)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ExecutiveChartCard>

            <Leaderboard
              items={snapshot.rankings.csatTop.slice(0, 5).map((item) => ({
                id: item.id,
                label: item.label,
                value: formatNumber(item.value, 3)
              }))}
              title="En güçlü CSAT"
            />
          </div>

          <ExecutiveChartCard title="CSAT ayrıntı tablosu">
            <DataTable columns={columns} data={rows} variant="emerald" striped summaryRows={tableSummaryRows} />
          </ExecutiveChartCard>
        </>
      ) : (
        <div className="glass-card rounded-[10px] border border-white/40 bg-white/85 p-12 text-center shadow-glass dark:border-slate-600/40 dark:bg-slate-800/80">
          <p className="text-slate-600 dark:text-slate-400">CSAT verisi yükleniyor...</p>
        </div>
      )}
    </div>
  );
}

function MetricInsight(props: { icon: React.ReactNode; title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[10px] border border-white/50 bg-white/82 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/80 dark:shadow-none">
      <div className="flex items-center gap-3">
        <div className="rounded-[10px] border border-white/50 bg-white/72 p-2 text-slate-800 dark:border-slate-600/40 dark:bg-slate-700/50 dark:text-slate-200">{props.icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-400">{props.title}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{props.value}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{props.detail}</p>
    </div>
  );
}
