import { resolveThresholdTone, selectAuditMetrics, sum, type AgentMetric } from "@kalitedb/shared";
import {
  ChampionSpotlightCard,
  ExecutiveChartCard,
  HeatChip,
  Leaderboard,
  StatCard
} from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardList, Gauge, PhoneCall, Users } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { TrendLineCard, buildYearTrendPoints } from "../components/year-trend-card";
import { DataTable } from "../components/data-table";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatAuditScore, formatNumber, formatPercent, formatSeconds } from "../lib/format";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";
import { brand } from "../theme/colors";

type CsatRow = AgentMetric & {
  auditScoreDisplay: number | null;
  previousAuditAccuracyDisplay: number | null;
};

const columnHelper = createColumnHelper<CsatRow>();
const TREND_DATASET_TYPES = ["agent-metrics", "audit-metrics"] as const;

export function CsatPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const datasetTypes = ["agent-metrics", "audit-metrics"] as const;
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });
  const periodId = searchParams.get("periodId") ?? periodsQuery.data?.[0]?.id;
  const compareToPeriodId = searchParams.get("compareToPeriodId") ?? undefined;
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
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId, datasetTypes.join(",")],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId, { datasetTypes: [...datasetTypes] }),
    staleTime: 60 * 1000
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

  const snapshot = dashboardQuery.data;
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

    return snapshot.datasets.agentMetrics.map((item) => {
      const audit = auditMap.get(item.agentKey);
      return {
        ...item,
        auditScoreDisplay: audit?.auditScore ?? item.auditScore,
        previousAuditAccuracyDisplay: audit?.previousAuditAccuracy ?? item.previousAuditAccuracy
      };
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
  const csatLeaderNames = csatLeaders.map((leader) => leader.name).join(", ");

  const csatSummary = useMemo(() => {
    const totalEvaluations = sum(rows.map((row) => row.evaluationCount));
    const totalCalls = snapshot?.period.manualTotalCallCount ?? sum(rows.map((row) => row.totalCallCount));
    const totalDigital = snapshot?.period.manualTotalChatMailCount ?? sum(rows.map((row) => row.totalChatMailCount));
    const totalTickets =
      snapshot?.period.manualTotalTicketClosedCount ?? sum(rows.map((row) => row.totalTicketClosedCount));
    const mixTotal = totalCalls + totalDigital + totalTickets || 1;

    return {
      totalEvaluations,
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

  return (
    <div className="space-y-6">
      {snapshot ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <ChampionSpotlightCard
              delta={
                snapshot.highlights.bestCsat?.delta != null
                  ? `Değişim ${snapshot.highlights.bestCsat.delta > 0 ? "+" : ""}${formatNumber(snapshot.highlights.bestCsat.delta, 2)}`
                  : undefined
              }
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
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  badge={`${snapshot.summary.agentCount} temsilci`}
                  badgeTone="green"
                  icon={<Gauge size={18} />}
                  label="Takım CSAT ortalaması"
                  tone={resolveThresholdTone(snapshot.summary.csatAverage, snapshot.thresholds.callEvaluationAverage)}
                  value={formatNumber(snapshot.summary.csatAverage, 3)}
                />
                <StatCard
                  icon={<Users size={18} />}
                  label="Toplam değerlendirme"
                  tone="neutral"
                  value={formatNumber(csatSummary.totalEvaluations)}
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
                      <span className="font-medium text-slate-600">{item.label}</span>
                      <span className="font-semibold text-slate-900">{formatNumber(item.value)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/70">
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
                value: formatNumber(item.value, 3),
                ...(item.delta != null ? { delta: `Değişim ${formatNumber(item.delta, 2)}` } : {})
              }))}
              title="En güçlü CSAT"
            />
          </div>

          <ExecutiveChartCard title="CSAT ayrıntı tablosu">
            <DataTable columns={columns} data={rows} />
          </ExecutiveChartCard>
        </>
      ) : (
        <div className="glass-card rounded-[30px] border border-white/40 bg-white/85 p-12 text-center shadow-glass">
          <p className="text-slate-600">CSAT verisi yükleniyor...</p>
        </div>
      )}
    </div>
  );
}

function MetricInsight(props: { icon: React.ReactNode; title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-white/50 bg-white/82 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-white/50 bg-white/72 p-2 text-slate-800">{props.icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">{props.title}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{props.value}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">{props.detail}</p>
    </div>
  );
}
