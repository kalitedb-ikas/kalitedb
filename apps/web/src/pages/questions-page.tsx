import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, Sparkles, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { selectDefaultReportPeriod, type QuestionPerformance } from "@kalitedb/shared";
import { ExecutiveChartCard, Leaderboard, PageHeader, QuestionSpotlight, StatCard, SurfaceCard } from "@kalitedb/ui";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "../components/data-table";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPercent, formatNumber } from "../lib/format";

const columnHelper = createColumnHelper<QuestionPerformance>();

export function QuestionsPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });
  const [topic, setTopic] = useState("");
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
  const allQuestions = useMemo(() => snapshot?.datasets.questionPerformance ?? [], [snapshot]);
  const weakestQuestions = useMemo(() => snapshot?.rankings.weakestQuestions ?? [], [snapshot]);
  const strongestQuestions = useMemo(() => snapshot?.rankings.strongestQuestions ?? [], [snapshot]);

  const rows = useMemo(() => {
    if (!topic) return allQuestions;
    return allQuestions.filter((item) => item.topic === topic);
  }, [allQuestions, topic]);

  const topics = useMemo(() => Array.from(new Set(allQuestions.map((item) => item.topic))), [allQuestions]);
  const topicAccuracy = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const question of allQuestions) {
      const current = map.get(question.topic) ?? [];
      current.push(question.accuracyRate);
      map.set(question.topic, current);
    }

    return Array.from(map.entries())
      .map(([label, values]) => ({
        id: label,
        label,
        accuracy: values.reduce((sum, value) => sum + value, 0) / values.length
      }))
      .sort((left, right) => left.accuracy - right.accuracy);
  }, [allQuestions]);

  const averageAccuracy =
    allQuestions.length > 0
      ? allQuestions.reduce((sum, question) => sum + question.accuracyRate, 0) / allQuestions.length
      : null;

  const columns: ColumnDef<QuestionPerformance, any>[] = [
    columnHelper.accessor("questionText", { header: "Soru" }),
    columnHelper.accessor("topic", { header: "Konu" }),
    columnHelper.accessor("accuracyRate", {
      header: "Doğru bilinme oranı",
      cell: (info) => formatPercent(info.getValue())
    }),
    columnHelper.accessor("correctCount", { header: "Doğru" }),
    columnHelper.accessor("wrongCount", { header: "Yanlış" })
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Sorular" />

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          emphasis="primary"
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
        <StatCard
          icon={<Sparkles size={18} />}
          label="Konu başlığı"
          tone="neutral"
          value={formatNumber(topics.length)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <ExecutiveChartCard title="Soru performans görünümü">
          <div className="grid gap-4 md:grid-cols-2">
            <QuestionSpotlight
              accent="from-rose-100 to-transparent"
              label="En kırılgan soru"
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

        <SurfaceCard title="Kısa eğitim özeti" variant="default">
          <div className="space-y-3">
            <SummaryLine
              title="Öncelikli konu"
              value={weakestQuestions[0]?.topic ?? "Henüz yok"}
            />
            <SummaryLine
              title="Güçlü alan"
              value={strongestQuestions[0]?.topic ?? "Henüz yok"}
            />
            <SummaryLine
              title="Ortalama doğruluk"
              value={formatPercent(averageAccuracy)}
            />
          </div>
        </SurfaceCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="grid gap-6">
          <Leaderboard
            items={topicAccuracy.slice(0, 5).map((item) => ({
              id: item.id,
              label: item.label,
              value: formatPercent(item.accuracy)
            }))}
            title="En düşük doğruluklu konular"
          />

          <SurfaceCard
            actions={
              <select
                className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus:border-primary/40 focus:outline-none"
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
            title="Riskli soru kümesi"
            variant="default"
          >
            <div className="space-y-3">
              {weakestQuestions.slice(0, 4).map((question) => (
                <div
                  key={question.id}
                  className="rounded-[22px] border border-slate-200 bg-white/92 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{question.topic}</p>
                      <p className="mt-2 text-sm font-semibold leading-7 text-slate-900">{question.questionText}</p>
                    </div>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                      {formatPercent(question.accuracyRate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard title="Detay tablo görünümü" variant="default">
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

function SummaryLine(props: { title: string; value: string; detail?: string | undefined }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/92 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{props.title}</p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{props.value}</p>
      {props.detail ? <p className="mt-1 text-sm text-slate-500">{props.detail}</p> : null}
    </div>
  );
}
