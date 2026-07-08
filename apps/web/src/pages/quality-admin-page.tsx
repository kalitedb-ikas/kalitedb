import type { ColumnDef } from "@tanstack/react-table";
import type { QtManualEntry } from "@kalitedb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Headphones, LogOut, RefreshCw, Save, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminShell, AdminShellHeader, AdminShellSidebar, type AdminNavGroup } from "../components/admin-shell";
import { AdminButton, AdminCard, ADMIN_INPUT, Banner, ErrorBanner, HeaderPill, InputField } from "../components/admin-ui";
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

  const isAdminUser = props.currentUserRole === "admin";
  const canEditQtManualEntry =
    props.currentUserRole === "qt" ||
    props.currentUserRole === "quality" ||
    isAdminUser;

  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonthValue, setSelectedMonthValue] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [activeView, setActiveView] = useState<"entry" | "list">("entry");
  const [sidebarQuery, setSidebarQuery] = useState("");
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
      if (assignment.role !== "qt" && assignment.role !== "quality" && assignment.role !== "admin") {
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
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[var(--adm-accent-border)] hover:text-[var(--adm-accent-text)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
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

  const viewMeta = {
    entry: { label: "QT Manuel Giriş", description: "Seçili dönem için QT kullanıcısı adına dinleme, değerlendirme ve geri bildirim değerlerini girin." },
    list: { label: "QT Kullanıcı Girişleri", description: "Seçili döneme ait tüm QT kullanıcılarının manuel giriş verileri." }
  } as const;
  const activeViewMeta = viewMeta[activeView];

  const navGroups: AdminNavGroup[] = [
    {
      id: "qt",
      label: "QT Metrikleri",
      items: [
        {
          id: "entry",
          label: viewMeta.entry.label,
          description: viewMeta.entry.description,
          icon: <Headphones size={14} />,
          active: activeView === "entry",
          onClick: () => setActiveView("entry")
        },
        {
          id: "list",
          label: viewMeta.list.label,
          description: viewMeta.list.description,
          icon: <Users size={14} />,
          active: activeView === "list",
          onClick: () => setActiveView("list")
        }
      ]
    }
  ];

  return (
    <AdminShell
      accent="quality"
      sidebar={
        <AdminShellSidebar
          title="Yönetim Paneli"
          subtitle="Kalite · QT Metrikleri"
          header={
            <div className="space-y-3">
              <p className="truncate text-xs font-medium text-slate-400">
                {auth.user?.email ?? "Yerel yönetim erişimi"}
              </p>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Dönem</p>
                <div className="grid grid-cols-2 gap-2">
                  <FancySelect
                    size="md"
                    className="w-full"
                    panelWidthClass="w-36"
                    options={availableYears.map((year) => ({ value: year, label: year }))}
                    value={selectedYear}
                    onChange={setSelectedYear}
                    placeholder="Yıl"
                  />
                  <FancySelect
                    size="md"
                    className="w-full"
                    panelWidthClass="w-40"
                    options={MONTH_OPTIONS.map((month) => ({ value: month.value, label: month.label }))}
                    value={selectedMonthValue}
                    onChange={setSelectedMonthValue}
                    placeholder="Ay"
                  />
                </div>
              </div>
            </div>
          }
          search={{ value: sidebarQuery, onChange: setSidebarQuery, placeholder: "Bölüm ara..." }}
          groups={navGroups}
          footer={
            <button
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-white"
              onClick={() => void auth.logout()}
              type="button"
            >
              <LogOut size={15} />
              Çıkış Yap
            </button>
          }
        />
      }
    >
      <AdminShellHeader
        breadcrumb={<span>Yönetim · Kalite</span>}
        title={activeViewMeta.label}
        description={activeViewMeta.description}
        pills={
          <>
            <HeaderPill tone="accent">{formatPeriodChip(activePeriodMonth)}</HeaderPill>
            <HeaderPill tone="success">
              <span className="inline-flex items-center gap-1.5">
                <Headphones size={12} /> Kalite Ekibi
              </span>
            </HeaderPill>
          </>
        }
        actions={
          <AdminButton icon={<RefreshCw size={14} />} onClick={() => void refreshCurrentView()}>
            Yenile
          </AdminButton>
        }
      />

      <div className="space-y-6">
        {activeView === "entry" ? (
            <AdminCard
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
                          className={ADMIN_INPUT}
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
                        className={ADMIN_INPUT}
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
                        className={ADMIN_INPUT}
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
                        className={ADMIN_INPUT}
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
                        className={ADMIN_INPUT}
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
                        className={ADMIN_INPUT}
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
                        className={ADMIN_INPUT}
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
                        className={ADMIN_INPUT}
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
                    <AdminButton
                      icon={<Save size={15} />}
                      variant="primary"
                      size="lg"
                      disabled={!selectedPeriodId || qtManualFormDisabled || (isAdminUser && !selectedQtTarget)}
                      onClick={() => qtManualEntryMutation.mutate(qtManualInputs)}
                    >
                      {qtManualEntryMutation.isPending ? "Kaydediliyor..." : "QT değerlerini kaydet"}
                    </AdminButton>
                  </div>

                  {qtManualEntryMutation.isError ? (
                    <div className="mt-4">
                      <ErrorBanner
                        message={
                          qtManualEntryMutation.error instanceof Error
                            ? qtManualEntryMutation.error.message
                            : "QT değerleri kaydedilirken bir hata oluştu."
                        }
                      />
                    </div>
                  ) : null}
                  {isAdminUser && qtTargetOptions.length === 0 ? (
                    <div className="mt-4">
                      <Banner tone="warning">
                        Düzenlemek için önce Yönetim › Roller alanında en az bir kullanıcıyı `QT` veya `Kalite` rolüyle tanımlayın.
                      </Banner>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                  QT kullanıcıları seçili döneme ait dinleme, değerlendirme ve geri bildirim sayılarını bu alandan manuel girer.
                </p>
              )}
            </AdminCard>
        ) : (
            <AdminCard
              description="Seçili döneme ait manuel QT girişleri burada listelenir."
              title="QT kullanıcı girişleri"
              variant="default"
            >
              {qtManualEntriesQuery.isError ? (
                <ErrorBanner
                  message={
                    qtManualEntriesQuery.error instanceof Error
                      ? qtManualEntriesQuery.error.message
                      : "QT girişleri alınırken bir hata oluştu."
                  }
                />
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
            </AdminCard>
        )}
      </div>
    </AdminShell>
  );
}

