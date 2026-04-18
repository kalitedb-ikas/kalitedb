import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getTemplateContent,
  parseDatasetCsv,
  type AgentMetric,
  type AuditMetric,
  type DatasetType,
  type KpiMetricKey,
  type QuestionPerformance,
  type Representative,
  type UserRoleAssignment
} from "@kalitedb/shared";
import { collection, doc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { SurfaceCard } from "@kalitedb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  ClipboardCheck,
  FileDown,
  FileSpreadsheet,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  SearchCheck,
  Settings2,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DataTable } from "../components/data-table";
import { FancySelect } from "../components/fancy-select";
import { RecordEditor } from "../components/record-editor";
import { RepresentativeDetailModal, BadgePill } from "../components/representative-detail-modal";
import { useAuth } from "../lib/auth";
import { api, type AuthenticatedUser } from "../lib/api";
import { firebaseDb } from "../lib/firebase";
import {
  formatAuditScore,
  formatNumber,
  formatPercent
} from "../lib/format";

const roleSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "team_leader", "quality", "representative", "viewer", "team", "ceo", "qt"]),
  departments: z.array(z.enum(["cs", "sales", "quality", "partner"]))
});

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Yönetici" },
  { value: "team_leader", label: "Takım Lideri" },
  { value: "quality", label: "Kalite" },
  { value: "representative", label: "Temsilci" },
  { value: "viewer", label: "Görüntüleyici" },
  { value: "team", label: "Ekip (eski)" },
  { value: "ceo", label: "CEO (eski)" },
  { value: "qt", label: "QT (eski)" }
] as const;

const thresholdKeys = [
  "auditScore",
  "callEvaluationAverage",
  "localCloseRate",
  "avgTalkDurationSeconds",
  "feedbackCoverage"
] satisfies KpiMetricKey[];

type VisibleDatasetType = Exclude<DatasetType, "qt-metrics">;

const datasetLabels: Record<VisibleDatasetType, string> = {
  "agent-metrics": "Temsilci performansı",
  "audit-metrics": "Audit metrikleri",
  "question-performance": "Soru performansı"
};

const datasetDescriptions: Record<VisibleDatasetType, string> = {
  "agent-metrics": "Temsilci bazlı operasyon ve memnuniyet verilerini CSV ile içe aktarın, satır bazında düzenleyin ve CSAT özet kartları için manuel toplam girin.",
  "audit-metrics": "Audit skorları ve önceki doğruluk verilerini tek akışta yönetin.",
  "question-performance": "Soru doğru-yanlış verilerini ve doğruluk oranlarını içe aktarın."
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0");
  const label = new Intl.DateTimeFormat("tr-TR", { month: "long" }).format(new Date(`2026-${value}-01T00:00:00`));
  return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
});

type AdminSection = "periods" | VisibleDatasetType | "thresholds" | "roles" | "representatives";
type DatasetRow = AgentMetric | AuditMetric | QuestionPerformance;

type ImportPreviewResult = {
  errors: Array<{ row: number; field?: string; message: string }>;
  rowCount: number;
  previewRows: unknown[];
  committed: boolean;
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
  },
  {
    id: "representatives",
    label: "Temsilciler",
    description: "Temsilci durumlarını yönet",
    icon: UserCheck
  }
];

function isDatasetSection(section: AdminSection): section is VisibleDatasetType {
  return section === "agent-metrics" || section === "audit-metrics" || section === "question-performance";
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

export function AdminPage(props: { currentUserRole?: AuthenticatedUser["role"] | undefined }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const isAdminUser = true;
  const [selectedSection, setSelectedSection] = useState<AdminSection>("periods");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonthValue, setSelectedMonthValue] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [selectedRecordId, setSelectedRecordId] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<VisibleDatasetType, File>>>({});
  const [lastImportDatasetType, setLastImportDatasetType] = useState<VisibleDatasetType | null>(null);
  const [manualCsatInputs, setManualCsatInputs] = useState({
    totalCallCount: "",
    totalChatMailCount: "",
    totalTicketClosedCount: ""
  });
  const [editingRoleEmail, setEditingRoleEmail] = useState<string | null>(null);
  const [repDepartmentFilter, setRepDepartmentFilter] = useState<"all" | "cs" | "sales">("all");
  const [repStatusFilter, setRepStatusFilter] = useState<"all" | "active" | "departed" | "department_changed">("all");

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    select: (periods) => periods.filter((period) => (period.department ?? "cs") === "cs")
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

  const representativesQuery = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token)
  });

  const periodDetailsQuery = useQuery({
    enabled: Boolean(selectedPeriodId),
    queryKey: ["period-details", auth.token, selectedPeriodId],
    queryFn: () => api.getPeriodDetails(auth.token, selectedPeriodId)
  });

  useEffect(() => {
    setSelectedRecordId("");
  }, [selectedPeriodId, selectedSection]);

  const roleForm = useForm<z.infer<typeof roleSchema>>({
    resolver: zodResolver(roleSchema),
    defaultValues: { email: "", role: "team", departments: [] }
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

  const datasetCollectionName = (dt: DatasetType) =>
    dt === "agent-metrics" ? "agentMetrics" : dt === "audit-metrics" ? "auditMetrics" : dt === "question-performance" ? "questionPerformance" : "qtMetrics";

  const importMutation = useMutation({
    mutationFn: async (input: { datasetType: VisibleDatasetType; commit: boolean }) => {
      const file = selectedFiles[input.datasetType];
      if (!file || !selectedPeriodId || !firebaseDb) {
        throw new Error("Dönem ve dosya seçin.");
      }

      const text = await file.text();
      const expectedPeriod = `${selectedYear}-${selectedMonthValue}`;
      const preview =
        input.datasetType === "agent-metrics"
          ? parseDatasetCsv({ datasetType: "agent-metrics", text, expectedPeriod })
          : input.datasetType === "audit-metrics"
            ? parseDatasetCsv({ datasetType: "audit-metrics", text, expectedPeriod })
            : parseDatasetCsv({ datasetType: "question-performance", text, expectedPeriod });
      if (preview.errors.length > 0 && preview.validRows.length === 0) {
        throw new Error(preview.errors.map((e) => e.message).join(", "));
      }

      if (input.commit) {
        const colName = datasetCollectionName(input.datasetType);
        // Mevcut dokümanları sil
        const existing = await getDocs(collection(firebaseDb, "reportPeriods", selectedPeriodId, colName));
        if (!existing.empty) {
          const batch = writeBatch(firebaseDb);
          existing.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        // Yeni verileri yaz
        for (const row of preview.validRows) {
          const record = row as { id: string };
          await setDoc(doc(firebaseDb, "reportPeriods", selectedPeriodId, colName, record.id), record);
        }
      }

      return { errors: preview.errors, rowCount: preview.rowCount, previewRows: preview.validRows, committed: input.commit };
    },
    onSuccess: async (_, variables) => {
      setLastImportDatasetType(variables.datasetType);
      await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });

  const resetDatasetMutation = useMutation({
    mutationFn: async (datasetType: VisibleDatasetType) => {
      if (!selectedPeriodId || !firebaseDb) {
        throw new Error("Önce dönem seçin.");
      }

      const colName = datasetCollectionName(datasetType);
      const existing = await getDocs(collection(firebaseDb, "reportPeriods", selectedPeriodId, colName));
      if (!existing.empty) {
        const batch = writeBatch(firebaseDb);
        existing.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
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

  const updateRepresentativeStatusMutation = useMutation({
    mutationFn: (input: { key: string; status: string }) =>
      api.updateRepresentativeStatus(auth.token, input.key, { status: input.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["representatives"] });
    }
  });

  const updateRepresentativeMutation = useMutation({
    mutationFn: (input: { key: string; displayName?: string; badges?: string[]; timeline?: Array<Record<string, unknown>> }) => {
      const body: Record<string, unknown> = {};
      if (input.displayName != null) body.displayName = input.displayName;
      if (input.badges != null) body.badges = input.badges;
      if (input.timeline != null) body.timeline = input.timeline;
      return api.updateRepresentative(auth.token, input.key, body as any);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["representatives"] });
      setSelectedRepKey(null);
    }
  });

  const createRepresentativeMutation = useMutation({
    mutationFn: (input: { displayName: string; department: string }) =>
      api.createRepresentative(auth.token, input as any),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["representatives"] });
      setShowCreateRepModal(false);
    }
  });

  const deleteRepresentativeMutation = useMutation({
    mutationFn: (key: string) => api.deleteRepresentative(auth.token, key),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["representatives"] });
    }
  });

  const [selectedRepKey, setSelectedRepKey] = useState<string | null>(null);
  const [showCreateRepModal, setShowCreateRepModal] = useState(false);
  const selectedRep = (representativesQuery.data ?? []).find((r) => r.key === selectedRepKey) ?? null;

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
    if (!isAdminUser && (selectedSection === "thresholds" || selectedSection === "roles")) {
      setSelectedSection("periods");
    }
  }, [isAdminUser, selectedSection]);

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

  const visibleAdminSections = useMemo(
    () =>
      adminSections.filter((section) => isAdminUser || (section.id !== "thresholds" && section.id !== "roles")),
    [isAdminUser]
  );
  const visibleDatasetSections = useMemo(
    () => Object.keys(datasetLabels) as VisibleDatasetType[],
    []
  );
  const selectedSectionMeta = visibleAdminSections.find((section) => section.id === selectedSection) ?? visibleAdminSections[0]!;
  const availableYears = useMemo(
    () =>
      Array.from(new Set([String(new Date().getFullYear()), ...(periodsQuery.data ?? []).map((period) => period.month.slice(0, 4))])).sort(
        (left, right) => right.localeCompare(left)
      ),
    [periodsQuery.data]
  );
  const filteredRepresentatives = useMemo(() => {
    let reps = representativesQuery.data ?? [];
    if (repDepartmentFilter !== "all") reps = reps.filter((r) => r.department === repDepartmentFilter);
    if (repStatusFilter !== "all") reps = reps.filter((r) => r.status === repStatusFilter);
    return reps;
  }, [representativesQuery.data, repDepartmentFilter, repStatusFilter]);

  const representativeColumns = useMemo<ColumnDef<Representative>[]>(
    () => [
      {
        header: "İsim",
        accessorKey: "displayName",
        cell: ({ row }) => (
          <button className="text-left font-medium text-slate-900 hover:text-[#2f6b7a] hover:underline dark:text-slate-200 dark:hover:text-sky-400" onClick={() => setSelectedRepKey(row.original.key)} type="button">
            {row.original.displayName}
          </button>
        )
      },
      {
        header: "Etiketler",
        id: "badges",
        cell: ({ row }) => {
          const badges = (row.original as any).badges ?? [];
          if (badges.length === 0) return <span className="text-xs text-slate-400">—</span>;
          return <div className="flex flex-wrap gap-1">{badges.slice(0, 3).map((b: string) => <BadgePill key={b} badgeKey={b} small />)}{badges.length > 3 ? <span className="text-[10px] text-slate-400">+{badges.length - 3}</span> : null}</div>;
        }
      },
      {
        header: "Departman",
        accessorKey: "department",
        cell: ({ row }) => (row.original.department === "cs" ? "CS" : "Satış")
      },
      {
        header: "Durum",
        accessorKey: "status",
        cell: ({ row }) => {
          const status = row.original.status;
          const styles =
            status === "active"
              ? "border-emerald-200 dark:border-emerald-700/40 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
              : status === "departed"
                ? "border-rose-200 dark:border-rose-700/40 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"
                : "border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
          const label = status === "active" ? "Aktif" : status === "departed" ? "Ayrıldı" : "Departman Değişti";
          return (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles}`}>
              {label}
            </span>
          );
        }
      },
      {
        header: "İşlem",
        id: "action",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <FancySelect
              ariaLabel="Temsilci durumu"
              size="sm"
              panelWidthClass="w-48"
              options={[
                { value: "active", label: "Aktif" },
                { value: "departed", label: "Ayrıldı" },
                { value: "department_changed", label: "Departman Değişti" }
              ]}
              value={row.original.status ?? "active"}
              onChange={(v) =>
                updateRepresentativeStatusMutation.mutate({ key: row.original.key, status: v })
              }
            />
            <button
              className="rounded-full p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
              onClick={() => { if (confirm(`"${row.original.displayName}" temsilcisi silinecek. Emin misiniz?`)) deleteRepresentativeMutation.mutate(row.original.key); }}
              type="button"
              title="Sil"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      }
    ],
    [updateRepresentativeStatusMutation, deleteRepresentativeMutation]
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
        header: "Departmanlar",
        id: "departments",
        cell: ({ row }) => {
          const deps = row.original.departments ?? [];
          if (deps.length === 0) return <span className="text-slate-400">—</span>;
          const labels: Record<string, string> = { cs: "CS", sales: "Satış", quality: "Kalite" };
          return deps.map((d) => labels[d] ?? d).join(", ");
        }
      },
      {
        header: "İşlem",
        id: "action",
        cell: ({ row }) => (
          <button
            className="rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:border-primary/30 hover:text-primary"
            onClick={() => {
              setEditingRoleEmail(row.original.email);
              roleForm.reset({
                email: row.original.email,
                role: row.original.role,
                departments: row.original.departments ?? []
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

    if (createPeriodMutation.isPending) {
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
  }, [activePeriodMonth, createPeriodMutation, periodsQuery.data, selectedPeriodId]);

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
              className="rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:border-primary/30 hover:text-primary"
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
              className="rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:border-primary/30 hover:text-primary"
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
              className="rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:border-primary/30 hover:text-primary"
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

          <div className="border-b border-slate-200/80 dark:border-slate-600/40 px-6 py-6">
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

          <div className="border-b border-slate-200/80 dark:border-slate-600/40 px-6 py-6">
            <SidebarSectionTitle>Veri Alanları</SidebarSectionTitle>
            <div className="mt-5 space-y-3">
              {visibleDatasetSections.map((datasetType) => (
                <ImportShortcutRow
                  active={activeDatasetType === datasetType}
                  key={datasetType}
                  label={datasetLabels[datasetType]}
                  onDownload={() => downloadCsvTemplate(datasetType)}
                  onOpen={() => setSelectedSection(datasetType)}
                />
              ))}
            </div>
          </div>

          <div className="px-6 py-6">
            <button
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 transition hover:text-slate-900 dark:hover:text-slate-200"
              onClick={() => void auth.logout()}
              type="button"
            >
              <LogOut size={16} />
              Çıkış Yap
            </button>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="rounded-[10px] border border-slate-200/90 dark:border-slate-600/40 bg-white dark:bg-slate-800 px-8 py-6 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center gap-2">
              <HeaderPill>{selectedSectionMeta.label}</HeaderPill>
              <HeaderPill tone="accent">{formatPeriodChip(activePeriodMonth)}</HeaderPill>
              <HeaderPill tone="success">{activeDatasetType ? "CSV Sync" : "Hazır"}</HeaderPill>
              <HeaderPill tone={currentStatusTone}>{currentStatusLabel}</HeaderPill>
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-100 sm:text-4xl">
              Veri Yönetim Paneli
            </h1>
          </section>

          <div className="space-y-6">
            {selectedSection === "periods" ? (
              <SurfaceCard
                description="Seçili dönem için en son alınan import kayıtları."
                title="Son Importlar"
                variant="default"
              >
                {(periodDetailsQuery.data?.importJobs ?? []).length > 0 ? (
                  <div className="space-y-2">
                    {periodDetailsQuery.data?.importJobs.slice(0, 6).map((job) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3"
                        key={job.id}
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {job.datasetType === "qt-metrics" ? "QT" : datasetLabels[job.datasetType]}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {job.uploadedBy} • {job.uploadedAt.slice(0, 10)}
                          </p>
                        </div>
                        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
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
            ) : null}

            {activeDatasetType ? (
              <div className="space-y-6">

                <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-rose-200 dark:border-rose-700/40 bg-rose-50/70 dark:bg-rose-900/30 px-5 py-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-rose-900 dark:text-rose-400">Seçili ay verisini sıfırla</p>
                    <p className="text-sm text-rose-700 dark:text-rose-400">
                      {datasetLabels[activeDatasetType]} için {formatPeriodChip(activePeriodMonth)} dönemindeki mevcut kayıtları temizler.
                    </p>
                  </div>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-rose-300 dark:border-rose-700/40 bg-white dark:bg-rose-900/30 px-4 text-sm font-semibold text-rose-700 dark:text-rose-400 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!selectedPeriodId || resetDatasetMutation.isPending}
                    onClick={handleResetDataset}
                    type="button"
                  >
                    <Trash2 size={15} />
                    {resetDatasetMutation.isPending ? "Sıfırlanıyor..." : "Bu ayın verisini sıfırla"}
                  </button>
                </div>

                {resetDatasetMutation.isError ? (
                  <div className="rounded-[10px] border border-rose-200 dark:border-rose-700/40 bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
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
                          className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
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
                          className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
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
                          className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
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
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Alanı boş bırakıp kaydetmek manuel değeri kaldırır.
                      </p>
                      <button
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-slate-950 dark:bg-slate-700 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700/50"
                        disabled={!selectedPeriodId || manualCsatMutation.isPending}
                        onClick={() => manualCsatMutation.mutate(manualCsatInputs)}
                        type="button"
                      >
                        <Save size={15} />
                        {manualCsatMutation.isPending ? "Kaydediliyor..." : "Manuel değerleri kaydet"}
                      </button>
                    </div>

                    {manualCsatMutation.isError ? (
                      <div className="mt-4 rounded-[10px] border border-rose-200 dark:border-rose-700/40 bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                        {manualCsatMutation.error instanceof Error
                          ? manualCsatMutation.error.message
                          : "Manuel değerler kaydedilirken bir hata oluştu."}
                      </div>
                    ) : null}
                  </SurfaceCard>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <SurfaceCard
                    description={datasetDescriptions[activeDatasetType]}
                    title="CSV ile İçe Aktar"
                    variant="default"
                  >
                    <div className="space-y-4">
                      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-700/30 px-4 text-center transition hover:border-primary/40 hover:bg-sky-50/50 dark:hover:bg-slate-700/50">
                        <FileSpreadsheet className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">CSV dosyası seçin</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
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
                          className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-primary/30 hover:text-primary"
                          onClick={() => importMutation.mutate({ datasetType: activeDatasetType, commit: false })}
                          type="button"
                        >
                          Ön izleme
                        </button>
                        <button
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-slate-950 dark:bg-slate-700 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:hover:bg-slate-600"
                          onClick={() => importMutation.mutate({ datasetType: activeDatasetType, commit: true })}
                          type="button"
                        >
                          <Upload size={15} />
                          CSV içe aktar
                        </button>
                      </div>

                      {importMutation.isError ? (
                        <div className="rounded-[10px] border border-rose-200 dark:border-rose-700/40 bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                          {importMutation.error instanceof Error ? importMutation.error.message : "CSV işlemi sırasında bir hata oluştu."}
                        </div>
                      ) : null}

                      {importResult ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 px-4 py-3 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{formatNumber(importResult.rowCount)} satır</span>
                            <span className="text-slate-400">•</span>
                            <span className="text-slate-600 dark:text-slate-400">{formatNumber(importResult.previewRows.length)} ön izleme</span>
                            <span className="text-slate-400">•</span>
                            <span className={importResult.errors.length > 0 ? "font-medium text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-400"}>{formatNumber(importResult.errors.length)} hata</span>
                            <span className="text-slate-400">•</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${importResult.committed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300"}`}>{importResult.committed ? "İçe aktarıldı" : "Ön izleme"}</span>
                          </div>

                          {importResult.errors.length > 0 ? (
                            <div className="rounded-[10px] border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/30 px-4 py-4">
                              <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">CSV hata özeti</p>
                              <div className="mt-3 space-y-2">
                                {importResult.errors.slice(0, 5).map((error, index) => (
                                  <div className="text-sm text-amber-700 dark:text-amber-400" key={`${error.row}-${index}`}>
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
                              className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
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

            {selectedSection === "representatives" ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex items-center gap-2 rounded-[10px] bg-[#2f6b7a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#285d6a]"
                    onClick={() => setShowCreateRepModal(true)}
                    type="button"
                  >
                    <Plus size={15} />
                    Yeni Temsilci
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <FancySelect
                      ariaLabel="Departman filtresi"
                      panelWidthClass="w-48"
                      options={[
                        { value: "all", label: "Tüm Departmanlar" },
                        { value: "cs", label: "CS" },
                        { value: "sales", label: "Satış" }
                      ]}
                      value={repDepartmentFilter}
                      onChange={(v) => setRepDepartmentFilter(v as typeof repDepartmentFilter)}
                    />
                    <FancySelect
                      ariaLabel="Durum filtresi"
                      panelWidthClass="w-48"
                      options={[
                        { value: "all", label: "Tüm Durumlar" },
                        { value: "active", label: "Aktif" },
                        { value: "departed", label: "Ayrıldı" },
                        { value: "department_changed", label: "Departman Değişti" }
                      ]}
                      value={repStatusFilter}
                      onChange={(v) => setRepStatusFilter(v as typeof repStatusFilter)}
                    />
                  </div>
                </div>
                {representativesQuery.isLoading ? (
                  <EmptyBlock message="Temsilciler yükleniyor..." />
                ) : filteredRepresentatives.length === 0 ? (
                  <EmptyBlock message="Henüz temsilci kaydı yok. Veri içe aktarıldığında temsilciler otomatik oluşturulur." />
                ) : (
                  <SurfaceCard title={`Temsilciler (${filteredRepresentatives.length})`} description="Temsilci durumlarını görüntüleyin ve düzenleyin." variant="default">
                    <DataTable columns={representativeColumns} data={filteredRepresentatives} density="compact" />
                  </SurfaceCard>
                )}

                {selectedRep ? (
                  <RepresentativeDetailModal
                    representative={selectedRep}
                    mode="edit"
                    isSaving={updateRepresentativeMutation.isPending}
                    onClose={() => setSelectedRepKey(null)}
                    onSave={(data) => updateRepresentativeMutation.mutate({ key: selectedRep.key, ...data })}
                  />
                ) : null}

                {showCreateRepModal ? (
                  <RepresentativeDetailModal
                    mode="create"
                    defaultDepartment="cs"
                    isSaving={createRepresentativeMutation.isPending}
                    onClose={() => setShowCreateRepModal(false)}
                    onSave={(data) => createRepresentativeMutation.mutate({ displayName: data.displayName!, department: data.department ?? "cs" })}
                  />
                ) : null}
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
                      <div className="rounded-[10px] border border-sky-200 dark:border-sky-700/40 bg-sky-50 dark:bg-sky-900/30 px-4 py-3 text-sm text-sky-800 dark:text-sky-400">
                        <span className="font-semibold">{editingRoleEmail}</span> için düzenleme modundasınız.
                      </div>
                    ) : null}
                    <InputField label="E-posta">
                      <input
                        className={[
                          "h-11 w-full rounded-[10px] border px-3.5 text-sm transition focus:border-primary/40 focus:outline-none",
                          editingRoleEmail
                            ? "cursor-not-allowed border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400"
                            : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-700 dark:text-slate-200"
                        ].join(" ")}
                        disabled={Boolean(editingRoleEmail)}
                        {...roleForm.register("email")}
                      />
                    </InputField>
                    <InputField label="Rol">
                      <select
                        className="h-11 w-full rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
                        {...roleForm.register("role")}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </InputField>
                    <InputField label="Departman erişimi">
                      <div className="flex flex-wrap gap-4 pt-1">
                        {([["cs", "CS"], ["sales", "Satış"]] as const).map(([dep, label]) => {
                          const checked = (roleForm.watch("departments") ?? []).includes(dep);
                          return (
                            <label key={dep} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary/30"
                                checked={checked}
                                onChange={(e) => {
                                  const current = roleForm.getValues("departments") ?? [];
                                  roleForm.setValue(
                                    "departments",
                                    e.target.checked ? [...current, dep] : current.filter((d) => d !== dep),
                                    { shouldDirty: true }
                                  );
                                }}
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </InputField>
                    {(roleForm.formState.errors.email || roleForm.formState.errors.role) ? (
                      <div className="rounded-[10px] border border-rose-200 dark:border-rose-700/40 bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                        {roleForm.formState.errors.email?.message ?? roleForm.formState.errors.role?.message}
                      </div>
                    ) : null}
                    {roleMutation.isError ? (
                      <div className="rounded-[10px] border border-rose-200 dark:border-rose-700/40 bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                        {roleMutation.error instanceof Error ? roleMutation.error.message : "Rol kaydedilirken bir hata oluştu."}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[10px] bg-slate-950 dark:bg-slate-700 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700/50"
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
                          className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                          onClick={() => {
                            setEditingRoleEmail(null);
                            roleForm.reset({ email: "", role: "team", departments: [] });
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
        "w-full rounded-[10px] border px-4 py-3 text-left text-sm font-semibold transition",
        props.active
          ? "border-[#2f6b7a] bg-[#2f6b7a] text-white shadow-[0_16px_34px_rgba(47,107,122,0.22)]"
          : "border-transparent bg-transparent text-slate-700 dark:text-slate-300 hover:border-slate-200 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/30 hover:text-slate-950 dark:hover:text-slate-200"
      ].join(" ")}
      onClick={props.onClick}
      type="button"
    >
      {props.label}
    </button>
  );
}

function SidebarSectionTitle(props: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{props.children}</p>;
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
        "inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-sm font-semibold transition",
        props.primary
          ? "bg-[#2f6b7a] text-white shadow-[0_14px_28px_rgba(47,107,122,0.18)] hover:bg-[#285d6a]"
          : "border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/30",
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
        "flex items-center justify-between gap-3 rounded-[10px] border px-4 py-3 transition",
        props.active ? "border-sky-200 dark:border-sky-700/40 bg-sky-50/70 dark:bg-sky-900/30" : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800"
      ].join(" ")}
    >
      <button
        className="min-w-0 flex-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200 transition hover:text-slate-950 dark:hover:text-slate-200"
        onClick={props.onOpen}
        type="button"
      >
        {props.label}
      </button>
      {props.onDownload ? (
        <button
          className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 transition hover:border-slate-300 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
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

function EmptyBlock(props: { message: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
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
