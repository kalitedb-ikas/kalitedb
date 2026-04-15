import type { ColumnDef } from "@tanstack/react-table";
import type { QtManualEntry } from "@kalitedb/shared";
import { SurfaceCard } from "@kalitedb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Headphones, RefreshCw, Save } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { DataTable } from "../components/data-table";
import { FancySelect } from "../components/fancy-select";
import { useAuth } from "../lib/auth";
import { api, type AuthenticatedUser } from "../lib/api";
import { formatNumber } from "../lib/format";
import { getRepresentativeDisplayName } from "../lib/representative-photos";

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0");
  const label = new Intl.DateTimeFormat("tr-TR", { month: "long" }).format(new Date(`2026-${value}-01T00:00:00`));
  return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
});

const EMPTY_QT_MANUAL_INPUTS = {
  totalListeningHours: "",
  totalEvaluatedCallCount: "",
  totalEvaluatedChatMailCount: "",
  feedbackCount: "",
  feedbackCoverage: "",
  trainingCount: "",
  meetingCount: ""
};

function normalizeEmailValue(email: string) {
  return email.trim().toLocaleLowerCase("tr-TR");
}

function mapQtManualEntryToInputs(entry: QtManualEntry) {
  return {
    totalListeningHours: entry.totalListeningHours == null ? "" : String(entry.totalListeningHours),
    totalEvaluatedCallCount: entry.totalEvaluatedCallCount == null ? "" : String(entry.totalEvaluatedCallCount),
    totalEvaluatedChatMailCount: entry.totalEvaluatedChatMailCount == null ? "" : String(entry.totalEvaluatedChatMailCount),
    feedbackCount: entry.feedbackCount == null ? "" : String(entry.feedbackCount),
    feedbackCoverage: entry.feedbackCoverage == null ? "" : String(entry.feedbackCoverage),
    trainingCount: entry.trainingCount == null ? "" : String(entry.trainingCount),
    meetingCount: entry.meetingCount == null ? "" : String(entry.meetingCount)
  };
}

function parseNullableIntegerInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits);
}

function parseNullableDecimalInput(value: string) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatLongMonth(period: string) {
  const date = new Date(`${period}-01T00:00:00`);
  const label = new Intl.DateTimeFormat("tr-TR", { month: "long" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatPeriodChip(period: string) {
  const [year] = period.split("-");
  return `${formatLongMonth(period)} ${year}`;
}

export function QualityAdminPage(props: { currentUserRole?: AuthenticatedUser["role"] | undefined }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();

  const isAdminUser = true;
  const canEditQtManualEntry = true;

  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonthValue, setSelectedMonthValue] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [selectedQtTargetEmail, setSelectedQtTargetEmail] = useState("");
  const [qtManualInputs, setQtManualInputs] = useState(EMPTY_QT_MANUAL_INPUTS);
  const [isQtManualDirty, setIsQtManualDirty] = useState(false);
  const [lastQtManualHydratedKey, setLastQtManualHydratedKey] = useState("");

  const activePeriodMonth = `${selectedYear}-${selectedMonthValue}`;

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token)
  });

  // QT verisi CS dönemlerinde tutuluyor, bu yüzden sadece CS dönemlerini kullan.
  const csPeriods = useMemo(
    () => (periodsQuery.data ?? []).filter((p) => (p.department ?? "cs") === "cs"),
    [periodsQuery.data]
  );

  const availableYears = useMemo(
    () =>
      Array.from(
        new Set([String(new Date().getFullYear()), ...csPeriods.map((period) => period.month.slice(0, 4))])
      ).sort((left, right) => right.localeCompare(left)),
    [csPeriods]
  );

  const selectedPeriod = useMemo(
    () => csPeriods.find((period) => period.month === activePeriodMonth),
    [csPeriods, activePeriodMonth]
  );
  const selectedPeriodId = selectedPeriod?.id ?? "";

  const rolesQuery = useQuery({
    enabled: auth.token !== null && isAdminUser,
    queryKey: ["roles", auth.token],
    queryFn: () => api.getRoles(auth.token)
  });

  const qtManualEntriesQuery = useQuery({
    enabled: Boolean(selectedPeriodId),
    queryKey: ["qt-manual-entries", auth.token, selectedPeriodId],
    queryFn: () => api.getQtManualEntries(auth.token, selectedPeriodId)
  });

  const qtTargetOptions = useMemo(() => {
    const options = new Map<string, { email: string; name: string; label: string }>();

    for (const assignment of rolesQuery.data ?? []) {
      if (assignment.role !== "qt" && assignment.role !== "quality") {
        continue;
      }

      const normalizedEmail = normalizeEmailValue(assignment.email);
      const displayName = getRepresentativeDisplayName(assignment.email);
      options.set(normalizedEmail, {
        email: normalizedEmail,
        name: displayName,
        label: displayName === normalizedEmail ? normalizedEmail : `${displayName} (${normalizedEmail})`
      });
    }

    for (const entry of qtManualEntriesQuery.data ?? []) {
      const normalizedEmail = normalizeEmailValue(entry.userEmail);
      const displayName = getRepresentativeDisplayName(entry.userName || entry.userEmail);
      options.set(normalizedEmail, {
        email: normalizedEmail,
        name: displayName,
        label: displayName === normalizedEmail ? normalizedEmail : `${displayName} (${normalizedEmail})`
      });
    }

    return Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label, "tr"));
  }, [qtManualEntriesQuery.data, rolesQuery.data]);

  const selectedQtTarget = useMemo(() => {
    if (!canEditQtManualEntry) {
      return undefined;
    }

    if (!isAdminUser) {
      const currentUserEmail = auth.user?.email ? normalizeEmailValue(auth.user.email) : undefined;
      const currentUserName = auth.user?.displayName?.trim() || auth.user?.email || undefined;

      return currentUserEmail
        ? {
            targetUserEmail: currentUserEmail,
            targetUserName: currentUserName ?? currentUserEmail
          }
        : undefined;
    }

    const matchedTarget =
      qtTargetOptions.find((option) => option.email === selectedQtTargetEmail) ?? qtTargetOptions[0];

    return matchedTarget
      ? {
          targetUserEmail: matchedTarget.email,
          targetUserName: matchedTarget.name
        }
      : undefined;
  }, [auth.user?.displayName, auth.user?.email, canEditQtManualEntry, isAdminUser, qtTargetOptions, selectedQtTargetEmail]);

  const qtManualEntryQuery = useQuery({
    enabled: Boolean(selectedPeriodId && canEditQtManualEntry && (!isAdminUser || selectedQtTarget?.targetUserEmail)),
    queryKey: ["qt-manual-entry", auth.token, selectedPeriodId, selectedQtTarget?.targetUserEmail],
    queryFn: () => api.getQtManualEntry(auth.token, selectedPeriodId, selectedQtTarget),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const qtManualEntryMutation = useMutation({
    mutationFn: async (values: typeof qtManualInputs) => {
      if (!selectedPeriodId) {
        throw new Error("Önce dönem seçin.");
      }

      return api.updateQtManualEntry(
        auth.token,
        selectedPeriodId,
        {
          totalListeningHours: parseNullableDecimalInput(values.totalListeningHours),
          totalEvaluatedCallCount: parseNullableIntegerInput(values.totalEvaluatedCallCount),
          totalEvaluatedChatMailCount: parseNullableIntegerInput(values.totalEvaluatedChatMailCount),
          feedbackCount: parseNullableIntegerInput(values.feedbackCount),
          feedbackCoverage: parseNullableDecimalInput(values.feedbackCoverage),
          trainingCount: parseNullableIntegerInput(values.trainingCount),
          meetingCount: parseNullableIntegerInput(values.meetingCount)
        },
        selectedQtTarget
      );
    },
    onSuccess: async () => {
      setIsQtManualDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["qt-manual-entry", auth.token, selectedPeriodId] }),
        queryClient.invalidateQueries({ queryKey: ["qt-manual-entries", auth.token, selectedPeriodId] })
      ]);
    }
  });

  useEffect(() => {
    if (!canEditQtManualEntry) {
      return;
    }
    setQtManualInputs(EMPTY_QT_MANUAL_INPUTS);
    setIsQtManualDirty(false);
    setLastQtManualHydratedKey("");
  }, [canEditQtManualEntry, selectedPeriodId, selectedQtTarget?.targetUserEmail]);

  useEffect(() => {
    const entry = qtManualEntryQuery.data;
    if (!entry) {
      return;
    }

    const entryKey = `${entry.periodId}:${normalizeEmailValue(entry.userEmail)}`;
    if (isQtManualDirty && lastQtManualHydratedKey === entryKey) {
      return;
    }

    setQtManualInputs(mapQtManualEntryToInputs(entry));
    setIsQtManualDirty(false);
    setLastQtManualHydratedKey(entryKey);
  }, [isQtManualDirty, lastQtManualHydratedKey, qtManualEntryQuery.data]);

  useEffect(() => {
    if (!isAdminUser) {
      return;
    }

    if (qtTargetOptions.length === 0) {
      if (selectedQtTargetEmail !== "") {
        setSelectedQtTargetEmail("");
      }
      return;
    }

    if (!qtTargetOptions.some((option) => option.email === selectedQtTargetEmail)) {
      setSelectedQtTargetEmail(qtTargetOptions[0]!.email);
    }
  }, [isAdminUser, qtTargetOptions, selectedQtTargetEmail]);

  const qtManualFormDisabled = qtManualEntryQuery.isPending || qtManualEntryMutation.isPending;

  const qtManualColumns = useMemo<ColumnDef<QtManualEntry>[]>(() => {
    const columns: ColumnDef<QtManualEntry>[] = [
      {
        header: "QT",
        accessorFn: (row) => getRepresentativeDisplayName(row.userName || row.userEmail)
      },
      {
        header: "Toplam dinleme",
        accessorFn: (row) => row.totalListeningHours,
        cell: ({ row }) =>
          row.original.totalListeningHours == null ? "-" : `${formatNumber(row.original.totalListeningHours, 2)} saat`
      },
      {
        header: "Değerlendirilen çağrı",
        accessorFn: (row) => row.totalEvaluatedCallCount,
        cell: ({ row }) => formatNumber(row.original.totalEvaluatedCallCount)
      },
      {
        header: "Chat / e-posta",
        accessorFn: (row) => row.totalEvaluatedChatMailCount,
        cell: ({ row }) => formatNumber(row.original.totalEvaluatedChatMailCount)
      },
      {
        header: "Geri bildirim",
        accessorFn: (row) => row.feedbackCount,
        cell: ({ row }) => formatNumber(row.original.feedbackCount)
      },
      {
        header: "Saat başına geri bildirim",
        accessorFn: (row) => row.feedbackCoverage,
        cell: ({ row }) => formatNumber(row.original.feedbackCoverage, 2)
      },
      {
        header: "Eğitim",
        accessorFn: (row) => row.trainingCount,
        cell: ({ row }) => formatNumber(row.original.trainingCount)
      },
      {
        header: "Toplantı",
        accessorFn: (row) => row.meetingCount,
        cell: ({ row }) => formatNumber(row.original.meetingCount)
      }
    ];

    if (isAdminUser) {
      columns.push({
        header: "İşlem",
        id: "action",
        cell: ({ row }) => (
          <button
            className="rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:border-primary/30 hover:text-primary"
            onClick={() => setSelectedQtTargetEmail(normalizeEmailValue(row.original.userEmail))}
            type="button"
          >
            Düzenle
          </button>
        )
      });
    }

    return columns;
  }, [isAdminUser]);

  const refreshCurrentView = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["periods", auth.token] }),
      queryClient.invalidateQueries({ queryKey: ["qt-manual-entry", auth.token, selectedPeriodId] }),
      queryClient.invalidateQueries({ queryKey: ["qt-manual-entries", auth.token, selectedPeriodId] }),
      queryClient.invalidateQueries({ queryKey: ["roles", auth.token] })
    ]);
  };

  return (
    <div className="rounded-[10px] border border-sky-100/90 dark:border-slate-700/50 bg-[#edf6fb] dark:bg-slate-900/80 p-5 shadow-[0_34px_90px_rgba(15,23,42,0.12)]">
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[10px] border border-slate-200/90 dark:border-slate-600/40 bg-white dark:bg-slate-800 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-200/80 dark:border-slate-600/40 px-6 py-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">{auth.user?.email ?? "Yerel yönetim erişimi"}</p>
          </div>

          <div className="border-b border-slate-200/80 dark:border-slate-600/40 px-6 py-6">
            <SidebarSectionTitle>Dönem</SidebarSectionTitle>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              <InputField label="Yıl">
                <FancySelect
                  size="lg"
                  className="w-full"
                  panelWidthClass="w-40"
                  options={availableYears.map((year) => ({ value: year, label: year }))}
                  value={selectedYear}
                  onChange={setSelectedYear}
                  placeholder="Yıl"
                />
              </InputField>
              <InputField label="Ay">
                <FancySelect
                  size="lg"
                  className="w-full"
                  panelWidthClass="w-44"
                  options={MONTH_OPTIONS.map((month) => ({ value: month.value, label: month.label }))}
                  value={selectedMonthValue}
                  onChange={setSelectedMonthValue}
                  placeholder="Ay"
                />
              </InputField>
            </div>
          </div>

          <div className="border-b border-slate-200/80 dark:border-slate-600/40 px-6 py-6">
            <SidebarSectionTitle>Aksiyonlar</SidebarSectionTitle>
            <div className="mt-5 space-y-2">
              <SidebarActionButton icon={<RefreshCw size={15} />} onClick={() => void refreshCurrentView()}>
                Veriyi yenile
              </SidebarActionButton>
            </div>
          </div>

          <div className="px-6 py-6">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Bu panel Kalite ekibinin aylık dinleme, değerlendirme ve geri bildirim verilerini manuel olarak girmesi için tasarlanmıştır.
            </p>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="rounded-[10px] border border-slate-200/90 dark:border-slate-600/40 bg-white dark:bg-slate-800 px-8 py-6 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center gap-2">
              <HeaderPill>QT Manuel Giriş</HeaderPill>
              <HeaderPill tone="accent">{formatPeriodChip(activePeriodMonth)}</HeaderPill>
              <HeaderPill tone="success">
                <span className="inline-flex items-center gap-1.5">
                  <Headphones size={12} /> Kalite Ekibi
                </span>
              </HeaderPill>
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-100 sm:text-4xl">
              Kalite Yönetim Paneli
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              QT kullanıcıları için dinleme saatleri, değerlendirme adetleri ve geri bildirim verilerini bu panelden yönetin.
            </p>
          </section>

          <div className="grid gap-6 xl:grid-cols-[0.84fr_1.16fr]">
            <SurfaceCard
              description="Seçili dönem için QT kullanıcısı adına dinleme, değerlendirme ve geri bildirim değerlerini manuel olarak girin."
              title={canEditQtManualEntry ? "QT manuel girişi" : "QT veri akışı"}
              variant="default"
            >
              {canEditQtManualEntry ? (
                <>
                  {isAdminUser ? (
                    <div className="mb-4 space-y-3">
                      <InputField label="QT kullanıcısı">
                        <select
                          className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
                          disabled={qtTargetOptions.length === 0 || qtManualEntryQuery.isPending}
                          onChange={(event) => setSelectedQtTargetEmail(event.target.value)}
                          value={selectedQtTargetEmail}
                        >
                          {qtTargetOptions.length === 0 ? (
                            <option value="">QT kullanıcısı bulunamadı</option>
                          ) : (
                            qtTargetOptions.map((option) => (
                              <option key={option.email} value={option.email}>
                                {option.label}
                              </option>
                            ))
                          )}
                        </select>
                      </InputField>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Admin olarak seçtiğiniz QT kullanıcısı adına manuel veri girebilirsiniz.
                      </p>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <InputField label="Toplam dinleme süresi (saat)">
                      <input
                        className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
                        disabled={qtManualFormDisabled}
                        onChange={(event) =>
                          setQtManualInputs((current) => {
                            setIsQtManualDirty(true);
                            return { ...current, totalListeningHours: event.target.value };
                          })
                        }
                        placeholder="Örn. 42,5"
                        type="text"
                        value={qtManualInputs.totalListeningHours}
                      />
                    </InputField>
                    <InputField label="Değerlendirilen çağrı adedi">
                      <input
                        className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
                        disabled={qtManualFormDisabled}
                        inputMode="numeric"
                        onChange={(event) =>
                          setQtManualInputs((current) => {
                            setIsQtManualDirty(true);
                            return { ...current, totalEvaluatedCallCount: event.target.value };
                          })
                        }
                        placeholder="Örn. 120"
                        type="text"
                        value={qtManualInputs.totalEvaluatedCallCount}
                      />
                    </InputField>
                    <InputField label="Değerlendirilen chat / e-posta adedi">
                      <input
                        className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
                        disabled={qtManualFormDisabled}
                        inputMode="numeric"
                        onChange={(event) =>
                          setQtManualInputs((current) => {
                            setIsQtManualDirty(true);
                            return { ...current, totalEvaluatedChatMailCount: event.target.value };
                          })
                        }
                        placeholder="Örn. 35"
                        type="text"
                        value={qtManualInputs.totalEvaluatedChatMailCount}
                      />
                    </InputField>
                    <InputField label="Geri bildirim sayısı">
                      <input
                        className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
                        disabled={qtManualFormDisabled}
                        inputMode="numeric"
                        onChange={(event) =>
                          setQtManualInputs((current) => {
                            setIsQtManualDirty(true);
                            return { ...current, feedbackCount: event.target.value };
                          })
                        }
                        placeholder="Örn. 24"
                        type="text"
                        value={qtManualInputs.feedbackCount}
                      />
                    </InputField>
                    <InputField label="Saat başına geri bildirim oranı">
                      <input
                        className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
                        disabled={qtManualFormDisabled}
                        onChange={(event) =>
                          setQtManualInputs((current) => {
                            setIsQtManualDirty(true);
                            return { ...current, feedbackCoverage: event.target.value };
                          })
                        }
                        placeholder="Örn. 0,56"
                        type="text"
                        value={qtManualInputs.feedbackCoverage}
                      />
                    </InputField>
                    <InputField label="Verilen eğitim sayısı">
                      <input
                        className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
                        disabled={qtManualFormDisabled}
                        inputMode="numeric"
                        onChange={(event) =>
                          setQtManualInputs((current) => {
                            setIsQtManualDirty(true);
                            return { ...current, trainingCount: event.target.value };
                          })
                        }
                        placeholder="Örn. 4"
                        type="text"
                        value={qtManualInputs.trainingCount}
                      />
                    </InputField>
                    <InputField label="Katılınan toplantı sayısı">
                      <input
                        className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
                        disabled={qtManualFormDisabled}
                        inputMode="numeric"
                        onChange={(event) =>
                          setQtManualInputs((current) => {
                            setIsQtManualDirty(true);
                            return { ...current, meetingCount: event.target.value };
                          })
                        }
                        placeholder="Örn. 12"
                        type="text"
                        value={qtManualInputs.meetingCount}
                      />
                    </InputField>
                  </div>

                  {qtManualEntryQuery.isPending ? (
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Seçili QT kullanıcısının mevcut verileri yükleniyor...</p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {selectedQtTarget?.targetUserName
                        ? `${selectedQtTarget.targetUserName} için alanları boş bırakıp kaydetmek mevcut değeri kaldırır.`
                        : "Alanları boş bırakıp kaydetmek mevcut değeri kaldırır."}
                    </p>
                    <button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-slate-950 dark:bg-slate-700 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700/50"
                      disabled={!selectedPeriodId || qtManualFormDisabled || (isAdminUser && !selectedQtTarget)}
                      onClick={() => qtManualEntryMutation.mutate(qtManualInputs)}
                      type="button"
                    >
                      <Save size={15} />
                      {qtManualEntryMutation.isPending ? "Kaydediliyor..." : "QT değerlerini kaydet"}
                    </button>
                  </div>

                  {qtManualEntryMutation.isError ? (
                    <div className="mt-4 rounded-[10px] border border-rose-200 dark:border-rose-700/40 bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                      {qtManualEntryMutation.error instanceof Error
                        ? qtManualEntryMutation.error.message
                        : "QT değerleri kaydedilirken bir hata oluştu."}
                    </div>
                  ) : null}
                  {isAdminUser && qtTargetOptions.length === 0 ? (
                    <div className="mt-4 rounded-[10px] border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
                      Düzenlemek için önce Yönetim › Roller alanında en az bir kullanıcıyı `QT` veya `Kalite` rolüyle tanımlayın.
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                  QT kullanıcıları seçili döneme ait dinleme, değerlendirme ve geri bildirim sayılarını bu alandan manuel girer.
                </p>
              )}
            </SurfaceCard>

            <SurfaceCard
              description="Seçili döneme ait manuel QT girişleri burada listelenir."
              title="QT kullanıcı girişleri"
              variant="default"
            >
              {qtManualEntriesQuery.isError ? (
                <div className="rounded-[10px] border border-rose-200 dark:border-rose-700/40 bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                  {qtManualEntriesQuery.error instanceof Error
                    ? qtManualEntriesQuery.error.message
                    : "QT girişleri alınırken bir hata oluştu."}
                </div>
              ) : (
                <DataTable
                  columns={qtManualColumns}
                  data={qtManualEntriesQuery.data ?? []}
                  density="compact"
                  emptyState={
                    qtManualEntriesQuery.isPending
                      ? "QT girişleri yükleniyor..."
                      : "Seçili dönem için manuel QT girişi bulunmuyor."
                  }
                />
              )}
            </SurfaceCard>
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarSectionTitle(props: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{props.children}</p>;
}

function SidebarActionButton(props: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/30"
      onClick={props.onClick}
      type="button"
    >
      {props.icon}
      {props.children}
    </button>
  );
}

function HeaderPill(props: { children: ReactNode; tone?: "neutral" | "accent" | "success" }) {
  const tone = props.tone ?? "neutral";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "accent"
          ? "border-sky-200 dark:border-sky-700/40 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400"
          : tone === "success"
            ? "border-emerald-200 dark:border-emerald-700/40 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
            : "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 text-slate-600 dark:text-slate-400"
      ].join(" ")}
    >
      {props.children}
    </span>
  );
}

function InputField(props: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{props.label}</span>
      {props.children}
    </label>
  );
}
