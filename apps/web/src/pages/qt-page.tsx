import { computeFeedbackCoverage, buildQtOverview, resolveThresholdTone } from "@kalitedb/shared";
import { SectionCard, StatCard } from "@kalitedb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatDurationFromSeconds, formatNumber } from "../lib/format";

function formatEvaluatedTotal(
  totalEvaluatedCallCount: number | null,
  totalEvaluatedChatMailCount: number | null
) {
  const totalEvaluatedCount =
    totalEvaluatedCallCount === null && totalEvaluatedChatMailCount === null
      ? null
      : (totalEvaluatedCallCount ?? 0) + (totalEvaluatedChatMailCount ?? 0);

  if (totalEvaluatedCount === null) {
    return "-";
  }

  if (totalEvaluatedCallCount !== null && totalEvaluatedChatMailCount !== null) {
    return `${formatNumber(totalEvaluatedCallCount)} + ${formatNumber(totalEvaluatedChatMailCount)} = ${formatNumber(totalEvaluatedCount)}`;
  }

  return formatNumber(totalEvaluatedCount);
}

function parseNullableInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function QtPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token)
  });
  const meQuery = useQuery({
    enabled: Boolean(auth.token),
    queryKey: ["me", auth.token],
    queryFn: () => api.getMe(auth.token)
  });
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>();
  const periodId = selectedPeriodId ?? periodsQuery.data?.[0]?.id;
  const [compareToPeriodId, setCompareToPeriodId] = useState<string | undefined>();
  const [manualDraft, setManualDraft] = useState({
    totalEvaluatedCallCount: "",
    totalEvaluatedChatMailCount: "",
    feedbackCount: ""
  });

  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId)
  });
  const manualEntryQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["qt-manual-entry", auth.token, periodId],
    queryFn: () => api.getQtManualEntry(auth.token, periodId!)
  });

  useEffect(() => {
    const entry = manualEntryQuery.data;
    if (!entry) {
      return;
    }

    setManualDraft({
      totalEvaluatedCallCount:
        entry.totalEvaluatedCallCount === null ? "" : String(entry.totalEvaluatedCallCount),
      totalEvaluatedChatMailCount:
        entry.totalEvaluatedChatMailCount === null ? "" : String(entry.totalEvaluatedChatMailCount),
      feedbackCount: entry.feedbackCount === null ? "" : String(entry.feedbackCount)
    });
  }, [manualEntryQuery.data]);

  const manualEntryMutation = useMutation({
    mutationFn: async () => {
      if (!periodId) {
        throw new Error("Dönem bulunamadı.");
      }

      return api.updateQtManualEntry(auth.token, periodId, {
        totalEvaluatedCallCount: parseNullableInteger(manualDraft.totalEvaluatedCallCount),
        totalEvaluatedChatMailCount: parseNullableInteger(manualDraft.totalEvaluatedChatMailCount),
        feedbackCount: parseNullableInteger(manualDraft.feedbackCount)
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["qt-manual-entry", auth.token, periodId] });
    }
  });

  const snapshot = dashboardQuery.data;
  const overview = buildQtOverview(snapshot?.datasets.qtMetrics ?? []);
  const manualCoverage = useMemo(
    () =>
      computeFeedbackCoverage(
        overview.summary.totalListeningSeconds / 3600,
        manualEntryQuery.data?.feedbackCount ?? null
      ),
    [manualEntryQuery.data?.feedbackCount, overview.summary.totalListeningSeconds]
  );
  const feedbackTone = snapshot
    ? resolveThresholdTone(manualCoverage, snapshot.thresholds.feedbackCoverage)
    : "neutral";
  const canEditManualEntry = meQuery.data?.role === "admin" || meQuery.data?.role === "team";

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
        title="QT dinleme özeti"
        description="Ham çağrı kayıtları temsilci bazında gruplanır; çağrı adedi ve toplam dinleme süresi özetlenir."
      >
        <div className="overflow-hidden rounded-[2rem] border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#2f6f5d] text-white">
              <tr>
                <th className="px-5 py-4 text-lg font-semibold">MT</th>
                <th className="px-5 py-4 text-center text-lg font-semibold">Çağrı Adedi</th>
                <th className="px-5 py-4 text-center text-lg font-semibold">Dinlenen Çağrı Süresi</th>
              </tr>
            </thead>
            <tbody>
              {overview.rows.map((row) => (
                <tr key={row.id} className="border-b border-[#d7cfb4] last:border-b-0">
                  <td className="bg-[#b8d4a4] px-5 py-3 text-base font-medium text-slate-900">
                    {row.representativeName}
                  </td>
                  <td className="bg-[#efe3b8] px-5 py-3 text-center text-base text-slate-800">
                    {formatNumber(row.listenedCallCount)}
                  </td>
                  <td className="bg-[#efe3b8] px-5 py-3 text-center text-base text-slate-800">
                    {formatNumber(row.listenedDurationSeconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="QT manuel giriş"
        description="Her QT kendi değerlendirme ve geri bildirim sayılarını bu alandan güncelleyebilir."
      >
        <form
          className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void manualEntryMutation.mutateAsync();
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Değerlendirilen çağrı adedi
            <input
              className="rounded-2xl border border-slate-200 px-3 py-2"
              disabled={!canEditManualEntry}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  totalEvaluatedCallCount: event.target.value
                }))
              }
              value={manualDraft.totalEvaluatedCallCount}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Değerlendirilen chat/mail adedi
            <input
              className="rounded-2xl border border-slate-200 px-3 py-2"
              disabled={!canEditManualEntry}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  totalEvaluatedChatMailCount: event.target.value
                }))
              }
              value={manualDraft.totalEvaluatedChatMailCount}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Geri bildirim sayısı
            <input
              className="rounded-2xl border border-slate-200 px-3 py-2"
              disabled={!canEditManualEntry}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  feedbackCount: event.target.value
                }))
              }
              value={manualDraft.feedbackCount}
            />
          </label>

          <div className="flex items-end">
            <button
              className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canEditManualEntry || manualEntryMutation.isPending}
              type="submit"
            >
              Kaydet
            </button>
          </div>
        </form>

        <p className="mt-3 text-sm text-slate-500">
          {manualEntryQuery.data?.userName
            ? `${manualEntryQuery.data.userName} için dönem bazlı manuel kayıt tutulur.`
            : "Manuel kayıt yükleniyor."}
        </p>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <StatCard
            label="Değerlendirilen çağrı/chat/mail toplamı"
            tone="neutral"
            value={formatEvaluatedTotal(
              manualEntryQuery.data?.totalEvaluatedCallCount ?? null,
              manualEntryQuery.data?.totalEvaluatedChatMailCount ?? null
            )}
          />
          <StatCard
            label="Toplam dinleme süresi"
            tone="neutral"
            value={formatDurationFromSeconds(overview.summary.totalListeningSeconds)}
          />
          <StatCard
            label="Geri bildirim sayısı"
            tone="green"
            value={formatNumber(manualEntryQuery.data?.feedbackCount)}
          />
          <StatCard
            label="Saat başına geri bildirim"
            tone={feedbackTone}
            value={formatNumber(manualCoverage, 2)}
            hint="Hedef: Her 1 saatlik dinleme için en az 2 geri bildirim."
          />
        </div>
      </SectionCard>
    </div>
  );
}
