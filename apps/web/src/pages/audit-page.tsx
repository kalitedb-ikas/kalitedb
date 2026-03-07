import { HeatChip, SectionCard } from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { resolveThresholdTone, type AgentMetric } from "@kalitedb/shared";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "../components/data-table";
import { MetricBarChart } from "../components/metric-chart";
import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPercent } from "../lib/format";

const columnHelper = createColumnHelper<AgentMetric>();

export function AuditPage() {
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
  const auditThreshold = snapshot?.thresholds.auditScore;
  const columns: ColumnDef<AgentMetric, any>[] = [
    columnHelper.accessor("agentName", {
      header: "Temsilci"
    }),
    columnHelper.accessor("auditScore", {
      header: "Audit Skoru",
      cell: (info) => (
        <HeatChip
          tone={auditThreshold ? resolveThresholdTone(info.getValue(), auditThreshold) : "neutral"}
          value={formatPercent(info.getValue())}
        />
      )
    }),
    columnHelper.accessor("missingQuestionsAccuracy", {
      header: "Kayıp Soruları Bilme Oranı",
      cell: (info) => formatPercent(info.getValue())
    }),
    columnHelper.accessor("previousAuditAccuracy", {
      header: "Önceki Audit Doğruluk Oranı",
      cell: (info) => formatPercent(info.getValue())
    })
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

      {snapshot ? (
        <>
          <MetricBarChart
            data={snapshot.datasets.agentMetrics.map((item) => ({
              label: item.agentName,
              value: item.auditScore ?? 0
            }))}
          />
          <SectionCard title="Temsilci bazlı audit sonucu">
            <DataTable columns={columns} data={snapshot.datasets.agentMetrics} />
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
