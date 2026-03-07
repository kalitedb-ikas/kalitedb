import { HeatChip, Leaderboard, SectionCard } from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { type QuestionPerformance } from "@kalitedb/shared";

import { DataTable } from "../components/data-table";
import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPercent } from "../lib/format";

const columnHelper = createColumnHelper<QuestionPerformance>();

export function QuestionsPage() {
  const auth = useAuth();
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token)
  });
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>();
  const [compareToPeriodId, setCompareToPeriodId] = useState<string | undefined>();
  const [topic, setTopic] = useState("");
  const periodId = selectedPeriodId ?? periodsQuery.data?.[0]?.id;
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId)
  });

  const rows = useMemo(() => {
    const dataset = dashboardQuery.data?.datasets.questionPerformance ?? [];
    if (!topic) {
      return dataset;
    }

    return dataset.filter((item) => item.topic === topic);
  }, [dashboardQuery.data?.datasets.questionPerformance, topic]);

  const topics = Array.from(new Set((dashboardQuery.data?.datasets.questionPerformance ?? []).map((item) => item.topic)));
  const columns: ColumnDef<QuestionPerformance, any>[] = [
    columnHelper.accessor("questionText", {
      header: "Sorular (CS-KEY)"
    }),
    columnHelper.accessor("accuracyRate", {
      header: "Doğru Bilinme Oranı",
      cell: (info) => (
        <HeatChip
          tone={info.getValue() >= 90 ? "green" : info.getValue() >= 70 ? "yellow" : "red"}
          value={formatPercent(info.getValue())}
        />
      )
    }),
    columnHelper.accessor("correctCount", {
      header: "Doğru"
    }),
    columnHelper.accessor("wrongCount", {
      header: "Yanlış"
    }),
    columnHelper.accessor("topic", {
      header: "Konu Başlıkları"
    })
  ];

  return (
    <div className="space-y-6">
      <PeriodFilters
        compareToPeriodId={compareToPeriodId}
        onCompareChange={(value) => setCompareToPeriodId(value || undefined)}
        onPeriodChange={(value) => setSelectedPeriodId(value)}
        periodId={periodId}
        periods={periodsQuery.data ?? []}
      />

      <SectionCard
        title="Konu filtresi"
        actions={
          <select className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setTopic(event.target.value)} value={topic}>
            <option value="">Tüm konu başlıkları</option>
            {topics.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        }
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <Leaderboard
            items={(dashboardQuery.data?.rankings.weakestQuestions ?? []).map((item) => ({
              id: item.id,
              label: item.questionText,
              value: formatPercent(item.accuracyRate)
            }))}
            title="En zayıf sorular"
          />
          <Leaderboard
            items={(dashboardQuery.data?.rankings.strongestQuestions ?? []).map((item) => ({
              id: item.id,
              label: item.questionText,
              value: formatPercent(item.accuracyRate)
            }))}
            title="En güçlü sorular"
          />
        </div>
      </SectionCard>

      <SectionCard title="Soru performansı tablosu">
        <DataTable columns={columns} data={rows} />
      </SectionCard>
    </div>
  );
}
