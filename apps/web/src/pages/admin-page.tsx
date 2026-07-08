import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  createDeterministicId,
  getTemplateContent,
  parseDatasetCsv,
  type AgentMetric,
  type AuditMetric,
  type DatasetType,
  type KpiMetricKey,
  type QuestionPerformance,
  type Representative,
  type TimelineEvent,
  type UserRoleAssignment
} from "@kalitedb/shared";
import { collection, doc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  ClipboardCheck,
  FileDown,
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
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AdminShell, AdminShellHeader, AdminShellSidebar, type AdminNavGroup } from "../components/admin-shell";
import {
  AdminButton,
  AdminCard,
  AdminDangerZone,
  AdminDropzone,
  ADMIN_INPUT,
  Banner,
  EmptyBlock,
  ErrorBanner,
  HeaderPill,
  InputField
} from "../components/admin-ui";
import { DataTable } from "../components/data-table";
import { BadgeFilter } from "../components/badge-filter";
import { FancySelect } from "../components/fancy-select";
import { RecordEditor } from "../components/record-editor";
import { AuditScoreEditorModal, type AuditScoreDraft } from "../components/audit-score-editor";
import { RepresentativeDetailModal, BadgePill } from "../components/representative-detail-modal";
import { useAuth } from "../lib/auth";
import { api, type AuthenticatedUser } from "../lib/api";
import { firebaseDb } from "../lib/firebase";
import {
  formatAuditScore,
  formatNumber,
  formatPercent
} from "../lib/format";

const roleSchema = z
  .object({
    email: z.string().email(),
    role: z.enum([
      "admin",
      "manager",
      "team_leader",
      "quality",
      "representative",
      "viewer",
      "roleplay_admin",
      "team",
      "ceo",
      "qt"
    ]),
    departments: z.array(z.enum(["cs", "sales", "quality", "partner"])),
    representativeKey: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.role === "representative" && !value.representativeKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["representativeKey"],
        message: "Temsilci rolü için temsilci seçimi zorunludur."
      });
    }
  });

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Yönetici" },
  { value: "team_leader", label: "Takım Lideri" },
  { value: "quality", label: "Kalite" },
  { value: "representative", label: "Temsilci" },
  { value: "viewer", label: "Görüntüleyici" },
  { value: "roleplay_admin", label: "Role-Play Yöneticisi" },
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
  const isAdminUser = props.currentUserRole === "admin";
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
  const [repDepartmentFilter, setRepDepartmentFilter] = useState<"all" | "cs" | "quality" | "partner">("all");
  const [repStatusFilter, setRepStatusFilter] = useState<"all" | "active" | "departed" | "department_changed">("all");
  const [repBadgeFilter, setRepBadgeFilter] = useState("");
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [auditEditorState, setAuditEditorState] = useState<
    | { mode: "create" }
    | { mode: "edit"; record: AuditMetric }
    | null
  >(null);
  const [auditEditorError, setAuditEditorError] = useState<string | null>(null);

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
    defaultValues: { email: "", role: "team", departments: [], representativeKey: "" }
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
      roleForm.reset({ email: "", role: "team", departments: [], representativeKey: "" });
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
    mutationFn: (input: { key: string; displayName?: string; department?: string; badges?: string[]; timeline?: Array<Record<string, unknown>>; exclusions?: string[] }) => {
      const body: Record<string, unknown> = {};
      if (input.displayName != null) body.displayName = input.displayName;
      if (input.department != null) body.department = input.department;
      if (input.badges != null) body.badges = input.badges;
      if (input.timeline != null) body.timeline = input.timeline;
      if (input.exclusions != null) body.exclusions = input.exclusions;
      return api.updateRepresentative(auth.token, input.key, body as any);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["representatives"] });
      setSelectedRepKey(null);
    }
  });

  const createRepresentativeMutation = useMutation({
    mutationFn: (input: { displayName: string; department: string; badges?: string[]; timeline?: TimelineEvent[]; exclusions?: string[] }) =>
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

  const upsertAuditMutation = useMutation({
    mutationFn: async (record: AuditMetric) => {
      if (!selectedPeriodId) {
        throw new Error("Önce dönem seçin.");
      }
      return api.upsertAuditMetric(auth.token, selectedPeriodId, record);
    },
    onSuccess: async () => {
      setAuditEditorState(null);
      setAuditEditorError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["cs-audit-metrics-bulk"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-history-bulk"] })
      ]);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Audit kaydı yazılamadı.";
      setAuditEditorError(message);
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
  const navGroups = useMemo<AdminNavGroup[]>(() => {
    const byId = new Map(visibleAdminSections.map((section) => [section.id, section]));
    const build = (ids: AdminSection[]) =>
      ids
        .map((id) => byId.get(id))
        .filter((section): section is (typeof adminSections)[number] => Boolean(section))
        .map((section) => ({
          id: section.id,
          label: section.label,
          description: section.description,
          icon: <section.icon size={14} strokeWidth={2} />,
          active: selectedSection === section.id,
          onClick: () => setSelectedSection(section.id)
        }));

    return [
      { id: "period", label: "Dönem Yönetimi", items: build(["periods"]) },
      { id: "datasets", label: "Veri Setleri", items: build(["agent-metrics", "audit-metrics", "question-performance"]) },
      { id: "config", label: "Konfigürasyon", items: build(["thresholds", "roles"]) },
      { id: "team", label: "Takım", items: build(["representatives"]) }
    ].filter((group) => group.items.length > 0);
  }, [visibleAdminSections, selectedSection]);
  const availableYears = useMemo(
    () =>
      Array.from(new Set([String(new Date().getFullYear()), ...(periodsQuery.data ?? []).map((period) => period.month.slice(0, 4))])).sort(
        (left, right) => right.localeCompare(left)
      ),
    [periodsQuery.data]
  );
  const filteredRepresentatives = useMemo(() => {
    // CS yönetim paneli Temsilciler listesi Satış departmanını ve RevOps etiketlilerini
    // hiç göstermez — onlar kendi (Satış) yönetim panelinden yönetilir.
    let reps = (representativesQuery.data ?? []).filter(
      (r) => r.department !== "sales" && !(r.badges ?? []).includes("revops")
    );
    if (repDepartmentFilter !== "all") reps = reps.filter((r) => r.department === repDepartmentFilter);
    if (repStatusFilter !== "all") reps = reps.filter((r) => r.status === repStatusFilter);
    if (repBadgeFilter) reps = reps.filter((r) => (r.badges ?? []).includes(repBadgeFilter));
    return reps;
  }, [representativesQuery.data, repDepartmentFilter, repStatusFilter, repBadgeFilter]);

  const representativeColumns = useMemo<ColumnDef<Representative>[]>(
    () => [
      {
        header: "İsim",
        accessorKey: "displayName",
        cell: ({ row }) => (
          <button className="text-left font-medium text-slate-900 hover:text-[var(--adm-accent)] hover:underline dark:text-slate-200 dark:hover:text-sky-400" onClick={() => setSelectedRepKey(row.original.key)} type="button">
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
        cell: ({ row }) => {
          const dept = row.original.department;
          return dept === "cs" ? "CS" : dept === "sales" ? "Satış" : dept === "quality" ? "Kalite" : dept === "partner" ? "Partner" : dept;
        }
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
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[var(--adm-accent-border)] hover:text-[var(--adm-accent-text)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            onClick={() => {
              setEditingRoleEmail(row.original.email);
              roleForm.reset({
                email: row.original.email,
                role: row.original.role,
                departments: row.original.departments ?? [],
                representativeKey: row.original.representativeKey ?? ""
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
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[var(--adm-accent-border)] hover:text-[var(--adm-accent-text)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
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
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[var(--adm-accent-border)] hover:text-[var(--adm-accent-text)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              onClick={() => {
                setAuditEditorError(null);
                setAuditEditorState({ mode: "edit", record: row.original as AuditMetric });
              }}
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
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[var(--adm-accent-border)] hover:text-[var(--adm-accent-text)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
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

  const sidebarHeader = (
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
  );

  const sidebarFooter = (
    <button
      className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-white"
      onClick={() => void auth.logout()}
      type="button"
    >
      <LogOut size={15} />
      Çıkış Yap
    </button>
  );

  const headerActions = (
    <>
      {selectedSection === "periods" ? (
        <AdminButton
          icon={<Save size={14} />}
          variant="primary"
          disabled={!selectedPeriodId}
          onClick={() => publishMutation.mutate(selectedPeriod?.status === "published" ? "reopen" : "publish")}
        >
          {selectedPeriod?.status === "published" ? "Taslağa geri al" : "Şimdi kaydet"}
        </AdminButton>
      ) : null}
      {selectedSection === "thresholds" ? (
        <AdminButton icon={<Save size={14} />} variant="primary" onClick={() => thresholdMutation.mutate()}>
          Eşikleri kaydet
        </AdminButton>
      ) : null}
      {activeDatasetType ? (
        <AdminButton icon={<FileDown size={14} />} onClick={() => downloadCsvTemplate(activeDatasetType)}>
          Şablon indir
        </AdminButton>
      ) : null}
      <AdminButton icon={<RefreshCw size={14} />} onClick={() => void refreshCurrentView()}>
        Yenile
      </AdminButton>
    </>
  );

  const headerPills = (
    <>
      <HeaderPill tone="accent">{formatPeriodChip(activePeriodMonth)}</HeaderPill>
      {activeDatasetType ? <HeaderPill tone="success">CSV Sync</HeaderPill> : null}
      <HeaderPill tone={currentStatusTone}>{currentStatusLabel}</HeaderPill>
    </>
  );

  return (
    <AdminShell
      accent="cs"
      sidebar={
        <AdminShellSidebar
          title="Yönetim Paneli"
          subtitle="Customer Success"
          header={sidebarHeader}
          search={{ value: sidebarQuery, onChange: setSidebarQuery, placeholder: "Bölüm ara..." }}
          groups={navGroups}
          footer={sidebarFooter}
        />
      }
    >
      <AdminShellHeader
        breadcrumb={<span>Yönetim · CS</span>}
        title={selectedSectionMeta.label}
        description={selectedSectionMeta.description}
        pills={headerPills}
        actions={headerActions}
      />

          <div className="space-y-6">
            {selectedSection === "periods" ? (
              <AdminCard
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
              </AdminCard>
            ) : null}

            {activeDatasetType ? (
              <div className="space-y-6">

                <AdminDangerZone
                  title="Seçili ay verisini sıfırla"
                  description={`${datasetLabels[activeDatasetType]} için ${formatPeriodChip(activePeriodMonth)} dönemindeki mevcut kayıtları temizler.`}
                  actionLabel="Bu ayın verisini sıfırla"
                  busyLabel="Sıfırlanıyor..."
                  busy={resetDatasetMutation.isPending}
                  disabled={!selectedPeriodId}
                  onAction={handleResetDataset}
                />

                {resetDatasetMutation.isError ? (
                  <ErrorBanner
                    message={
                      resetDatasetMutation.error instanceof Error
                        ? resetDatasetMutation.error.message
                        : "Veri sıfırlanırken bir hata oluştu."
                    }
                  />
                ) : null}

                {activeDatasetType === "agent-metrics" ? (
                  <AdminCard
                    description="CSV import olmadan CSAT üst kartlarındaki toplam çağrı, chat / e-posta ve ticket sayılarını buradan girin. Boş bırakıp kaydederseniz sistem satır toplamlarını kullanır."
                    title="CSAT kartları için manuel giriş"
                    variant="default"
                  >
                    <div className="grid gap-4 md:grid-cols-3">
                      <InputField label="Toplam çağrı">
                        <input
                          className={ADMIN_INPUT}
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
                          className={ADMIN_INPUT}
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
                          className={ADMIN_INPUT}
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
                      <AdminButton
                        icon={<Save size={15} />}
                        variant="primary"
                        size="lg"
                        disabled={!selectedPeriodId || manualCsatMutation.isPending}
                        onClick={() => manualCsatMutation.mutate(manualCsatInputs)}
                      >
                        {manualCsatMutation.isPending ? "Kaydediliyor..." : "Manuel değerleri kaydet"}
                      </AdminButton>
                    </div>

                    {manualCsatMutation.isError ? (
                      <div className="mt-4">
                        <ErrorBanner
                          message={
                            manualCsatMutation.error instanceof Error
                              ? manualCsatMutation.error.message
                              : "Manuel değerler kaydedilirken bir hata oluştu."
                          }
                        />
                      </div>
                    ) : null}
                  </AdminCard>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <AdminCard
                    description={datasetDescriptions[activeDatasetType]}
                    title="CSV ile İçe Aktar"
                    variant="default"
                  >
                    <div className="space-y-4">
                      <AdminDropzone
                        title="CSV dosyası seçin"
                        hint={selectedFiles[activeDatasetType]?.name ?? "Henüz dosya seçilmedi"}
                        onFile={(file) => setSelectedFiles((current) => ({ ...current, [activeDatasetType]: file }))}
                      />

                      <div className="grid gap-3 sm:grid-cols-2">
                        <AdminButton
                          size="lg"
                          onClick={() => importMutation.mutate({ datasetType: activeDatasetType, commit: false })}
                        >
                          Ön izleme
                        </AdminButton>
                        <AdminButton
                          icon={<Upload size={15} />}
                          variant="primary"
                          size="lg"
                          onClick={() => importMutation.mutate({ datasetType: activeDatasetType, commit: true })}
                        >
                          CSV içe aktar
                        </AdminButton>
                      </div>

                      {importMutation.isError ? (
                        <ErrorBanner
                          message={importMutation.error instanceof Error ? importMutation.error.message : "CSV işlemi sırasında bir hata oluştu."}
                        />
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
                  </AdminCard>

                  <AdminCard
                    actions={
                      activeDatasetType === "audit-metrics" && selectedPeriodId ? (
                        <AdminButton
                          icon={<Plus size={14} />}
                          variant="primary"
                          size="sm"
                          disabled={!selectedPeriod}
                          onClick={() => {
                            setAuditEditorError(null);
                            setAuditEditorState({ mode: "create" });
                          }}
                        >
                          Manuel Skor Ekle
                        </AdminButton>
                      ) : null
                    }
                    description={
                      activeDatasetType === "audit-metrics"
                        ? "Mevcut kayıtları okuyun veya yeni temsilci skoru ekleyin."
                        : "Mevcut kayıtları okuyun ve düzenlemek istediğiniz satırı seçin."
                    }
                    title="Mevcut Kayıtlar"
                    variant="default"
                  >
                    <DataTable
                      columns={datasetColumns}
                      data={datasetRows}
                      density="compact"
                      emptyState="Kayıt bulunmuyor. CSV ile veri aktararak başlayabilirsiniz."
                    />
                  </AdminCard>
                </div>

                {activeDatasetType !== "audit-metrics" ? (
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
                ) : null}
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
                    <AdminCard
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
                              className={ADMIN_INPUT}
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
                    </AdminCard>
                  );
                })}
              </div>
            ) : null}

            {selectedSection === "representatives" ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <AdminButton icon={<Plus size={15} />} variant="primary" onClick={() => setShowCreateRepModal(true)}>
                    Yeni Temsilci
                  </AdminButton>
                  <div className="ml-auto flex items-center gap-2">
                    <FancySelect
                      ariaLabel="Departman filtresi"
                      panelWidthClass="w-48"
                      options={[
                        { value: "all", label: "Tüm Departmanlar" },
                        { value: "cs", label: "CS" },
                        { value: "quality", label: "Kalite" },
                        { value: "partner", label: "Partner" }
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
                    <BadgeFilter value={repBadgeFilter} onChange={setRepBadgeFilter} />
                  </div>
                </div>
                {representativesQuery.isLoading ? (
                  <EmptyBlock message="Temsilciler yükleniyor..." />
                ) : filteredRepresentatives.length === 0 ? (
                  <EmptyBlock message="Henüz temsilci kaydı yok. Veri içe aktarıldığında temsilciler otomatik oluşturulur." />
                ) : (
                  <AdminCard title={`Temsilciler (${filteredRepresentatives.length})`} description="Temsilci durumlarını görüntüleyin ve düzenleyin." variant="default">
                    <DataTable columns={representativeColumns} data={filteredRepresentatives} density="compact" />
                  </AdminCard>
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
                    onSave={(data) => createRepresentativeMutation.mutate({ displayName: data.displayName!, department: data.department ?? "cs", badges: data.badges, timeline: data.timeline, exclusions: data.exclusions })}
                  />
                ) : null}
              </div>
            ) : null}

            {selectedSection === "roles" ? (
              <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
                <AdminCard
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
                      <Banner tone="info">
                        <span className="font-semibold">{editingRoleEmail}</span> için düzenleme modundasınız.
                      </Banner>
                    ) : null}
                    <InputField label="E-posta">
                      <input
                        className={ADMIN_INPUT}
                        disabled={Boolean(editingRoleEmail)}
                        {...roleForm.register("email")}
                      />
                    </InputField>
                    <InputField label="Rol">
                      <select
                        className={ADMIN_INPUT}
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
                                className="h-4 w-4 rounded border-slate-300 accent-[var(--adm-accent)] dark:border-slate-600"
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
                    {roleForm.watch("role") === "representative" ? (
                      <InputField label="Hangi temsilci?">
                        <FancySelect
                          options={(representativesQuery.data ?? [])
                            .filter((r) => r.status === "active")
                            .map((r) => ({
                              value: r.key,
                              label: `${r.displayName} (${r.department === "sales" ? "Satış" : r.department === "cs" ? "CS" : r.department})`
                            }))}
                          placeholder="Temsilci seçin"
                          value={roleForm.watch("representativeKey") ?? ""}
                          onChange={(value) =>
                            roleForm.setValue("representativeKey", value, { shouldDirty: true, shouldValidate: true })
                          }
                        />
                      </InputField>
                    ) : null}
                    {(roleForm.formState.errors.email || roleForm.formState.errors.role || roleForm.formState.errors.representativeKey) ? (
                      <ErrorBanner
                        message={
                          roleForm.formState.errors.email?.message
                            ?? roleForm.formState.errors.role?.message
                            ?? roleForm.formState.errors.representativeKey?.message
                            ?? "Form doğrulanamadı."
                        }
                      />
                    ) : null}
                    {roleMutation.isError ? (
                      <ErrorBanner
                        message={roleMutation.error instanceof Error ? roleMutation.error.message : "Rol kaydedilirken bir hata oluştu."}
                      />
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      <AdminButton
                        className="flex-1"
                        variant="primary"
                        size="lg"
                        disabled={roleMutation.isPending}
                        type="submit"
                      >
                        {roleMutation.isPending
                          ? "Kaydediliyor..."
                          : editingRoleEmail
                            ? "Rolü güncelle"
                            : "Rol ekle"}
                      </AdminButton>
                      {editingRoleEmail ? (
                        <AdminButton
                          size="lg"
                          onClick={() => {
                            setEditingRoleEmail(null);
                            roleForm.reset({ email: "", role: "team", departments: [], representativeKey: "" });
                          }}
                        >
                          Vazgeç
                        </AdminButton>
                      ) : null}
                    </div>
                  </form>
                </AdminCard>

                <AdminCard
                  description="Tanımlı roller tablo halinde listelenir. Düzenlemek için satırdaki aksiyonu kullanın."
                  title="Rol Listesi"
                  variant="default"
                >
                  <DataTable columns={roleColumns} data={rolesQuery.data ?? []} density="compact" />
                </AdminCard>
              </div>
            ) : null}
          </div>
      {auditEditorState && selectedPeriod && selectedPeriodId ? (
        <AuditScoreEditorModal
          errorMessage={auditEditorError}
          existingAgentKeys={
            new Set((periodDetailsQuery.data?.datasets.auditMetrics ?? []).map((rec) => rec.agentKey))
          }
          initial={auditEditorState.mode === "edit" ? auditEditorState.record : undefined}
          isSaving={upsertAuditMutation.isPending}
          mode={auditEditorState.mode}
          onClose={() => {
            if (upsertAuditMutation.isPending) return;
            setAuditEditorState(null);
            setAuditEditorError(null);
          }}
          onSave={async (draft: AuditScoreDraft) => {
            const periodMonth = selectedPeriod.month;
            const existing = (periodDetailsQuery.data?.datasets.auditMetrics ?? []).find(
              (rec) => rec.agentKey === draft.agentKey
            );
            const id = existing?.id ?? createDeterministicId(periodMonth, "audit", draft.agentName);
            const record: AuditMetric = {
              id,
              period: periodMonth,
              agentKey: draft.agentKey,
              agentName: draft.agentName,
              auditScore: draft.auditScore,
              previousAuditAccuracy: draft.previousAuditAccuracy
            };
            await upsertAuditMutation.mutateAsync(record);
          }}
          periodMonth={selectedPeriod.month}
          periodTitle={selectedPeriod.title}
          representatives={representativesQuery.data ?? []}
        />
      ) : null}
    </AdminShell>
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
