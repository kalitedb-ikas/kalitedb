import { MetaChip, PageHeader, PresentationSlide, StatCard, SurfaceCard } from "@kalitedb/ui";
import { selectDefaultReportPeriod } from "@kalitedb/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { FancySelect } from "../components/fancy-select";
import { formatAuditScore, formatNumber, formatPercent, formatPeriodMonth, getPreviousPeriod } from "../lib/format";
import { brand, chartDark, chartSeriesPalette, chartTooltipDark } from "../theme/colors";

export function PresentationPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSlide, setActiveSlide] = useState(0);
  const dashboardDatasetTypes = ["agent-metrics", "audit-metrics", "question-performance"] as const;
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });
  const periodId = searchParams.get("periodId") ?? selectDefaultReportPeriod(periodsQuery.data ?? [])?.id;
  const compareToPeriodId = searchParams.get("compareToPeriodId") ?? undefined;
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId, dashboardDatasetTypes.join(",")],
    queryFn: () =>
      api.getDashboard(auth.token, periodId, compareToPeriodId, { datasetTypes: [...dashboardDatasetTypes] }),
    staleTime: 60 * 1000
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
  const previousAuditAccuracyLabel = useMemo(() => {
    const previousPeriod = getPreviousPeriod(snapshot?.period.month);
    return previousPeriod ? `${formatPeriodMonth(previousPeriod, { includeYear: true })} audit doğruluk oranı` : "Önceki audit doğruluk oranı";
  }, [snapshot?.period.month]);
  const updateSearchParam = (key: "periodId" | "compareToPeriodId", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  };
  const presentationData = useMemo(() => {
    if (!snapshot) return null;

    const totalCalls = snapshot.datasets.agentMetrics.reduce((sum, item) => sum + item.totalCallCount, 0);
    const totalDigital = snapshot.datasets.agentMetrics.reduce((sum, item) => sum + item.totalChatMailCount, 0);
    const totalTickets = snapshot.datasets.agentMetrics.reduce((sum, item) => sum + item.totalTicketClosedCount, 0);

    return {
      auditTop: snapshot.rankings.auditTop.slice(0, 5).map((item, index) => ({
        label: item.label,
        value: item.value ?? 0,
        fill: chartSeriesPalette[index] ?? brand.primary
      })),
      csatTop: snapshot.rankings.csatTop.slice(0, 5).map((item, index) => ({
        label: item.label,
        value: item.value ?? 0,
        fill: chartSeriesPalette[index] ?? brand.accent
      })),
      weakestQuestions: snapshot.rankings.weakestQuestions.slice(0, 5).map((question, index) => ({
        id: question.id,
        topic: question.topic,
        label: question.questionText.length > 44 ? `${question.questionText.slice(0, 44)}...` : question.questionText,
        accuracy: question.accuracyRate,
        fill: chartSeriesPalette[index] ?? brand.rose
      })),
      channelMix: [
        { name: "Çağrı", value: totalCalls, fill: brand.primary },
        { name: "Chat / E-posta", value: totalDigital, fill: brand.accent },
        { name: "Ticket", value: totalTickets, fill: brand.emerald }
      ]
    };
  }, [snapshot]);

  const slides =
    snapshot && presentationData
      ? [
          <PresentationSlide
            className="h-full"
            eyebrow="Yönetici özeti"
            key="summary"
            subtitle="Toplantıyı açmak için kalite, memnuniyet ve hacim göstergelerini tek sahnede özetleyin."
            title={`${snapshot.period.title} yönetici özeti`}
          >
            <div className="flex h-full flex-col justify-between gap-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard compact label="Audit" tone="green" value={formatAuditScore(snapshot.summary.auditAverage)} />
                <StatCard compact label="CSAT" tone="green" value={formatNumber(snapshot.summary.csatAverage, 3)} />
                <StatCard compact label={previousAuditAccuracyLabel} tone="yellow" value={formatPercent(snapshot.summary.previousAuditAccuracyAverage)} />
                <StatCard compact label="Toplam görüşme" tone="neutral" value={formatNumber(snapshot.summary.totalConversationCount)} />
              </div>

              <div className="grid flex-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <DarkInsight
                  description={
                    snapshot.highlights.mostImproved?.label
                      ? `${snapshot.highlights.mostImproved.label} kalite performansında pozitif ivme yakaladı.`
                      : "Karşılaştırma dönemi eklendiğinde ivme hikayesi burada görünür."
                  }
                  eyebrow="Ana anlatı"
                  title="Bu dönem kalite görünümü daha net ve yönetilebilir."
                />
                <div className="grid gap-4">
                  <SlideMiniCard
                    label="Audit lideri"
                    value={snapshot.highlights.bestAudit?.label ?? "-"}
                    detail={formatAuditScore(snapshot.highlights.bestAudit?.value)}
                  />
                  <SlideMiniCard
                    label="CSAT lideri"
                    value={snapshot.highlights.bestCsat?.label ?? "-"}
                    detail={formatNumber(snapshot.highlights.bestCsat?.value, 3)}
                  />
                </div>
              </div>
            </div>
          </PresentationSlide>,
          <PresentationSlide
            className="h-full"
            eyebrow="Audit"
            key="audit"
            subtitle="Başarılı temsilcileri ve aşağı çeken riskleri tek grafikte özetleyin."
            title="Audit başarı ve risk görünümü"
          >
            <div className="flex h-full flex-col justify-between gap-6">
              <div className="grid flex-1 gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                <ChartShell title="Audit liderleri">
                  <div className="h-80">
                    <ResponsiveContainer height="100%" width="100%">
                      <BarChart data={presentationData.auditTop}>
                        <CartesianGrid stroke={chartDark.grid} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: chartDark.tick, fontSize: 11 }} tickLine={false} />
                        <YAxis tick={{ fill: chartDark.tick, fontSize: 11 }} tickLine={false} />
                        <Tooltip
                          contentStyle={{ ...chartTooltipDark }}
                          formatter={(value) => [formatAuditScore(Number(value)), "Audit"]}
                        />
                        <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                          {presentationData.auditTop.map((item) => (
                            <Cell key={item.label} fill={item.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>
                <div className="grid gap-4">
                  <SlideMiniCard
                    label="En yüksek audit"
                    value={snapshot.highlights.bestAudit?.label ?? "-"}
                    detail={formatAuditScore(snapshot.highlights.bestAudit?.value)}
                  />
                  <SlideMiniCard
                    label="En düşük audit"
                    value={snapshot.highlights.lowestAudit?.label ?? "-"}
                    detail={formatAuditScore(snapshot.highlights.lowestAudit?.value)}
                  />
                  <SlideMiniCard
                    label="Yükselen temsilci"
                    value={snapshot.highlights.mostImproved?.label ?? "-"}
                    detail={
                      snapshot.highlights.mostImproved?.delta != null
                        ? `Değişim ${formatNumber(snapshot.highlights.mostImproved.delta, 2)}`
                        : "Karşılaştırma yok"
                    }
                  />
                </div>
              </div>
            </div>
          </PresentationSlide>,
          <PresentationSlide
            className="h-full"
            eyebrow="CSAT"
            key="csat"
            subtitle="Memnuniyet liderleri ile operasyon karışımını birlikte okuyarak daha net karar verin."
            title="CSAT dağılımı ve kanal dengesi"
          >
            <div className="flex h-full flex-col justify-between gap-6">
              <div className="grid flex-1 gap-4 lg:grid-cols-[0.86fr_1.14fr]">
                <ChartShell title="Kanal dağılımı">
                  <div className="h-80">
                    <ResponsiveContainer height="100%" width="100%">
                      <PieChart>
                        <Pie
                          cx="50%"
                          cy="50%"
                          data={presentationData.channelMix}
                          dataKey="value"
                          innerRadius={74}
                          outerRadius={110}
                          paddingAngle={4}
                        >
                          {presentationData.channelMix.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ ...chartTooltipDark }}
                          formatter={(value) => [formatNumber(Number(value)), "Hacim"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 grid gap-2">
                    {presentationData.channelMix.map((item) => (
                      <div key={item.name} className="flex items-center justify-between rounded-[10px] border border-white/10 bg-white/[0.04] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full" style={{ background: item.fill }} />
                          <span className="text-sm text-white/88">{item.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-white">{formatNumber(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </ChartShell>

                <ChartShell title="CSAT liderleri">
                  <div className="h-80">
                    <ResponsiveContainer height="100%" width="100%">
                      <BarChart data={presentationData.csatTop} layout="vertical" margin={{ left: 16, right: 12 }}>
                        <CartesianGrid horizontal={false} stroke={chartDark.grid} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="value"
                          domain={[4.5, 5.05]}
                          tick={{ fill: chartDark.tick, fontSize: 11 }}
                          tickLine={false}
                          type="number"
                        />
                        <YAxis
                          dataKey="label"
                          tick={{ fill: chartDark.tickStrong, fontSize: 12 }}
                          tickLine={false}
                          type="category"
                          width={110}
                        />
                        <Tooltip
                          contentStyle={{ ...chartTooltipDark }}
                          formatter={(value) => [formatNumber(Number(value), 3), "CSAT"]}
                        />
                        <Bar dataKey="value" radius={[0, 12, 12, 0]}>
                          {presentationData.csatTop.map((item) => (
                            <Cell key={item.label} fill={item.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>
              </div>
            </div>
          </PresentationSlide>,
          <PresentationSlide
            className="h-full"
            eyebrow="Eğitim gündemi"
            key="questions"
            subtitle="En zayıf soru başlıklarını vurgulayarak aksiyon önceliğini hızla netleştirin."
            title="Kırılgan soru alanları"
          >
            <div className="flex h-full flex-col justify-between gap-6">
              <div className="grid flex-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <ChartShell title="En zayıf soru başlıkları">
                  <div className="h-80">
                    <ResponsiveContainer height="100%" width="100%">
                      <BarChart data={presentationData.weakestQuestions}>
                        <CartesianGrid stroke={chartDark.grid} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: chartDark.tick, fontSize: 11 }} tickLine={false} />
                        <YAxis tick={{ fill: chartDark.tick, fontSize: 11 }} tickLine={false} />
                        <Tooltip
                          contentStyle={{ ...chartTooltipDark }}
                          formatter={(value) => [formatPercent(Number(value)), "Doğruluk"]}
                          labelFormatter={(_, payload) => (payload?.[0]?.payload as { topic?: string } | undefined)?.topic ?? _}
                        />
                        <Bar dataKey="accuracy" radius={[10, 10, 0, 0]}>
                          {presentationData.weakestQuestions.map((question) => (
                            <Cell key={question.id} fill={question.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>

                <div className="grid gap-4">
                  {snapshot.rankings.weakestQuestions.slice(0, 3).map((question) => (
                    <SlideMiniCard
                      key={question.id}
                      label={question.topic}
                      value={question.questionText}
                      detail={formatPercent(question.accuracyRate)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </PresentationSlide>
        ]
      : [];

  const boundedSlide = Math.min(activeSlide, Math.max(slides.length - 1, 0));
  const visibleSlide = slides[boundedSlide];

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <FancySelect
            ariaLabel="Ay seçimi"
            className="min-w-[220px]"
            panelWidthClass="w-60"
            options={(periodsQuery.data ?? []).map((period) => ({ value: period.id, label: period.title }))}
            value={periodId ?? ""}
            onChange={(v) => updateSearchParam("periodId", v)}
            placeholder="Dönem seçin"
          />
        }
        eyebrow="Özet modu"
        metaChips={
          <>
            <MetaChip>{snapshot?.period.title ?? "Dönem bekleniyor"}</MetaChip>
            <MetaChip>{snapshot?.compareToPeriod ? `Karşılaştırma: ${snapshot.compareToPeriod.title}` : "Karşılaştırma yok"}</MetaChip>
          </>
        }
        subtitle="Toplantı akışına uygun, tam ekran hissi veren özet sahneler hazırlayın."
        title="Özet"
      />

      <SurfaceCard variant="subtle">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <FancySelect
              ariaLabel="Karşılaştırma dönemi"
              panelWidthClass="w-60"
              clearable
              clearLabel="Karşılaştırma yok"
              options={(periodsQuery.data ?? []).map((period) => ({ value: period.id, label: period.title }))}
              value={compareToPeriodId ?? ""}
              onChange={(v) => updateSearchParam("compareToPeriodId", v)}
              placeholder="Karşılaştırma yok"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <MetaChip>Slide {slides.length === 0 ? 0 : boundedSlide + 1} / {slides.length}</MetaChip>
            <button
              className="inline-flex min-h-10 items-center rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 text-sm font-semibold text-slate-700 dark:text-slate-400 transition hover:border-slate-300 dark:hover:border-slate-500 hover:text-slate-950 dark:hover:text-slate-200"
              onClick={() => setActiveSlide((current) => Math.max(0, current - 1))}
              type="button"
            >
              Önceki
            </button>
            <button
              className="inline-flex min-h-10 items-center rounded-full bg-slate-950 dark:bg-slate-100 px-4 text-sm font-semibold text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-300"
              onClick={() => setActiveSlide((current) => Math.min(slides.length - 1, current + 1))}
              type="button"
            >
              Sonraki
            </button>
          </div>
        </div>
      </SurfaceCard>

      <div className="mx-auto max-w-[1280px]">
        <div className="lg:aspect-[16/9]">{visibleSlide}</div>
      </div>
    </div>
  );
}

function ChartShell(props: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-white/12 bg-white/[0.04] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">{props.title}</p>
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

function DarkInsight(props: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="rounded-[10px] border border-white/12 bg-white/[0.05] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/58">{props.eyebrow}</p>
      <h3 className="mt-4 font-display text-3xl font-semibold tracking-[-0.04em] text-white">{props.title}</h3>
      <p className="mt-4 text-base leading-8 text-white/76">{props.description}</p>
    </div>
  );
}

function SlideMiniCard(props: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[10px] border border-white/12 bg-white/[0.05] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/56">{props.label}</p>
      <p className="mt-4 text-xl font-semibold tracking-[-0.03em] text-white">{props.value}</p>
      <p className="mt-2 text-sm leading-6 text-white/68">{props.detail}</p>
    </div>
  );
}
