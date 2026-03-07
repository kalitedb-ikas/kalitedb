import { HeatChip, SectionCard } from "@kalitedb/ui";
import { resolveThresholdTone, type AgentMetric } from "@kalitedb/shared";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "../components/data-table";
import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber, formatPercent, formatSeconds } from "../lib/format";

const columnHelper = createColumnHelper<AgentMetric>();

export function CsatPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token)
  });
  const periodId = searchParams.get("periodId") ?? periodsQuery.data?.[0]?.id;
  const compareToPeriodId = searchParams.get("compareToPeriodId") ?? undefined;
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId)
  });

  const snapshot = dashboardQuery.data;
  const columns: ColumnDef<AgentMetric, any>[] = [
    columnHelper.accessor("agentName", { header: "M.T" }),
    columnHelper.accessor("auditScore", {
      header: "Audit Skoru",
      cell: (info) => formatPercent(info.getValue())
    }),
    columnHelper.accessor("previousAuditAccuracy", {
      header: "Önceki Audit Doğruluk Oranı",
      cell: (info) => formatPercent(info.getValue())
    }),
    columnHelper.accessor("totalCallCount", { header: "Toplam Çağrı Adedi" }),
    columnHelper.accessor("totalChatMailCount", { header: "Toplam Chat / Mail Adedi" }),
    columnHelper.accessor("totalTicketClosedCount", { header: "Toplam Ticket Kapatma Adedi" }),
    columnHelper.accessor("totalConversationCount", { header: "Toplam Görüşme Adedi" }),
    columnHelper.accessor("avgTalkDurationSeconds", {
      header: "Ortalama Konuşma Süresi",
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
      header: "Lokal Kapatma Oranı",
      cell: (info) => (
        <HeatChip
          tone={snapshot ? resolveThresholdTone(info.getValue(), snapshot.thresholds.localCloseRate) : "neutral"}
          value={formatPercent(info.getValue())}
        />
      )
    }),
    columnHelper.accessor("missedCalls", { header: "Kaçan Çağrılar" }),
    columnHelper.accessor("callEvaluationAverage", {
      header: "Çağrı Değerlendirme Ortalaması",
      cell: (info) => (
        <HeatChip
          tone={
            snapshot ? resolveThresholdTone(info.getValue(), snapshot.thresholds.callEvaluationAverage) : "neutral"
          }
          value={formatNumber(info.getValue(), 3)}
        />
      )
    }),
    columnHelper.accessor("evaluationCount", { header: "Değerlendirme Adeti" })
  ];

  return (
    <div className="space-y-6">
      <PeriodFilters
        compareToPeriodId={compareToPeriodId}
        onCompareChange={(value) => {
          const next = new URLSearchParams(searchParams);
          if (value) next.set("compareToPeriodId", value);
          else next.delete("compareToPeriodId");
          setSearchParams(next);
        }}
        onPeriodChange={(value) => {
          const next = new URLSearchParams(searchParams);
          next.set("periodId", value);
          setSearchParams(next);
        }}
        periodId={periodId}
        periods={periodsQuery.data ?? []}
      />
      <SectionCard title="CSAT raporu" description="Çağrı, chat/mail ve ticket metrikleri aynı tabloda toplanır.">
        <DataTable columns={columns} data={snapshot?.datasets.agentMetrics ?? []} />
      </SectionCard>
    </div>
  );
}
