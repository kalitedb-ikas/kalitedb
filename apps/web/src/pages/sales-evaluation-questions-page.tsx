import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { selectDefaultReportPeriod, type SalesEvaluationQuestion } from "@kalitedb/shared";
import { HeatChip, PageHeader, StatCard, SurfaceCard } from "@kalitedb/ui";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "../components/data-table";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import { derivePeriodRangeSelectors } from "../lib/period-aggregation";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";

const columnHelper = createColumnHelper<SalesEvaluationQuestion>();

function resolveScoreTone(value: number) {
  if (value >= 80) return "green" as const;
  if (value >= 50) return "yellow" as const;
  return "red" as const;
}

export function SalesEvaluationQuestionsPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const now = new Date();

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const salesPeriods = useMemo(
    () =>
      [...(periodsQuery.data ?? [])]
        .filter((p) => (p.department ?? "cs") === "sales")
        .sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return {
      year,
      viewMode: "aylik",
      monthPeriodId: searchParams.get("periodId") ?? undefined,
      quarter
    };
  });

  const { yearPeriods } = useMemo(
    () => derivePeriodRangeSelectors(salesPeriods, periodRange.year),
    [salesPeriods, periodRange.year]
  );

  const defaultPeriod = useMemo(() => {
    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(
      now.getMonth() === 0 ? 12 : now.getMonth()
    ).padStart(2, "0")}`;
    return yearPeriods.find((p) => p.month === prevMonth) ?? selectDefaultReportPeriod(yearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearPeriods]);
  const periodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId)
    ? periodRange.monthPeriodId
    : defaultPeriod?.id;
  const activePeriod = salesPeriods.find((p) => p.id === periodId);

  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) {
      setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
    }
  }, [defaultPeriod?.id, periodRange.monthPeriodId]);

  useEffect(() => {
    const current = searchParams.get("periodId");
    if (periodId && current !== periodId) {
      const params = new URLSearchParams(searchParams);
      params.set("periodId", periodId);
      setSearchParams(params, { replace: true });
    }
  }, [periodId, searchParams, setSearchParams]);

  const questionsQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["evaluation-questions", auth.token, periodId],
    queryFn: () => api.getEvaluationQuestions(auth.token, periodId!),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const questions = useMemo(() => questionsQuery.data ?? [], [questionsQuery.data]);

  const columns: ColumnDef<SalesEvaluationQuestion, any>[] = [
    columnHelper.display({
      id: "index",
      header: "#",
      cell: (info) => (
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
          {info.row.index + 1}
        </span>
      ),
      size: 48
    }),
    columnHelper.accessor("questionText", {
      header: "Soru",
      cell: (info) => (
        <span className="font-medium text-slate-900 dark:text-slate-100">{info.getValue()}</span>
      )
    }),
    columnHelper.accessor("answer", {
      header: "Cevap",
      cell: (info) => {
        const value = info.getValue();
        return value
          ? <span className="text-slate-700 dark:text-slate-300">{value}</span>
          : <span className="italic text-slate-400 dark:text-slate-500">-</span>;
      }
    }),
    columnHelper.accessor("score", {
      header: "Puan",
      cell: (info) => (
        <HeatChip tone={resolveScoreTone(info.getValue())} value={String(info.getValue())} />
      )
    })
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        subtitle={activePeriod ? `${activePeriod.title} dönemi` : undefined}
        title="Değerlendirme Soruları"
        actions={
          <PeriodRangeFilter
            onChange={setPeriodRange}
            periods={salesPeriods}
            value={{ ...periodRange, monthPeriodId: periodId }}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <StatCard
          icon={<BookOpen size={18} />}
          label="Toplam soru"
          tone="neutral"
          value={formatNumber(questions.length)}
        />
      </div>

      <SurfaceCard title="Detay tablo görünümü" variant="default">
        <DataTable
          columns={columns}
          data={questions}
          density="comfortable"
          emptyState="Seçilen dönemde değerlendirme sorusu bulunamadı."
        />
      </SurfaceCard>
    </div>
  );
}
