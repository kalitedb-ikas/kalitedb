import { useQueries, useQuery } from "@tanstack/react-query";
import { ExecutiveChartCard, MetricCarouselCard, StatCard } from "@kalitedb/ui";
import { selectDefaultReportPeriod } from "@kalitedb/shared";
import type { QtManualEntry, ReportPeriod } from "@kalitedb/shared";
import { useEffect, useMemo, useState } from "react";
import { Layers, MessageCircle, Timer, Users, Waves } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber, formatPeriodMonth } from "../lib/format";
import { getRepresentativeDisplayName, getRepresentativePhotoSrc } from "../lib/representative-photos";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import {
  QUARTER_SHORT,
  aggregateQtManualEntries,
  computeActivePeriodIds,
  derivePeriodRangeSelectors
} from "../lib/period-aggregation";

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

function sanitizeQtCardEyebrow(userName: string) {
  return userName.trim().toLowerCase() === "dev admin" ? "" : userName;
}

export function QtPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
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
    queryKey: ["thresholds", auth.token],
    queryFn: () => api.getThresholds(auth.token),
    staleTime: 5 * 60 * 1000
  });

  // Kalite sekmesi CS dönemlerini kullanır (CS QT verisi orada)
  const availablePeriods = useMemo<ReportPeriod[]>(
    () =>
      [...(periodsQuery.data ?? [])]
        .filter((p) => (p.department ?? "cs") === "cs")
        .sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const now = new Date();
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

  const selectedYear = periodRange.year;
  const viewMode = periodRange.viewMode;
  const selectedQuarter = periodRange.quarter ?? 1;

  const { yearPeriods } = useMemo(
    () => derivePeriodRangeSelectors(availablePeriods, selectedYear),
    [availablePeriods, selectedYear]
  );

  const defaultPeriod = useMemo(
    () => selectDefaultReportPeriod(yearPeriods) ?? selectDefaultReportPeriod(availablePeriods),
    [yearPeriods, availablePeriods]
  );

  const periodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId)
    ? periodRange.monthPeriodId
    : defaultPeriod?.id;

  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) {
      setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
    }
  }, [defaultPeriod?.id, periodRange.monthPeriodId]);

  useEffect(() => {
    const current = searchParams.get("periodId");
    if (viewMode === "aylik" && periodId && current !== periodId) {
      const params = new URLSearchParams(searchParams);
      params.set("periodId", periodId);
      setSearchParams(params, { replace: true });
    }
  }, [viewMode, periodId, searchParams, setSearchParams]);

  const activePeriodIds = useMemo(
    () =>
      computeActivePeriodIds(yearPeriods, {
        ...periodRange,
        monthPeriodId: periodId
      }),
    [periodRange, periodId, yearPeriods]
  );

  const activePeriod = useMemo(
    () => availablePeriods.find((p) => p.id === periodId),
    [availablePeriods, periodId]
  );

  const viewLabel = useMemo(() => {
    if (viewMode === "aylik") {
      return activePeriod
        ? formatPeriodMonth(activePeriod.month, { includeYear: true })
        : "Dönem seçilmedi";
    }
    if (viewMode === "ceyreklik") {
      return `${selectedYear} ${QUARTER_SHORT[selectedQuarter - 1]}`;
    }
    return `${selectedYear} (Yıllık)`;
  }, [viewMode, activePeriod, selectedYear, selectedQuarter]);


  // Çoklu period için paralel fetch — her active period için ayrı query
  const qtEntriesQueries = useQueries({
    queries: activePeriodIds.map((pid) => ({
      queryKey: ["qt-manual-entries", auth.token, pid],
      queryFn: () => api.getQtManualEntries(auth.token, pid),
      enabled: Boolean(pid),
      staleTime: 60 * 1000
    }))
  });

  const aggregatedQtEntries: QtManualEntry[] = useMemo(() => {
    const allResults = qtEntriesQueries
      .map((q) => q.data)
      .filter((d): d is QtManualEntry[] => Array.isArray(d));
    if (allResults.length === 0) return [];
    if (allResults.length === 1) return allResults[0]!;
    return aggregateQtManualEntries(allResults);
  }, [qtEntriesQueries]);

  const qtEntries = useMemo(() => {
    return aggregatedQtEntries.filter((entry) => {
      const name = (entry.userName || entry.userEmail).trim().toLowerCase();
      return name !== "" && name !== "dev admin";
    });
  }, [aggregatedQtEntries]);

  const qtCards = useMemo(() => {
    if (qtEntries.length === 0) {
      return [
        {
          eyebrow: "Henüz veri yok",
          title: "QT kartı bekleniyor",
          badge: undefined,
          badgeTone: undefined,
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
    return qtEntries.map((entry, index) => {
      const displayName = getRepresentativeDisplayName(entry.userName || entry.userEmail);
      const feedbackThreshold = thresholdsQuery.data?.feedbackCoverage;
      const feedbackBadgeTone =
        entry.feedbackCoverage == null || !feedbackThreshold
          ? ("neutral" as const)
          : entry.feedbackCoverage >= feedbackThreshold.green
            ? ("green" as const)
            : entry.feedbackCoverage >= feedbackThreshold.yellow
              ? ("yellow" as const)
              : ("red" as const);

      return {
        eyebrow: sanitizeQtCardEyebrow(displayName),
        title: "Toplam dinleme süresi",
        badge: `Feedback ${entry.feedbackCoverage == null ? "-" : formatNumber(entry.feedbackCoverage, 2)}`,
        badgeTone: feedbackBadgeTone,
        value:
          entry.totalListeningHours == null ? "-" : `${formatNumber(entry.totalListeningHours, 2)} saat`,
        detail: `Degerlendirilen toplam ${formatEvaluatedTotal(entry.totalEvaluatedCallCount, entry.totalEvaluatedChatMailCount)} • Geri bildirim ${formatNumber(entry.feedbackCount)} • Eğitim ${formatNumber(entry.trainingCount)} • Toplantı ${formatNumber(entry.meetingCount)}`,
        imageAlt: displayName,
        imageSrc: getRepresentativePhotoSrc(displayName) ?? undefined,
        icon: index % 3 === 0 ? <Timer size={20} /> : index % 3 === 1 ? <Layers size={20} /> : <MessageCircle size={20} />,
        tone: tones[index % tones.length]
      };
    });
  }, [qtEntries, thresholdsQuery.data]);

  const overviewStats = useMemo(() => {
    return {
      totalPeople: qtEntries.length,
      totalListeningHours: qtEntries.reduce((sum, entry) => sum + (entry.totalListeningHours ?? 0), 0),
      totalFeedback: qtEntries.reduce((sum, entry) => sum + (entry.feedbackCount ?? 0), 0)
    };
  }, [qtEntries]);

  return (
    <div className="space-y-6">
      <section className="surface-default rounded-[10px] border border-white/75 px-6 py-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              QT Raporu
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">
              {viewLabel}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Seçilen dönemde {overviewStats.totalPeople} QT üyesi veri girdi.
            </p>
          </div>
          <PeriodRangeFilter
            onChange={setPeriodRange}
            periods={availablePeriods}
            value={{ ...periodRange, monthPeriodId: periodId }}
          />
        </div>
      </section>

      <section className="surface-default rounded-[10px] border border-white/75 px-6 py-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
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
              badge={card.badge}
              badgeTone={card.badgeTone}
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

    </div>
  );
}
