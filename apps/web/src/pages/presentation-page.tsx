import { PresentationSlide, StatCard } from "@kalitedb/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber, formatPercent } from "../lib/format";

export function PresentationPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSlide, setActiveSlide] = useState(0);
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setActiveSlide((current) => current + 1);
      }
      if (event.key === "ArrowLeft") {
        setActiveSlide((current) => Math.max(0, current - 1));
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const snapshot = dashboardQuery.data;
  const slides = snapshot
    ? [
        <PresentationSlide
          eyebrow="Genel Bakış"
          key="summary"
          subtitle="Toplantıda hızlı açılış için yönetici özeti."
          title={snapshot.period.title}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Audit" tone="green" value={formatPercent(snapshot.summary.auditAverage)} />
            <StatCard label="CSAT" tone="green" value={formatNumber(snapshot.summary.csatAverage, 3)} />
            <StatCard label="Kayıp Sorular" tone="yellow" value={formatPercent(snapshot.summary.missingQuestionsAverage)} />
            <StatCard label="Toplam Görüşme" tone="neutral" value={formatNumber(snapshot.summary.totalConversationCount)} />
          </div>
        </PresentationSlide>,
        <PresentationSlide eyebrow="Audit" key="audit" title="Audit liderleri ve risk alanları">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 p-6">
              <h3 className="text-2xl font-semibold">En yüksek audit</h3>
              <p className="mt-4 text-5xl font-semibold text-emerald-700">
                {snapshot.highlights.bestAudit?.label ?? "-"}
              </p>
              <p className="mt-2 text-xl text-slate-600">{formatPercent(snapshot.highlights.bestAudit?.value)}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 p-6">
              <h3 className="text-2xl font-semibold">En düşük audit</h3>
              <p className="mt-4 text-5xl font-semibold text-rose-700">
                {snapshot.highlights.lowestAudit?.label ?? "-"}
              </p>
              <p className="mt-2 text-xl text-slate-600">{formatPercent(snapshot.highlights.lowestAudit?.value)}</p>
            </div>
          </div>
        </PresentationSlide>,
        <PresentationSlide eyebrow="CSAT" key="csat" title="CSAT öne çıkanlar">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 p-6">
              <h3 className="text-2xl font-semibold">En yüksek CSAT</h3>
              <p className="mt-4 text-5xl font-semibold text-emerald-700">{snapshot.highlights.bestCsat?.label ?? "-"}</p>
              <p className="mt-2 text-xl text-slate-600">{formatNumber(snapshot.highlights.bestCsat?.value, 3)}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 p-6">
              <h3 className="text-2xl font-semibold">En çok yükselen</h3>
              <p className="mt-4 text-5xl font-semibold text-amber-700">
                {snapshot.highlights.mostImproved?.label ?? "-"}
              </p>
              <p className="mt-2 text-xl text-slate-600">{formatNumber(snapshot.highlights.mostImproved?.delta, 2)}</p>
            </div>
          </div>
        </PresentationSlide>,
        <PresentationSlide eyebrow="Sorular" key="questions" title="En zayıf soru başlıkları">
          <div className="grid gap-4">
            {snapshot.rankings.weakestQuestions.map((question) => (
              <div key={question.id} className="rounded-3xl border border-slate-200 p-5">
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{question.topic}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{question.questionText}</p>
                <p className="mt-2 text-lg text-rose-700">{formatPercent(question.accuracyRate)}</p>
              </div>
            ))}
          </div>
        </PresentationSlide>
      ]
    : [];

  const visibleSlide = slides[Math.min(activeSlide, Math.max(slides.length - 1, 0))];

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-panel">
        <select className="rounded-2xl border border-slate-200 px-3 py-2" onChange={(event) => setSearchParams({ periodId: event.target.value, compareToPeriodId: compareToPeriodId ?? "" })} value={periodId}>
          {(periodsQuery.data ?? []).map((period) => (
            <option key={period.id} value={period.id}>
              {period.title}
            </option>
          ))}
        </select>
        <select className="rounded-2xl border border-slate-200 px-3 py-2" onChange={(event) => setSearchParams({ periodId: periodId ?? "", compareToPeriodId: event.target.value })} value={compareToPeriodId ?? ""}>
          <option value="">Karşılaştırma yok</option>
          {(periodsQuery.data ?? []).map((period) => (
            <option key={period.id} value={period.id}>
              {period.title}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button className="rounded-full border px-4 py-2 text-sm font-semibold" onClick={() => setActiveSlide((current) => Math.max(0, current - 1))} type="button">
            Önceki
          </button>
          <button className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white" onClick={() => setActiveSlide((current) => Math.min(slides.length - 1, current + 1))} type="button">
            Sonraki
          </button>
        </div>
      </div>
      {visibleSlide}
    </div>
  );
}
