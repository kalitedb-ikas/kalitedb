import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getTemplateContent,
  type AgentMetric,
  type AuditMetric,
  type DatasetType,
  type KpiMetricKey,
  type QtManualEntry,
  type QuestionPerformance,
  type UserRoleAssignment
} from "@kalitedb/shared";
import { StatCard, SurfaceCard } from "@kalitedb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  ClipboardCheck,
  FileDown,
  FileSpreadsheet,
  Headphones,
  LogOut,
  RefreshCw,
  Save,
  SearchCheck,
  Settings2,
  Trash2,
  Upload,
  UserPlus,
  Users
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DataTable } from "../components/data-table";
import { RecordEditor } from "../components/record-editor";
import { useAuth } from "../lib/auth";
import { api, type AuthenticatedUser } from "../lib/api";
import {
  formatAuditScore,
  formatNumber,
  formatPercent
} from "../lib/format";

const roleSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "team", "ceo", "qt"])
});

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "team", label: "Ekip" },
  { value: "ceo", label: "CEO" },
  { value: "qt", label: "QT" }
] as const;

const thresholdKeys = [
  "auditScore",
  "callEvaluationAverage",
  "localCloseRate",
  "avgTalkDurationSeconds",
  "feedbackCoverage"
] satisfies KpiMetricKey[];

const datasetLabels: Record<DatasetType, string> = {
  "agent-metrics": "Temsilci performansı",
  "audit-metrics": "Audit metrikleri",
  "question-performance": "Soru performansı",
  "qt-metrics": "QT"
};

const datasetDescriptions: Record<DatasetType, string> = {
  "agent-metrics": "Temsilci bazlı operasyon ve memnuniyet verilerini CSV ile içe aktarın, satır bazında düzenleyin ve CSAT özet kartları için manuel toplam girin.",
  "audit-metrics": "Audit skorları ve önceki doğruluk verilerini tek akışta yönetin.",
  "question-performance": "Soru doğru-yanlış verilerini ve doğruluk oranlarını içe aktarın.",
  "qt-metrics": "QT kullanıcıları verilerini Yönetim içindeki QT alanından manuel girer. Bu alanda seçili döneme ait girişleri takip edebilirsiniz."
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0");
  const label = new Intl.DateTimeFormat("tr-TR", { month: "long" }).format(new Date(`2026-${value}-01T00:00:00`));
  return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
});

type AdminSection = "periods" | DatasetType | "thresholds" | "roles";
type DatasetRow = AgentMetric | AuditMetric | QuestionPerformance;

type ImportPreviewResult = {
  errors: Array<{ row: number; field?: string; message: string }>;
  rowCount: number;
  previewRows: unknown[];
  committed: boolean;
};

const EMPTY_QT_MANUAL_INPUTS = {
  totalListeningHours: "",
  totalEvaluatedCallCount: "",
  totalEvaluatedChatMailCount: "",
  feedbackCount: "",
  feedbackCoverage: ""
};

const adminSections: Array<{
  id: AdminSection;
  label: string;
  description: string;
  icon: typeof CalendarRange;
}> = [
  {
    id: "periods",
    label: "Dönemler",
    description: "Ay seçimi ve yayın akışını yönet",
    icon: CalendarRange
  },
  {
    id: "agent-metrics",
    label: "Temsilci performansı",
    description: "CSV import ve tablo görünümü",
    icon: Users
  },
  {
    id: "audit-metrics",
    label: "Audit metrikleri",
    description: "CSV import ve tablo görünümü",
    icon: ClipboardCheck
  },
  {
    id: "question-performance",
    label: "Soru performansı",
    description: "CSV import ve tablo görünümü",
    icon: SearchCheck
  },
  {
    id: "qt-metrics",
    label: "QT",
    description: "Manuel giriş ve görünüm",
    icon: Headphones
  },
  {
    id: "thresholds",
    label: "Eşikler",
    description: "Renk ve hedef sınırlarını düzenle",
    icon: Settings2
  },
  {
    id: "roles",
    label: "Roller",
    description: "Kullanıcı yetkilerini yönet",
    icon: UserPlus
  }
];

function isDatasetSection(section: AdminSection): section is DatasetType {
  return section === "agent-metrics" || section === "audit-metrics" || section === "question-performance" || section === "qt-metrics";
}

function downloadCsvTemplate(datasetType: DatasetType) {
  const content = getTemplateContent(datasetType);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${datasetType}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeEmailValue(email: string) {
  return email.trim().toLocaleLowerCase("tr-TR");
}

function mapQtManualEntryToInputs(entry: QtManualEntry) {
  return {
    totalListeningHours: entry.totalListeningHours == null ? "" : String(entry.totalListeningHours),
    totalEvaluatedCallCount: entry.totalEvaluatedCallCount == null ? "" : String(entry.totalEvaluatedCallCount),
    totalEvaluatedChatMailCount: entry.totalEvaluatedChatMailCount == null ? "" : String(entry.totalEvaluatedChatMailCount),
    feedbackCount: entry.feedbackCount == null ? "" : String(entry.feedbackCount),
    feedbackCoverage: entry.feedbackCoverage == null ? "" : String(entry.feedbackCoverage)
  };
}

export function AdminPage(props: { currentUserRole?: AuthenticatedUser["role"] | undefined }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const isAdminUser = props.currentUserRole === "admin";
  const [selectedSection, setSelectedSection] = useState<AdminSection>(
    props.currentUserRole === "qt" ? "qt-metrics" : "periods"
  );
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonthValue, setSelectedMonthValue] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [selectedRecordId, setSelectedRecordId] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<DatasetType, File>>>({});
  const [lastImportDatasetType, setLastImportDatasetType] = useState<DatasetType | null>(null);
  const [selectedQtTargetEmail, setSelectedQtTargetEmail] = useState("");
  const [manualCsatInputs, setManualCsatInputs] = useState({
    totalCallCount: "",
    totalChatMailCount: "",
    totalTicketClosedCount: ""
  });
  const [editingRoleEmail, setEditingRoleEmail] = useState<string | null>(null);
  const [qtManualInputs, setQtManualInputs] = useState(EMPTY_QT_MANUAL_INPUTS);
  const [isQtManualDirty, setIsQtManualDirty] = useState(false);
  const [lastQtManualHydratedKey, setLastQtManualHydratedKey] = useState("");
  const qtSectionSelected = selectedSection === "qt-metrics";

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token)
  });

  const thresholdsQuery = useQuery({
    enabled: auth.token !== null && isAdminUser,
    queryKey: ["thresholds", auth.token],
    queryFn: () => api.getThresholds(auth.token)
  });

  const rolesQuery = useQuery({
    enabled: auth.token !== null && isAdminUser,
    queryKey: ["roles", auth.token],
    queryFn: () => api.getRoles(auth.token)
  });

  const periodDetailsQuery = useQuery({
    enabled: Boolean(selectedPeriodId) && !qtSectionSelected,
    queryKey: ["period-details", auth.token, selectedPeriodId],
    queryFn: () => api.getPeriodDetails(auth.token, selectedPeriodId)
  });

  useEffect(() => {
    setSelectedRecordId("");
  }, [selectedPeriodId, selectedSection]);

  const roleForm = useForm<z.infer<typeof roleSchema>>({
    resolver: zodResolver(roleSchema),
    defaultValues: { email: "", role: "team" }
  });

  const createPeriodMutation = useMutation({
    mutationFn: (values: { month: string; title: string; compareToPeriodId?: string }) =>
      api.createPeriod(auth.token, {
        month: values.month,
        title: values.title,
        compareToPeriodId: values.compareToPeriodId || undefined
      }),
    onSuccess: async (createdPeriod) => {
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      setSelectedPeriodId(createdPeriod.id);
      setSelectedYear(createdPeriod.month.slice(0, 4));
      setSelectedMonthValue(createdPeriod.month.slice(5, 7));
    }
  });

  const publishMutation = useMutation({
    mutationFn: (action: "publish" | "reopen") =>
      action === "publish"
        ? api.publishPeriod(auth.token, selectedPeriodId)
        : api.reopenPeriod(auth.token, selectedPeriodId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
    }
  });

  const importMutation = useMutation({
    mutationFn: async (input: { datasetType: DatasetType; commit: boolean }) => {
      const file = selectedFiles[input.datasetType];
      if (!file || !selectedPeriodId) {
        throw new Error("Dönem ve dosya seçin.");
      }

      return api.importDataset(auth.token, selectedPeriodId, input.datasetType, file, input.commit);
    },
    onSuccess: async (_, variables) => {
      setLastImportDatasetType(variables.datasetType);
      await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });

  const resetDatasetMutation = useMutation({
    mutationFn: async (datasetType: DatasetType) => {
      if (!selectedPeriodId) {
        throw new Error("Önce dönem seçin.");
      }

      return api.resetDataset(auth.token, selectedPeriodId, datasetType);
    },
    onSuccess: async () => {
      setSelectedRecordId("");
      setLastImportDatasetType(null);
      await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["periods", auth.token] });
    }
  });

  const roleMutation = useMutation({
    mutationFn: (values: z.infer<typeof roleSchema>) => api.createRole(auth.token, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      setEditingRoleEmail(null);
      roleForm.reset();
    }
  });

  const thresholdMutation = useMutation({
    mutationFn: () => {
      const current = thresholdsQuery.data;
      if (!current) {
        throw new Error("Eşik verisi bulunamadı.");
      }

      const payload = thresholdKeys.reduce<Record<KpiMetricKey, Partial<typeof current[KpiMetricKey]>>>(
        (accumulator, key) => {
          accumulator[key] = current[key];
          return accumulator;
        },
        {} as Record<KpiMetricKey, Partial<typeof current[KpiMetricKey]>>
      );

      return api.updateThresholds(auth.token, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["thresholds"] });
    }
  });

  const manualCsatMutation = useMutation({
    mutationFn: async (values: typeof manualCsatInputs) => {
      if (!selectedPeriodId) {
        throw new Error("Önce dönem seçin.");
      }

      return api.updatePeriod(auth.token, selectedPeriodId, {
        manualTotalCallCount: parseManualCountInput(values.totalCallCount),
        manualTotalChatMailCount: parseManualCountInput(values.totalChatMailCount),
        manualTotalTicketClosedCount: parseManualCountInput(values.totalTicketClosedCount)
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["periods"] }),
        queryClient.invalidateQueries({ queryKey: ["period-details"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    }
  });

  const activeDatasetType = isDatasetSection(selectedSection) ? selectedSection : null;
  const isQtSection = activeDatasetType === "qt-metrics";
  const canEditQtManualEntry = props.currentUserRole === "qt" || isAdminUser;
  const activePeriodMonth = `${selectedYear}-${selectedMonthValue}`;
  const selectedPeriod = useMemo(() => {
    const periods = periodsQuery.data ?? [];

    return (
      periods.find((period) => period.month === activePeriodMonth) ??
      periods.find((period) => period.id === selectedPeriodId)
    );
  }, [activePeriodMonth, periodsQuery.data, selectedPeriodId]);
  const manualCsatSourcePeriod = periodDetailsQuery.data?.period ?? selectedPeriod;

  useEffect(() => {
    setManualCsatInputs({
      totalCallCount: formatManualCountInput(manualCsatSourcePeriod?.manualTotalCallCount),
      totalChatMailCount: formatManualCountInput(manualCsatSourcePeriod?.manualTotalChatMailCount),
      totalTicketClosedCount: formatManualCountInput(manualCsatSourcePeriod?.manualTotalTicketClosedCount)
    });
  }, [
    manualCsatSourcePeriod?.id,
    manualCsatSourcePeriod?.manualTotalCallCount,
    manualCsatSourcePeriod?.manualTotalChatMailCount,
    manualCsatSourcePeriod?.manualTotalTicketClosedCount
  ]);

  useEffect(() => {
    if (props.currentUserRole === "qt" && selectedSection !== "qt-metrics") {
      setSelectedSection("qt-metrics");
    }
  }, [props.currentUserRole, selectedSection]);

  useEffect(() => {
    if (!isAdminUser && (selectedSection === "thresholds" || selectedSection === "roles")) {
      setSelectedSection(props.currentUserRole === "qt" ? "qt-metrics" : "periods");
    }
  }, [isAdminUser, props.currentUserRole, selectedSection]);

  const datasetRows = useMemo<DatasetRow[]>(() => {
    if (!periodDetailsQuery.data || !activeDatasetType) {
      return [];
    }

    if (activeDatasetType === "agent-metrics") {
      return periodDetailsQuery.data.datasets.agentMetrics;
    }

    if (activeDatasetType === "audit-metrics") {
      return periodDetailsQuery.data.datasets.auditMetrics;
    }

    if (activeDatasetType === "question-performance") {
      return periodDetailsQuery.data.datasets.questionPerformance;
    }

    return [];
  }, [periodDetailsQuery.data, activeDatasetType]);

  const selectedRecord = datasetRows.find((record) => record.id === selectedRecordId) ?? null;
  const importResult =
    activeDatasetType && lastImportDatasetType === activeDatasetType ? (importMutation.data as ImportPreviewResult | undefined) : undefined;
  const qtManualEntriesQuery = useQuery({
    enabled: Boolean(selectedPeriodId && isQtSection),
    queryKey: ["qt-manual-entries", auth.token, selectedPeriodId],
    queryFn: () => api.getQtManualEntries(auth.token, selectedPeriodId)
  });
  const qtTargetOptions = useMemo(() => {
    const options = new Map<string, { email: string; name: string; label: string }>();

    for (const assignment of rolesQuery.data ?? []) {
      if (assignment.role !== "qt") {
        continue;
      }

      const normalizedEmail = normalizeEmailValue(assignment.email);
      options.set(normalizedEmail, {
        email: normalizedEmail,
        name: normalizedEmail,
        label: normalizedEmail
      });
    }

    for (const entry of qtManualEntriesQuery.data ?? []) {
      const normalizedEmail = normalizeEmailValue(entry.userEmail);
      options.set(normalizedEmail, {
        email: normalizedEmail,
        name: entry.userName,
        label: entry.userName === normalizedEmail ? normalizedEmail : `${entry.userName} (${normalizedEmail})`
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
    enabled: Boolean(selectedPeriodId && canEditQtManualEntry && isQtSection && (!isAdminUser || selectedQtTarget?.targetUserEmail)),
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

      return api.updateQtManualEntry(auth.token, selectedPeriodId, {
        totalListeningHours: parseNullableDecimalInput(values.totalListeningHours),
        totalEvaluatedCallCount: parseNullableIntegerInput(values.totalEvaluatedCallCount),
        totalEvaluatedChatMailCount: parseNullableIntegerInput(values.totalEvaluatedChatMailCount),
        feedbackCount: parseNullableIntegerInput(values.feedbackCount),
        feedbackCoverage: parseNullableDecimalInput(values.feedbackCoverage)
      }, selectedQtTarget);
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
    if (!canEditQtManualEntry || !isQtSection) {
      return;
    }

    setQtManualInputs(EMPTY_QT_MANUAL_INPUTS);
    setIsQtManualDirty(false);
    setLastQtManualHydratedKey("");
  }, [canEditQtManualEntry, isQtSection, selectedPeriodId, selectedQtTarget?.targetUserEmail]);
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
    if (!isAdminUser || !isQtSection) {
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
  }, [isAdminUser, isQtSection, qtTargetOptions, selectedQtTargetEmail]);

  const visibleAdminSections = useMemo(
    () =>
      props.currentUserRole === "qt"
        ? adminSections.filter((section) => section.id === "qt-metrics")
        : adminSections.filter((section) => isAdminUser || (section.id !== "thresholds" && section.id !== "roles")),
    [isAdminUser, props.currentUserRole]
  );
  const visibleDatasetSections = useMemo(
    () =>
      props.currentUserRole === "qt"
        ? (["qt-metrics"] as DatasetType[])
        : (Object.keys(datasetLabels) as DatasetType[]),
    [props.currentUserRole]
  );
  const selectedSectionMeta = visibleAdminSections.find((section) => section.id === selectedSection) ?? visibleAdminSections[0]!;
  const availableYears = useMemo(
    () =>
      Array.from(new Set([String(new Date().getFullYear()), ...(periodsQuery.data ?? []).map((period) => period.month.slice(0, 4))])).sort(
        (left, right) => right.localeCompare(left)
      ),
    [periodsQuery.data]
  );
  const roleColumns = useMemo<ColumnDef<UserRoleAssignment>[]>(
    () => [
      { header: "E-posta", accessorKey: "email" },
      {
        header: "Rol",
        accessorKey: "role",
        cell: ({ row }) => {
          const value = row.original.role;
          return roleOptions.find((option) => option.value === value)?.label ?? value;
        }
      },
      {
        header: "İşlem",
        id: "action",
        cell: ({ row }) => (
          <button
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary/30 hover:text-primary"
            onClick={() => {
              setEditingRoleEmail(row.original.email);
              roleForm.reset({
                email: row.original.email,
                role: row.original.role
              });
            }}
            type="button"
          >
            Düzenle
          </button>
        )
      }
    ],
    [roleForm]
  );
  const currentStatusLabel = createPeriodMutation.isPending
    ? "Hazırlanıyor"
    : selectedPeriod?.status === "published"
      ? "Yayında"
      : "Taslak";
  const currentStatusTone = selectedPeriod?.status === "published" ? "success" : "neutral";
  const sectionBadgeLabel =
    selectedSection === "periods"
      ? "Genel"
      : activeDatasetType
        ? isQtSection
          ? "Manuel"
          : "CSV"
        : selectedSection === "thresholds"
          ? "Ayarlar"
          : "Yetki";
  const datasetCount =
    (periodDetailsQuery.data?.datasets.agentMetrics.length ?? 0) +
    (periodDetailsQuery.data?.datasets.auditMetrics.length ?? 0) +
    (periodDetailsQuery.data?.datasets.questionPerformance.length ?? 0);

  const handleResetDataset = () => {
    if (!activeDatasetType || !selectedPeriodId) {
      return;
    }

    const confirmed = window.confirm(
      `${formatPeriodChip(activePeriodMonth)} dönemi için ${datasetLabels[activeDatasetType]} verisini sıfırlamak istediğinize emin misiniz? Bu işlem seçili ayın mevcut kayıtlarını kaldırır.`
    );

    if (!confirmed) {
      return;
    }

    resetDatasetMutation.mutate(activeDatasetType);
  };

  const refreshCurrentView = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["periods", auth.token] }),
      queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] }),
      queryClient.invalidateQueries({ queryKey: ["qt-manual-entry", auth.token, selectedPeriodId] }),
      queryClient.invalidateQueries({ queryKey: ["qt-manual-entries", auth.token, selectedPeriodId] }),
      queryClient.invalidateQueries({ queryKey: ["thresholds", auth.token] }),
      queryClient.invalidateQueries({ queryKey: ["roles", auth.token] })
    ]);
  };

  useEffect(() => {
    if (!periodsQuery.data) {
      return;
    }

    const matchedPeriod = periodsQuery.data.find((period) => period.month === activePeriodMonth);

    if (matchedPeriod) {
      if (matchedPeriod.id !== selectedPeriodId) {
        setSelectedPeriodId(matchedPeriod.id);
      }
      return;
    }

    if (props.currentUserRole === "qt" || createPeriodMutation.isPending) {
      return;
    }

    if (createPeriodMutation.variables?.month === activePeriodMonth) {
      return;
    }

    const compareToPeriodId = periodsQuery.data
      .find((period) => period.month === getPreviousMonth(activePeriodMonth))
      ?.id;

    createPeriodMutation.mutate({
      month: activePeriodMonth,
      title: formatAutoPeriodTitle(activePeriodMonth),
      ...(compareToPeriodId ? { compareToPeriodId } : {})
    });
  }, [activePeriodMonth, createPeriodMutation, periodsQuery.data, props.currentUserRole, selectedPeriodId]);

  const datasetColumns = useMemo<ColumnDef<DatasetRow>[]>(() => {
    if (!activeDatasetType) {
      return [];
    }

    if (activeDatasetType === "agent-metrics") {
      return [
        {
          header: "Temsilci",
          accessorFn: (row) => (row as AgentMetric).agentName
        },
        {
          header: "Toplam görüşme",
          accessorFn: (row) => (row as AgentMetric).totalConversationCount,
          cell: ({ row }) => formatNumber((row.original as AgentMetric).totalConversationCount)
        },
        {
          header: "CSAT",
          accessorFn: (row) => (row as AgentMetric).callEvaluationAverage,
          cell: ({ row }) => formatNumber((row.original as AgentMetric).callEvaluationAverage, 3)
        },
        {
          header: "Lokal kapatma",
          accessorFn: (row) => (row as AgentMetric).localCloseRate,
          cell: ({ row }) => formatPercent((row.original as AgentMetric).localCloseRate, 0)
        },
        {
          header: "İşlem",
          id: "action",
          cell: ({ row }) => (
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary/30 hover:text-primary"
              onClick={() => setSelectedRecordId(row.original.id)}
              type="button"
            >
              Düzenle
            </button>
          )
        }
      ];
    }

    if (activeDatasetType === "audit-metrics") {
      return [
        {
          header: "Temsilci",
          accessorFn: (row) => (row as AuditMetric).agentName
        },
        {
          header: "Audit skoru",
          accessorFn: (row) => (row as AuditMetric).auditScore,
          cell: ({ row }) => formatAuditScore((row.original as AuditMetric).auditScore)
        },
        {
          header: "Önceki doğruluk",
          accessorFn: (row) => (row as AuditMetric).previousAuditAccuracy,
          cell: ({ row }) => formatAuditScore((row.original as AuditMetric).previousAuditAccuracy)
        },
        {
          header: "İşlem",
          id: "action",
          cell: ({ row }) => (
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary/30 hover:text-primary"
              onClick={() => setSelectedRecordId(row.original.id)}
              type="button"
            >
              Düzenle
            </button>
          )
        }
      ];
    }

    if (activeDatasetType === "question-performance") {
      return [
        {
          header: "Konu",
          accessorFn: (row) => (row as QuestionPerformance).topic
        },
        {
          header: "Soru",
          accessorFn: (row) => (row as QuestionPerformance).questionText,
          cell: ({ row }) => (
            <div className="max-w-[420px] whitespace-normal text-sm leading-6">
              {(row.original as QuestionPerformance).questionText}
            </div>
          )
        },
        {
          header: "Doğru",
          accessorFn: (row) => (row as QuestionPerformance).correctCount,
          cell: ({ row }) => formatNumber((row.original as QuestionPerformance).correctCount)
        },
        {
          header: "Yanlış",
          accessorFn: (row) => (row as QuestionPerformance).wrongCount,
          cell: ({ row }) => formatNumber((row.original as QuestionPerformance).wrongCount)
        },
        {
          header: "Doğruluk",
          accessorFn: (row) => (row as QuestionPerformance).accuracyRate,
          cell: ({ row }) => formatPercent((row.original as QuestionPerformance).accuracyRate)
        },
        {
          header: "İşlem",
          id: "action",
          cell: ({ row }) => (
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary/30 hover:text-primary"
              onClick={() => setSelectedRecordId(row.original.id)}
              type="button"
            >
              Düzenle
            </button>
          )
        }
      ];
    }

    return [];
  }, [activeDatasetType]);
  const qtManualColumns = useMemo<ColumnDef<QtManualEntry>[]>(() => {
    const columns: ColumnDef<QtManualEntry>[] = [
      {
        header: "QT",
        accessorFn: (row) => row.userName
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
      }
    ];

    if (isAdminUser) {
      columns.push({
        header: "İşlem",
        id: "action",
        cell: ({ row }) => (
          <button
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary/30 hover:text-primary"
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
  const qtManualFormDisabled = qtManualEntryQuery.isPending || qtManualEntryMutation.isPending;

  return (
    <div className="rounded-[38px] border border-sky-100/90 bg-[#edf6fb] p-5 shadow-[0_34px_90px_rgba(15,23,42,0.12)]">
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[30px] border border-slate-200/90 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-200/80 px-6 py-6">
            <p className="text-sm text-slate-500">{auth.user?.email ?? "Yerel yönetim erişimi"}</p>
          </div>

          <div className="border-b border-slate-200/80 px-6 py-6">
            <SidebarSectionTitle>Dönem</SidebarSectionTitle>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              <InputField label="Yıl">
                <select
                  className="h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-base font-medium text-slate-700 transition focus:border-sky-300 focus:outline-none"
                  onChange={(event) => setSelectedYear(event.target.value)}
                  value={selectedYear}
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </InputField>
              <InputField label="Ay">
                <select
                  className="h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-base font-medium text-slate-700 transition focus:border-sky-300 focus:outline-none"
                  onChange={(event) => setSelectedMonthValue(event.target.value)}
                  value={selectedMonthValue}
                >
                  {MONTH_OPTIONS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </InputField>
            </div>
          </div>

          <div className="border-b border-slate-200/80 px-6 py-6">
            <SidebarSectionTitle>Bölümler</SidebarSectionTitle>
            <div className="mt-5 space-y-2">
              {visibleAdminSections.map((section) => (
                <SidebarButton
                  active={selectedSection === section.id}
                  key={section.id}
                  label={section.label}
                  onClick={() => setSelectedSection(section.id)}
                />
              ))}
            </div>
          </div>

          <div className="border-b border-slate-200/80 px-6 py-6">
            <SidebarSectionTitle>Aksiyonlar</SidebarSectionTitle>
            <div className="mt-5 space-y-2">
              {selectedSection === "periods" ? (
                <SidebarActionButton
                  disabled={!selectedPeriodId}
                  icon={<Save size={15} />}
                  onClick={() =>
                    publishMutation.mutate(selectedPeriod?.status === "published" ? "reopen" : "publish")
                  }
                  primary
                >
                  {selectedPeriod?.status === "published" ? "Taslağa geri al" : "Şimdi kaydet"}
                </SidebarActionButton>
              ) : null}
              {selectedSection === "thresholds" ? (
                <SidebarActionButton icon={<Save size={15} />} onClick={() => thresholdMutation.mutate()} primary>
                  Eşikleri kaydet
                </SidebarActionButton>
              ) : null}
              <SidebarActionButton icon={<RefreshCw size={15} />} onClick={() => void refreshCurrentView()}>
                Veriyi yenile
              </SidebarActionButton>
            </div>
          </div>

          <div className="border-b border-slate-200/80 px-6 py-6">
            <SidebarSectionTitle>Veri Alanları</SidebarSectionTitle>
            <div className="mt-5 space-y-3">
              {visibleDatasetSections.map((datasetType) => (
                <ImportShortcutRow
                  active={activeDatasetType === datasetType}
                  key={datasetType}
                  label={datasetLabels[datasetType]}
                  onDownload={datasetType === "qt-metrics" ? undefined : () => downloadCsvTemplate(datasetType)}
                  onOpen={() => setSelectedSection(datasetType)}
                />
              ))}
            </div>
          </div>

          <div className="px-6 py-6">
            <button
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
              onClick={() => void auth.logout()}
              type="button"
            >
              <LogOut size={16} />
              Çıkış Yap
            </button>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="rounded-[28px] border border-slate-200/90 bg-white px-8 py-8 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap gap-2">
              <HeaderPill>{selectedSectionMeta.label}</HeaderPill>
              <HeaderPill tone="accent">{formatPeriodChip(activePeriodMonth)}</HeaderPill>
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              Veri Yönetim Paneli
            </h1>
          </section>

          <section className="rounded-[24px] border border-slate-200/90 bg-white px-6 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <HeaderPill tone="success">{activeDatasetType ? (isQtSection ? "Manuel giriş" : "CSV Sync") : "Hazır"}</HeaderPill>
              <HeaderPill tone={currentStatusTone}>{currentStatusLabel}</HeaderPill>
              <span>Dönem: {activePeriodMonth}</span>
            </div>
          </section>

          <section className="rounded-[26px] border border-slate-200/90 bg-white px-6 py-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center gap-3">
              <HeaderPill>{sectionBadgeLabel}</HeaderPill>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-slate-950">{selectedSectionMeta.label}</h2>
            </div>
            <p className="mt-3 text-base leading-7 text-slate-600">{selectedSectionMeta.description}</p>
          </section>

          <div className="space-y-6">
            {selectedSection === "periods" ? (
              <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
                <SurfaceCard
                  description="Ay seçtiğiniz anda dönem yoksa sistem bu ay için taslak kaydı otomatik açar."
                  title="Dönem Özeti"
                  variant="default"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <StatCard compact label="Seçili ay" value={formatPeriodChip(activePeriodMonth)} />
                    <StatCard compact label="Durum" value={currentStatusLabel} />
                    <StatCard compact label="Dönem başlığı" value={selectedPeriod?.title ?? formatAutoPeriodTitle(activePeriodMonth)} />
                    <StatCard compact label="Karşılaştırma dönemi" value={selectedPeriod?.compareToPeriodId ? "Bağlı" : "Yok"} />
                  </div>
                </SurfaceCard>

                <SurfaceCard
                  description="Seçili döneme ait mevcut veri akışını özetler."
                  title="Dönem Metrikleri"
                  variant="default"
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <StatCard compact label="Dataset sayısı" value={formatNumber(datasetCount)} />
                    <StatCard compact label="Import kaydı" value={formatNumber(periodDetailsQuery.data?.importJobs.length ?? 0)} />
                    <StatCard compact label="Hazırlık durumu" value={createPeriodMutation.isPending ? "Oluşturuluyor" : "Hazır"} />
                  </div>
                </SurfaceCard>

                <SurfaceCard
                  className="xl:col-span-2"
                  description="Seçili dönem için en son alınan import kayıtları."
                  title="Son Importlar"
                  variant="default"
                >
                  {(periodDetailsQuery.data?.importJobs ?? []).length > 0 ? (
                    <div className="space-y-2">
                      {periodDetailsQuery.data?.importJobs.slice(0, 6).map((job) => (
                        <div
                          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                          key={job.id}
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{datasetLabels[job.datasetType]}</p>
                            <p className="text-xs text-slate-500">
                              {job.uploadedBy} • {job.uploadedAt.slice(0, 10)}
                            </p>
                          </div>
                          <div className="text-right text-xs text-slate-500">
                            <p>{formatNumber(job.rowCount)} satır</p>
                            <p>{formatNumber(job.errorCount)} hata</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyBlock message="Seçili dönem için import kaydı bulunmuyor." />
                  )}
                </SurfaceCard>
              </div>
            ) : null}

            {activeDatasetType ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <StatCard compact label="Seçili dönem" value={selectedPeriod?.title ?? formatAutoPeriodTitle(activePeriodMonth)} />
                  <StatCard
                    compact
                    label={isQtSection ? "QT girişi" : "Kayıt sayısı"}
                    value={formatNumber(isQtSection ? (qtManualEntriesQuery.data?.length ?? 0) : datasetRows.length)}
                  />
                  <StatCard
                    compact
                    label={isQtSection ? "Giriş yöntemi" : "Seçili dosya"}
                    value={isQtSection ? "Manuel" : (selectedFiles[activeDatasetType]?.name ?? "Dosya seçilmedi")}
                  />
                </div>

                {!isQtSection ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-rose-200 bg-rose-50/70 px-5 py-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-900">Seçili ay verisini sıfırla</p>
                      <p className="text-sm text-rose-700">
                        {datasetLabels[activeDatasetType]} için {formatPeriodChip(activePeriodMonth)} dönemindeki mevcut kayıtları temizler.
                      </p>
                    </div>
                    <button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!selectedPeriodId || resetDatasetMutation.isPending}
                      onClick={handleResetDataset}
                      type="button"
                    >
                      <Trash2 size={15} />
                      {resetDatasetMutation.isPending ? "Sıfırlanıyor..." : "Bu ayın verisini sıfırla"}
                    </button>
                  </div>
                ) : null}

                {!isQtSection && resetDatasetMutation.isError ? (
                  <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {resetDatasetMutation.error instanceof Error
                      ? resetDatasetMutation.error.message
                      : "Veri sıfırlanırken bir hata oluştu."}
                  </div>
                ) : null}

                {activeDatasetType === "agent-metrics" ? (
                  <SurfaceCard
                    description="CSV import olmadan CSAT üst kartlarındaki toplam çağrı, chat / e-posta ve ticket sayılarını buradan girin. Boş bırakıp kaydederseniz sistem satır toplamlarını kullanır."
                    title="CSAT kartları için manuel giriş"
                    variant="default"
                  >
                    <div className="grid gap-4 md:grid-cols-3">
                      <InputField label="Toplam çağrı">
                        <input
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
                          inputMode="numeric"
                          onChange={(event) =>
                            setManualCsatInputs((current) => ({
                              ...current,
                              totalCallCount: normalizeManualCountInput(event.target.value)
                            }))
                          }
                          placeholder="Örn. 8.949"
                          type="text"
                          value={manualCsatInputs.totalCallCount}
                        />
                      </InputField>
                      <InputField label="Chat / e-posta">
                        <input
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
                          inputMode="numeric"
                          onChange={(event) =>
                            setManualCsatInputs((current) => ({
                              ...current,
                              totalChatMailCount: normalizeManualCountInput(event.target.value)
                            }))
                          }
                          placeholder="Örn. 14.731"
                          type="text"
                          value={manualCsatInputs.totalChatMailCount}
                        />
                      </InputField>
                      <InputField label="Ticket adedi">
                        <input
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
                          inputMode="numeric"
                          onChange={(event) =>
                            setManualCsatInputs((current) => ({
                              ...current,
                              totalTicketClosedCount: normalizeManualCountInput(event.target.value)
                            }))
                          }
                          placeholder="Örn. 102"
                          type="text"
                          value={manualCsatInputs.totalTicketClosedCount}
                        />
                      </InputField>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-500">
                        Alanı boş bırakıp kaydetmek manuel değeri kaldırır.
                      </p>
                      <button
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        disabled={!selectedPeriodId || manualCsatMutation.isPending}
                        onClick={() => manualCsatMutation.mutate(manualCsatInputs)}
                        type="button"
                      >
                        <Save size={15} />
                        {manualCsatMutation.isPending ? "Kaydediliyor..." : "Manuel değerleri kaydet"}
                      </button>
                    </div>

                    {manualCsatMutation.isError ? (
                      <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {manualCsatMutation.error instanceof Error
                          ? manualCsatMutation.error.message
                          : "Manuel değerler kaydedilirken bir hata oluştu."}
                      </div>
                    ) : null}
                  </SurfaceCard>
                ) : null}

                {isQtSection ? (
                  <div className="grid gap-6 xl:grid-cols-[0.84fr_1.16fr]">
                    <SurfaceCard
                      description={datasetDescriptions[activeDatasetType]}
                      title={canEditQtManualEntry ? "QT manuel girişi" : "QT veri akışı"}
                      variant="default"
                    >
                      {canEditQtManualEntry ? (
                        <>
                          {isAdminUser ? (
                            <div className="mb-4 space-y-3">
                              <InputField label="QT kullanıcısı">
                                <select
                                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
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
                              <p className="text-sm text-slate-500">
                                Admin olarak seçtiğiniz QT kullanıcısı adına manuel veri girebilirsiniz.
                              </p>
                            </div>
                          ) : null}

                          <div className="grid gap-4 md:grid-cols-2">
                            <InputField label="Toplam dinleme süresi (saat)">
                              <input
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
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
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
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
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
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
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
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
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
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
                          </div>

                          {qtManualEntryQuery.isPending ? (
                            <p className="mt-4 text-sm text-slate-500">Seçili QT kullanıcısının mevcut verileri yükleniyor...</p>
                          ) : null}

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-slate-500">
                              {selectedQtTarget?.targetUserName
                                ? `${selectedQtTarget.targetUserName} için alanları boş bırakıp kaydetmek mevcut değeri kaldırır.`
                                : "Alanları boş bırakıp kaydetmek mevcut değeri kaldırır."}
                            </p>
                            <button
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                              disabled={!selectedPeriodId || qtManualFormDisabled || (isAdminUser && !selectedQtTarget)}
                              onClick={() => qtManualEntryMutation.mutate(qtManualInputs)}
                              type="button"
                            >
                              <Save size={15} />
                              {qtManualEntryMutation.isPending ? "Kaydediliyor..." : "QT değerlerini kaydet"}
                            </button>
                          </div>

                          {qtManualEntryMutation.isError ? (
                            <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                              {qtManualEntryMutation.error instanceof Error
                                ? qtManualEntryMutation.error.message
                                : "QT değerleri kaydedilirken bir hata oluştu."}
                            </div>
                          ) : null}
                          {isAdminUser && qtTargetOptions.length === 0 ? (
                            <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                              Düzenlemek için önce Roller alanında en az bir kullanıcıyı `QT` rolüyle tanımlayın.
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <StatCard compact label="QT kullanıcısı" value={formatNumber(qtManualEntriesQuery.data?.length ?? 0)} />
                            <StatCard compact label="Giriş türü" value="Manuel" />
                            <StatCard
                              compact
                              label="Durum"
                              value={qtManualEntriesQuery.isPending ? "Yükleniyor" : qtManualEntriesQuery.isError ? "Hata" : "Hazır"}
                            />
                            <StatCard compact label="CSV" value="Kapalı" />
                          </div>
                          <p className="mt-4 text-sm leading-6 text-slate-500">
                            QT kullanıcıları seçili döneme ait dinleme, değerlendirme ve geri bildirim sayılarını bu alandan manuel girer.
                          </p>
                        </>
                      )}
                    </SurfaceCard>

                    <SurfaceCard
                      description="Seçili döneme ait manuel QT girişleri burada listelenir."
                      title="QT kullanıcı girişleri"
                      variant="default"
                    >
                      {qtManualEntriesQuery.isError ? (
                        <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
                ) : (
                  <>
                    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                      <SurfaceCard
                        description={datasetDescriptions[activeDatasetType]}
                        title="CSV ile İçe Aktar"
                        variant="default"
                      >
                        <div className="space-y-4">
                          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-slate-300 bg-slate-50/70 px-4 text-center transition hover:border-primary/40 hover:bg-sky-50/50">
                            <FileSpreadsheet className="h-5 w-5 text-slate-500" />
                            <span className="text-sm font-semibold text-slate-700">CSV dosyası seçin</span>
                            <span className="text-xs text-slate-500">
                              {selectedFiles[activeDatasetType]?.name ?? "Henüz dosya seçilmedi"}
                            </span>
                            <input
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                  setSelectedFiles((current) => ({ ...current, [activeDatasetType]: file }));
                                }
                              }}
                              type="file"
                            />
                          </label>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <button
                              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-primary/30 hover:text-primary"
                              onClick={() => importMutation.mutate({ datasetType: activeDatasetType, commit: false })}
                              type="button"
                            >
                              Ön izleme
                            </button>
                            <button
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                              onClick={() => importMutation.mutate({ datasetType: activeDatasetType, commit: true })}
                              type="button"
                            >
                              <Upload size={15} />
                              CSV içe aktar
                            </button>
                          </div>

                          {importMutation.isError ? (
                            <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                              {importMutation.error instanceof Error ? importMutation.error.message : "CSV işlemi sırasında bir hata oluştu."}
                            </div>
                          ) : null}

                          {importResult ? (
                            <div className="space-y-4">
                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <StatCard compact label="Toplam satır" value={formatNumber(importResult.rowCount)} />
                                <StatCard compact label="Ön izleme satırı" value={formatNumber(importResult.previewRows.length)} />
                                <StatCard compact label="Hata" value={formatNumber(importResult.errors.length)} />
                                <StatCard compact label="Durum" value={importResult.committed ? "İçe aktarıldı" : "Ön izleme"} />
                              </div>

                              {importResult.errors.length > 0 ? (
                                <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4">
                                  <p className="text-sm font-semibold text-amber-800">CSV hata özeti</p>
                                  <div className="mt-3 space-y-2">
                                    {importResult.errors.slice(0, 5).map((error, index) => (
                                      <div className="text-sm text-amber-700" key={`${error.row}-${index}`}>
                                        Satır {error.row}
                                        {error.field ? ` • ${error.field}` : ""}: {error.message}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </SurfaceCard>

                      <SurfaceCard
                        description="Mevcut kayıtları okuyun ve düzenlemek istediğiniz satırı seçin."
                        title="Mevcut Kayıtlar"
                        variant="default"
                      >
                        <DataTable
                          columns={datasetColumns}
                          data={datasetRows}
                          density="compact"
                          emptyState="Kayıt bulunmuyor. CSV ile veri aktararak başlayabilirsiniz."
                        />
                      </SurfaceCard>
                    </div>

                    <RecordEditor
                      onSave={async (updates) => {
                        if (!selectedPeriodId || !selectedRecord || !activeDatasetType) {
                          return;
                        }

                        await api.updatePeriod(auth.token, selectedPeriodId, {
                          datasetType: activeDatasetType,
                          recordId: selectedRecord.id,
                          updates
                        });
                        await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
                      }}
                      record={selectedRecord as Record<string, string | number | null> | null}
                      title="Kayıt Düzenleyici"
                    />
                  </>
                )}
              </div>
            ) : null}

            {selectedSection === "thresholds" ? (
              <div className="space-y-4">
                {thresholdKeys.map((key) => {
                  const threshold = thresholdsQuery.data?.[key];
                  if (!threshold) {
                    return null;
                  }

                  return (
                    <SurfaceCard
                      description="Kırmızı, sarı ve yeşil sınırlarını bu alandan güncelleyin."
                      key={key}
                      title={threshold.label}
                      variant="default"
                    >
                      <div className="grid gap-4 md:grid-cols-3">
                        {(["red", "yellow", "green"] as const).map((band) => (
                          <InputField
                            key={band}
                            label={band === "red" ? "Kırmızı" : band === "yellow" ? "Sarı" : "Yeşil"}
                          >
                            <input
                              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
                              onChange={(event) =>
                                queryClient.setQueryData(["thresholds", auth.token], (current: typeof thresholdsQuery.data) =>
                                  current
                                    ? {
                                        ...current,
                                        [key]: { ...current[key], [band]: Number(event.target.value) }
                                      }
                                    : current
                                )
                              }
                              type="number"
                              value={threshold[band]}
                            />
                          </InputField>
                        ))}
                      </div>
                    </SurfaceCard>
                  );
                })}
              </div>
            ) : null}

            {selectedSection === "roles" ? (
              <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
                <SurfaceCard
                  description={
                    editingRoleEmail
                      ? "Seçtiğiniz kullanıcının rolünü güncelleyin. Düzenleme modunda e-posta sabit tutulur."
                      : "Yeni kullanıcıya erişim rolü tanımlayın."
                  }
                  title={editingRoleEmail ? "Rol Güncelle" : "Rol Ekle"}
                  variant="default"
                >
                  <form className="grid gap-4" onSubmit={roleForm.handleSubmit((values) => roleMutation.mutate(values))}>
                    {editingRoleEmail ? (
                      <div className="rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                        <span className="font-semibold">{editingRoleEmail}</span> için düzenleme modundasınız.
                      </div>
                    ) : null}
                    <InputField label="E-posta">
                      <input
                        className={[
                          "h-11 w-full rounded-2xl border px-3.5 text-sm transition focus:border-primary/40 focus:outline-none",
                          editingRoleEmail
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                            : "border-slate-200 bg-white text-slate-700"
                        ].join(" ")}
                        disabled={Boolean(editingRoleEmail)}
                        {...roleForm.register("email")}
                      />
                    </InputField>
                    <InputField label="Rol">
                      <select
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 transition focus:border-primary/40 focus:outline-none"
                        {...roleForm.register("role")}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </InputField>
                    {(roleForm.formState.errors.email || roleForm.formState.errors.role) ? (
                      <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {roleForm.formState.errors.email?.message ?? roleForm.formState.errors.role?.message}
                      </div>
                    ) : null}
                    {roleMutation.isError ? (
                      <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {roleMutation.error instanceof Error ? roleMutation.error.message : "Rol kaydedilirken bir hata oluştu."}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        disabled={roleMutation.isPending}
                        type="submit"
                      >
                        {roleMutation.isPending
                          ? "Kaydediliyor..."
                          : editingRoleEmail
                            ? "Rolü güncelle"
                            : "Rol ekle"}
                      </button>
                      {editingRoleEmail ? (
                        <button
                          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={() => {
                            setEditingRoleEmail(null);
                            roleForm.reset({ email: "", role: "team" });
                          }}
                          type="button"
                        >
                          Vazgeç
                        </button>
                      ) : null}
                    </div>
                  </form>
                </SurfaceCard>

                <SurfaceCard
                  description="Tanımlı roller tablo halinde listelenir. Düzenlemek için satırdaki aksiyonu kullanın."
                  title="Rol Listesi"
                  variant="default"
                >
                  <DataTable columns={roleColumns} data={rolesQuery.data ?? []} density="compact" />
                </SurfaceCard>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "w-full rounded-[18px] border px-4 py-3 text-left text-sm font-semibold transition",
        props.active
          ? "border-[#2f6b7a] bg-[#2f6b7a] text-white shadow-[0_16px_34px_rgba(47,107,122,0.22)]"
          : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
      ].join(" ")}
      onClick={props.onClick}
      type="button"
    >
      {props.label}
    </button>
  );
}

function SidebarSectionTitle(props: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{props.children}</p>;
}

function SidebarActionButton(props: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  primary?: boolean | undefined;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      className={[
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
        props.primary
          ? "bg-[#2f6b7a] text-white shadow-[0_14px_28px_rgba(47,107,122,0.18)] hover:bg-[#285d6a]"
          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
        props.disabled ? "cursor-not-allowed opacity-50" : ""
      ].join(" ")}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.icon}
      {props.children}
    </button>
  );
}

function ImportShortcutRow(props: {
  label: string;
  active: boolean;
  onOpen: () => void;
  onDownload?: (() => void) | undefined;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-3 rounded-[20px] border px-4 py-3 transition",
        props.active ? "border-sky-200 bg-sky-50/70" : "border-slate-200 bg-white"
      ].join(" ")}
    >
      <button
        className="min-w-0 flex-1 text-left text-sm font-medium text-slate-700 transition hover:text-slate-950"
        onClick={props.onOpen}
        type="button"
      >
        {props.label}
      </button>
      {props.onDownload ? (
        <button
          className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          onClick={props.onDownload}
          type="button"
        >
          <FileDown size={15} />
        </button>
      ) : null}
    </div>
  );
}

function HeaderPill(props: { children: ReactNode; tone?: "neutral" | "accent" | "success" }) {
  const tone = props.tone ?? "neutral";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "accent"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-50 text-slate-600"
      ].join(" ")}
    >
      {props.children}
    </span>
  );
}

function InputField(props: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-700">{props.label}</span>
      {props.children}
    </label>
  );
}

function EmptyBlock(props: { message: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
      {props.message}
    </div>
  );
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

function formatAutoPeriodTitle(period: string) {
  const [year] = period.split("-");
  return `Customer Success ${formatLongMonth(period)} ${year} CSAT Raporu`;
}

function formatManualCountInput(value: number | null | undefined) {
  return value == null ? "" : formatNumber(value);
}

function normalizeManualCountInput(value: string) {
  return value.replace(/[^\d.,\s]/g, "");
}

function parseManualCountInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");

  if (!digits) {
    return null;
  }

  return Number(digits);
}

function parseNullableIntegerInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }
  return Number(digits);
}

function parseNullableDecimalInput(value: string) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPreviousMonth(period: string) {
  const [yearPart, monthPart] = period.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return period;
  }

  const date = new Date(year, month - 2, 1);
  const previousYear = String(date.getFullYear());
  const previousMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${previousYear}-${previousMonth}`;
}
