import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExecutiveChartCard, MetricCarouselCard, StatCard } from "@kalitedb/ui";
import { selectDefaultReportPeriod } from "@kalitedb/shared";
import { useEffect, useMemo, useState } from "react";
import { Layers, MessageCircle, Save, Timer, Users, Waves } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";

function formatEvaluatedTotal(totalEvaluatedCallCount: number | null, totalEvaluatedChatMailCount: number | null) {
  const totalEvaluatedCount =
    totalEvaluatedCallCount === null && totalEvaluatedChatMailCount === null
      ? null
      : (totalEvaluatedCallCount ?? 0) + (totalEvaluatedChatMailCount ?? 0);

  if (totalEvaluatedCount === null) {
    return "-";
  }

  return formatNumber(totalEvaluatedCount);
}

function parseNullableInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function parseNullableNumber(value: string) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeQtCardEyebrow(userName: string) {
  return userName.trim().toLowerCase() === "dev admin" ? "" : userName;
}

export function QtPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });
  const meQuery = useQuery({
    enabled: Boolean(auth.token),
    queryKey: ["me", auth.token],
    queryFn: () => api.getMe(auth.token),
    staleTime: 5 * 60 * 1000
  });
  const thresholdsQuery = useQuery({
    enabled: Boolean(auth.token),
    queryKey: ["thresholds", auth.token],
    queryFn: () => api.getThresholds(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const periodId = searchParams.get("periodId") ?? selectDefaultReportPeriod(periodsQuery.data ?? [])?.id;
  const [manualDraft, setManualDraft] = useState({
    totalListeningHours: "",
    totalEvaluatedCallCount: "",
    totalEvaluatedChatMailCount: "",
    feedbackCount: "",
    feedbackCoverage: ""
  });

  const canEditManualEntry = meQuery.data?.role === "qt";

  const qtEntriesQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["qt-manual-entries", auth.token, periodId],
    queryFn: () => api.getQtManualEntries(auth.token, periodId!)
  });

  const manualEntryQuery = useQuery({
    enabled: Boolean(periodId && canEditManualEntry),
    queryKey: ["qt-manual-entry", auth.token, periodId],
    queryFn: () => api.getQtManualEntry(auth.token, periodId!),
    staleTime: 60 * 1000
  });

  useEffect(() => {
    const entry = manualEntryQuery.data;
    if (!entry) return;

    setManualDraft({
      totalListeningHours: entry.totalListeningHours == null ? "" : String(entry.totalListeningHours),
      totalEvaluatedCallCount: entry.totalEvaluatedCallCount == null ? "" : String(entry.totalEvaluatedCallCount),
      totalEvaluatedChatMailCount:
        entry.totalEvaluatedChatMailCount == null ? "" : String(entry.totalEvaluatedChatMailCount),
      feedbackCount: entry.feedbackCount == null ? "" : String(entry.feedbackCount),
      feedbackCoverage: entry.feedbackCoverage == null ? "" : String(entry.feedbackCoverage)
    });
  }, [manualEntryQuery.data]);

  const manualEntryMutation = useMutation({
    mutationFn: async () => {
      if (!periodId) {
        throw new Error("Dönem bulunamadı.");
      }

      return api.updateQtManualEntry(auth.token, periodId, {
        totalListeningHours: parseNullableNumber(manualDraft.totalListeningHours),
        totalEvaluatedCallCount: parseNullableInteger(manualDraft.totalEvaluatedCallCount),
        totalEvaluatedChatMailCount: parseNullableInteger(manualDraft.totalEvaluatedChatMailCount),
        feedbackCount: parseNullableInteger(manualDraft.feedbackCount),
        feedbackCoverage: parseNullableNumber(manualDraft.feedbackCoverage)
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["qt-manual-entry", auth.token, periodId] }),
        queryClient.invalidateQueries({ queryKey: ["qt-manual-entries", auth.token, periodId] })
      ]);
    }
  });

  const feedbackTone = (() => {
    const value = manualEntryQuery.data?.feedbackCoverage;
    const threshold = thresholdsQuery.data?.feedbackCoverage;

    if (value === null || value === undefined || !threshold) return "neutral" as const;
    if (value >= threshold.green) return "green" as const;
    if (value >= threshold.yellow) return "yellow" as const;
    return "red" as const;
  })();

  const qtCards = useMemo(() => {
    const entries = qtEntriesQuery.data ?? [];
    if (entries.length === 0) {
      return [
        {
          eyebrow: "Henüz veri yok",
          title: "QT kartı bekleniyor",
          value: "-",
          detail: "QT kullanıcıları kendi girişlerini yaptığında bu alan kişi kişi dolacak.",
          imageAlt: undefined,
          imageSrc: undefined,
          icon: <Users size={20} />,
          tone: "violet" as const
        }
      ];
    }

    const tones = ["orange", "violet", "emerald"] as const;
    return entries.map((entry, index) => ({
      eyebrow: sanitizeQtCardEyebrow(entry.userName),
      title: "Toplam dinleme süresi",
      value:
        entry.totalListeningHours == null ? "-" : `${formatNumber(entry.totalListeningHours, 2)} saat`,
      detail: `Degerlendirilen toplam ${formatEvaluatedTotal(entry.totalEvaluatedCallCount, entry.totalEvaluatedChatMailCount)} • Geri bildirim ${formatNumber(entry.feedbackCount)}`,
      imageAlt: entry.userName,
      imageSrc: getRepresentativePhotoSrc(entry.userName) ?? undefined,
      icon: index % 3 === 0 ? <Timer size={20} /> : index % 3 === 1 ? <Layers size={20} /> : <MessageCircle size={20} />,
      tone: tones[index % tones.length]
    }));
  }, [qtEntriesQuery.data]);

  const overviewStats = useMemo(() => {
    const entries = qtEntriesQuery.data ?? [];
    return {
      totalPeople: entries.length,
      totalListeningHours: entries.reduce((sum, entry) => sum + (entry.totalListeningHours ?? 0), 0),
      totalFeedback: entries.reduce((sum, entry) => sum + (entry.feedbackCount ?? 0), 0)
    };
  }, [qtEntriesQuery.data]);

  return (
    <div className="space-y-6">
      <section className="surface-default rounded-[34px] border border-white/75 px-6 py-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            icon={<Waves size={18} />}
            label="Toplam dinleme"
            tone="neutral"
            value={formatNumber(overviewStats.totalListeningHours, 2)}
          />
          <StatCard
            icon={<MessageCircle size={18} />}
            label="Toplam geri bildirim"
            tone="neutral"
            value={formatNumber(overviewStats.totalFeedback)}
          />
        </div>
      </section>

      <ExecutiveChartCard title="QT özet">
        <div className="metric-marquee flex gap-4 overflow-x-auto pb-2">
          {qtCards.map((card) => (
            <MetricCarouselCard
              key={`${card.eyebrow}-${card.title}`}
              detail={card.detail}
              eyebrow={card.eyebrow}
              icon={card.icon}
              imageAlt={card.imageAlt}
              imageSrc={card.imageSrc}
              title={card.title}
              tone={card.tone}
              value={card.value}
            />
          ))}
        </div>
      </ExecutiveChartCard>

      {canEditManualEntry ? (
        <ExecutiveChartCard title="QT veri girişi">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
            <p className="text-sm font-semibold text-slate-900">Manuel giriş alanı taşındı</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              QT verileri artık <span className="font-semibold">Yönetim &gt; QT</span> alanından giriliyor. Ayı seçip aynı ekrandan manuel kayıt yapabilirsiniz.
            </p>
          </div>
        </ExecutiveChartCard>
      ) : null}
    </div>
  );
}

function QtFormField(props: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-600">
      {props.label}
      <input
        className="rounded-[20px] border border-white/50 bg-white/88 px-4 py-3 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-slate-100"
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        value={props.value}
      />
    </label>
  );
}
