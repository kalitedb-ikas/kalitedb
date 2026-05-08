import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { selectDefaultReportPeriod, type QuestionPerformance } from "@kalitedb/shared";
import { ExecutiveChartCard, HeatChip, PageHeader, QuestionSpotlight, StatCard, SurfaceCard } from "@kalitedb/ui";

import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import { DataTable } from "../components/data-table";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPercent, formatNumber } from "../lib/format";
import { computeActivePeriodIds, derivePeriodRangeSelectors } from "../lib/period-aggregation";

const columnHelper = createColumnHelper<QuestionPerformance>();

function resolveQuestionAccuracyTone(value: number) {
  if (value >= 80) {
    return "green" as const;
  }

  if (value >= 60) {
    return "yellow" as const;
  }

  return "red" as const;
}

export function QuestionsPage() {
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
  const [topic, setTopic] = useState("");
  const periodId = activePeriodIds.length > 0 ? activePeriodIds[activePeriodIds.length - 1] : undefined;
  const compareToPeriodId = undefined;

  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const snapshot = dashboardQuery.data;
  const allQuestions = useMemo(() => snapshot?.datasets.questionPerformance ?? [], [snapshot]);
  const weakestQuestions = useMemo(() => snapshot?.rankings.weakestQuestions ?? [], [snapshot]);
  const strongestQuestions = useMemo(() => snapshot?.rankings.strongestQuestions ?? [], [snapshot]);

  const rows = useMemo(() => {
    if (!topic) return allQuestions;
    return allQuestions.filter((item) => item.topic === topic);
  }, [allQuestions, topic]);

  const topics = useMemo(() => Array.from(new Set(allQuestions.map((item) => item.topic))), [allQuestions]);
  const averageAccuracy =
    allQuestions.length > 0
      ? allQuestions.reduce((sum, question) => sum + question.accuracyRate, 0) / allQuestions.length
      : null;

  const columns: ColumnDef<QuestionPerformance, any>[] = [
    columnHelper.accessor("questionText", { header: "Soru" }),
    columnHelper.accessor("accuracyRate", {
      header: "Doğru bilinme oranı",
      cell: (info) => (
        <HeatChip tone={resolveQuestionAccuracyTone(info.getValue())} value={formatPercent(info.getValue())} />
      )
    }),
    columnHelper.accessor("correctCount", { header: "Doğru" }),
    columnHelper.accessor("wrongCount", { header: "Yanlış" })
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Sorular" actions={<PeriodRangeFilter onChange={setPeriodRange} periods={csPeriods} value={{ ...periodRange, monthPeriodId: monthlyPeriodId }} />} />

      <div className="grid gap-4 lg:grid-cols-2">
        <StatCard
          icon={<BookOpen size={18} />}
          label="Toplam soru"
          tone="neutral"
          value={formatNumber(allQuestions.length)}
        />
        <StatCard
          icon={<Target size={18} />}
          label="Ortalama doğruluk"
          tone={averageAccuracy != null && averageAccuracy >= 80 ? "green" : averageAccuracy != null && averageAccuracy >= 60 ? "yellow" : "red"}
          value={formatPercent(averageAccuracy)}
        />
      </div>

      <div className="grid gap-6">
        <ExecutiveChartCard title="Soru performans görünümü">
          <div className="grid gap-4 md:grid-cols-2">
            <QuestionSpotlight
              accent="from-rose-100 to-transparent"
              label="En az bilinen soru"
              score={formatPercent(weakestQuestions[0]?.accuracyRate)}
              title={weakestQuestions[0]?.questionText ?? "Veri bekleniyor"}
              topic={weakestQuestions[0]?.topic ?? "Başlık yok"}
              tone="text-rose-600"
            />
            <QuestionSpotlight
              accent="from-emerald-100 to-transparent"
              label="En güçlü soru"
              score={formatPercent(strongestQuestions[0]?.accuracyRate)}
              title={strongestQuestions[0]?.questionText ?? "Veri bekleniyor"}
              topic={strongestQuestions[0]?.topic ?? "Başlık yok"}
              tone="text-emerald-600"
            />
          </div>
        </ExecutiveChartCard>
      </div>

      <div className="grid gap-6">
        <SurfaceCard
          actions={
            <select
              className="h-10 rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm font-medium text-slate-700 dark:text-slate-400 focus:border-primary/40 focus:outline-none"
              onChange={(event) => setTopic(event.target.value)}
              value={topic}
            >
              <option value="">Tüm kategoriler</option>
              {topics.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          }
          title="Detay tablo görünümü"
          variant="default"
        >
          <DataTable
            columns={columns}
            data={rows}
            density="comfortable"
            emptyState="Seçilen dönemde gösterilecek soru verisi bulunamadı."
          />
        </SurfaceCard>
      </div>
    </div>
  );
}
