import { HeatChip } from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { type QuestionPerformance } from "@kalitedb/shared";
import {
  TrendingUp,
  Calendar,
  Download,
  Filter,
  Code,
  Shield,
  Database,
  Gauge,
  ArrowRight,
  Lightbulb
} from "lucide-react";

import { DataTable } from "../components/data-table";
import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPercent, formatNumber } from "../lib/format";

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
  const [activeTab, setActiveTab] = useState<"overview" | "missed" | "table">("overview");
  const periodId = selectedPeriodId ?? periodsQuery.data?.[0]?.id;

  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId)
  });

  const questionDataset = dashboardQuery.data?.datasets.questionPerformance;
  const allQuestions = useMemo(() => questionDataset ?? [], [questionDataset]);

  const rows = useMemo(() => {
    if (!topic) return allQuestions;
    return allQuestions.filter((item) => item.topic === topic);
  }, [allQuestions, topic]);

  const topics = useMemo(
    () => Array.from(new Set(allQuestions.map((item) => item.topic))),
    [allQuestions]
  );

  // Compute summary stats
  const avgAccuracy = allQuestions.length > 0
    ? allQuestions.reduce((s, q) => s + q.accuracyRate, 0) / allQuestions.length
    : 0;
  const lowestAccuracy = allQuestions.length > 0
    ? Math.min(...allQuestions.map((q) => q.accuracyRate))
    : 0;
  const lowestTopic = allQuestions.find((q) => q.accuracyRate === lowestAccuracy)?.topic ?? "-";

  // Topic-based accuracy
  const topicAccuracy = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const q of allQuestions) {
      const arr = map.get(q.topic) ?? [];
      arr.push(q.accuracyRate);
      map.set(q.topic, arr);
    }
    return Array.from(map.entries())
      .map(([t, rates]) => ({ topic: t, accuracy: rates.reduce((s, v) => s + v, 0) / rates.length }))
      .sort((a, b) => b.accuracy - a.accuracy);
  }, [allQuestions]);

  // Heatmap data from questions
  const heatmapData = useMemo(() => {
    return allQuestions.slice(0, 28).map((q) => q.accuracyRate);
  }, [allQuestions]);

  const weakestQuestions = dashboardQuery.data?.rankings.weakestQuestions ?? [];
  const strongestQuestions = dashboardQuery.data?.rankings.strongestQuestions ?? [];

  const columns: ColumnDef<QuestionPerformance, any>[] = [
    columnHelper.accessor("questionText", { header: "Sorular (CS-KEY)" }),
    columnHelper.accessor("accuracyRate", {
      header: "Doğru Bilinme Oranı",
      cell: (info) => (
        <HeatChip
          tone={info.getValue() >= 90 ? "green" : info.getValue() >= 70 ? "yellow" : "red"}
          value={formatPercent(info.getValue())}
        />
      )
    }),
    columnHelper.accessor("correctCount", { header: "Doğru" }),
    columnHelper.accessor("wrongCount", { header: "Yanlış" }),
    columnHelper.accessor("topic", { header: "Konu Başlıkları" })
  ];

  return (
    <div className="max-w-7xl mx-auto w-full p-6 md:p-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Sorular & Metrikler</h2>
          <p className="text-slate-500 mt-1">Doğruluk trendleri ve performans darboğazları.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 shadow-sm">
            <Calendar size={16} />
            {dashboardQuery.data?.period.title ?? "Dönem"}
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-md shadow-primary/20">
            <Download size={16} />
            PDF İndir
          </button>
        </div>
      </div>

      {/* Period Filters */}
      <div className="mb-6">
        <PeriodFilters
          compareToPeriodId={compareToPeriodId}
          onCompareChange={(v) => setCompareToPeriodId(v || undefined)}
          onPeriodChange={(v) => setSelectedPeriodId(v)}
          periodId={periodId}
          periods={periodsQuery.data ?? []}
        />
      </div>

      {/* Tabs and Filters */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-8 shadow-sm">
        <div className="flex border-b border-slate-200 px-6 overflow-x-auto">
          {[
            { key: "overview" as const, label: "Doğruluk Genel Bakış" },
            { key: "missed" as const, label: "En Çok Kaçırılan Sorular" },
            { key: "table" as const, label: "Tablo Görünümü" }
          ].map((tab) => (
            <button
              key={tab.key}
              className={`px-4 py-4 border-b-2 font-bold text-sm whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-4 flex flex-wrap gap-3 bg-slate-50/50">
          <select
            className="appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-1.5 text-sm font-medium focus:ring-primary focus:border-primary"
            onChange={(e) => setTopic(e.target.value)}
            value={topic}
          >
            <option value="">Tüm Kategoriler</option>
            {topics.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium">
            <Filter size={14} />
            Filtre Ekle
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          label="Ort. Doğruluk"
          value={formatPercent(avgAccuracy)}
          badge={<span className="flex items-center text-green-500 text-sm font-bold"><TrendingUp size={14} className="mr-0.5" /> 3.2%</span>}
        />
        <MetricCard
          label="Toplam Soru"
          value={formatNumber(allQuestions.length)}
          badge={<span className="text-slate-400 text-sm font-medium">Adet</span>}
        />
        <MetricCard
          label="En Düşük Doğruluk"
          value={formatPercent(lowestAccuracy)}
          badge={<span className="text-slate-400 text-sm font-medium">{lowestTopic}</span>}
          borderLeft="border-l-4 border-l-red-500"
        />
        <MetricCard
          label="Soru Sayısı (Konu)"
          value={formatNumber(topics.length)}
          badge={<span className="text-slate-400 text-sm font-medium">Konu başlığı</span>}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Heatmap + Missed Questions */}
        <div className="lg:col-span-2 space-y-8">
          {/* Accuracy Heatmap */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-lg font-bold text-slate-900">Doğruluk Isı Haritası</h4>
              <div className="flex gap-2 text-xs font-bold text-slate-500 uppercase items-center">
                <span>Düşük</span>
                <div className="flex gap-1">
                  <div className="w-3 h-3 bg-primary/10 rounded-sm" />
                  <div className="w-3 h-3 bg-primary/30 rounded-sm" />
                  <div className="w-3 h-3 bg-primary/60 rounded-sm" />
                  <div className="w-3 h-3 bg-primary rounded-sm" />
                </div>
                <span>Yüksek</span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {heatmapData.map((val, i) => {
                const opacity = Math.max(0.1, val / 100);
                return (
                  <div
                    key={i}
                    className="aspect-square rounded border border-white/50"
                    style={{ backgroundColor: `rgba(19, 127, 236, ${opacity})` }}
                    title={`${formatPercent(val)}`}
                  />
                );
              })}
              {/* Day labels */}
              {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => (
                <div key={d} className="text-[10px] font-bold text-slate-400 mt-1 uppercase text-center">
                  {d}
                </div>
              ))}
            </div>
          </div>

          {/* Most Missed Questions */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="text-lg font-bold text-slate-900 mb-6">En Çok Kaçırılan Sorular</h4>
            <div className="space-y-6">
              {weakestQuestions.slice(0, 4).map((q) => (
                <div key={q.id}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-slate-700">"{q.questionText}"</span>
                    <span className={`text-sm font-bold ${q.accuracyRate < 50 ? "text-red-500" : q.accuracyRate < 65 ? "text-orange-500" : "text-orange-400"}`}>
                      {formatPercent(q.accuracyRate)} Başarı
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${q.accuracyRate < 50 ? "bg-red-500" : q.accuracyRate < 65 ? "bg-orange-500" : "bg-orange-400"}`}
                      style={{ width: `${q.accuracyRate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button className="mt-8 text-primary text-sm font-bold flex items-center gap-1 hover:underline">
              Tüm Kaçırılan Soruları Gör
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Right: Topic Breakdown + Insight + Feedback */}
        <div className="space-y-6">
          {/* Topic Accuracy Breakdown */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="text-base font-bold text-slate-900 mb-4">Konu Bazlı Doğruluk</h4>
            <div className="space-y-5">
              {topicAccuracy.slice(0, 4).map((t, i) => {
                const icons = [
                  <Code size={18} key="code" />,
                  <Shield size={18} key="shield" />,
                  <Database size={18} key="db" />,
                  <Gauge size={18} key="gauge" />
                ];
                const colors = [
                  "bg-primary/10 text-primary",
                  "bg-green-500/10 text-green-600",
                  "bg-orange-500/10 text-orange-600",
                  "bg-red-500/10 text-red-600"
                ];
                const barColors = ["bg-primary", "bg-green-500", "bg-orange-500", "bg-red-500"];
                return (
                  <div key={t.topic} className="flex items-center gap-4">
                    <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${colors[i] ?? colors[0]}`}>
                      {icons[i] ?? icons[0]}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <p className="text-sm font-bold">{t.topic}</p>
                        <p className="text-sm font-bold">{formatPercent(t.accuracy)}</p>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barColors[i] ?? barColors[0]}`}
                          style={{ width: `${Math.min(t.accuracy, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Performance Insight */}
          {weakestQuestions.length > 0 ? (
            <div className="bg-primary p-6 rounded-xl text-white shadow-lg shadow-primary/20">
              <h4 className="text-lg font-bold mb-2 flex items-center gap-2">
                <Lightbulb size={18} />
                Performans Önerisi
              </h4>
              <p className="text-primary-100 text-sm leading-relaxed mb-4 opacity-90">
                <strong>{weakestQuestions[0]?.topic ?? "Genel"}</strong> konusundaki sorular ortalamadan düşük doğruluk gösteriyor.
                Bu alanda odaklanılmış bir eğitim önerilmektedir.
              </p>
              <button className="w-full py-2 bg-white text-primary rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors">
                Eğitim Planla
              </button>
            </div>
          ) : null}

          {/* Strongest Questions */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="text-base font-bold text-slate-900 mb-4">En Güçlü Sorular</h4>
            <div className="space-y-4">
              {strongestQuestions.slice(0, 3).map((q) => (
                <div key={q.id} className="flex gap-3">
                  <div className="bg-slate-100 rounded p-3 text-xs text-slate-600 italic leading-snug flex-1">
                    "{q.questionText}" — <strong>{formatPercent(q.accuracyRate)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full Table (visible on table tab) */}
      {activeTab === "table" ? (
        <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Soru Performansı Tablosu</h3>
          </div>
          <DataTable columns={columns} data={rows} />
        </div>
      ) : null}
    </div>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  badge: React.ReactNode;
  borderLeft?: string;
}) {
  return (
    <div className={`bg-white p-6 rounded-xl border border-slate-200 shadow-sm ${props.borderLeft ?? ""}`}>
      <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">{props.label}</p>
      <div className="flex items-end justify-between">
        <h3 className="text-3xl font-black text-slate-900">{props.value}</h3>
        {props.badge}
      </div>
    </div>
  );
}
