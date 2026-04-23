import { SurfaceCard } from "@kalitedb/ui";
import { normalizeKey } from "@kalitedb/shared";
import type { Representative, SalesMeeting, SalesKpiData } from "@kalitedb/shared";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, FileQuestion, Handshake, LogOut, MessageSquare, MessageSquarePlus, Pencil, Play, Plus, RefreshCw, Save, Target, Trash2, TrendingUp, Upload, Users, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { collection, doc, getDocs, setDoc } from "firebase/firestore";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { firebaseDb } from "../lib/firebase";
import { parseTalkDurationLabelToSeconds } from "../lib/format";
import { AdminShell, AdminShellHeader, AdminShellSidebar, type AdminNavGroup } from "../components/admin-shell";
import { DataTable } from "../components/data-table";
import { FancySelect } from "../components/fancy-select";
import { LossReasonSelect } from "../components/loss-reason-select";
import { RepresentativeDetailModal, BadgePill } from "../components/representative-detail-modal";


type AdminSection = "audit" | "roleplay" | "evaluation" | "meetings" | "kpi" | "representatives" | "ramp";

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0");
  const label = new Intl.DateTimeFormat("tr-TR", { month: "long" }).format(new Date(`2026-${value}-01T00:00:00`));
  return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
});

type AuditEntryRow = {
  id: string;
  agentName: string;
  auditScore: string;
};

type RoleplayEntryRow = {
  id: string;
  agentName: string;
  rolePlayCount: string;
  revOpsCount: string;
  note: string;
};

type EvaluationEntryRow = {
  id: string;
  questionText: string;
  answer: string;
  score: string;
};

function generateId() {
  return Math.random().toString(36).slice(2, 12);
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

function formatSalesPeriodTitle(period: string) {
  const [year] = period.split("-");
  return `Satış ${formatLongMonth(period)} ${year} Audit Raporu`;
}

function getPreviousMonth(period: string) {
  const [yearPart, monthPart] = period.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

export function SalesAdminPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();

  const [activeSection, setActiveSection] = useState<AdminSection>("audit");
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonthValue, setSelectedMonthValue] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");

  // Audit state
  const [auditRows, setAuditRows] = useState<AuditEntryRow[]>([]);
  const [auditSaveSuccess, setAuditSaveSuccess] = useState(false);

  // Roleplay state
  const [roleplayRows, setRoleplayRows] = useState<RoleplayEntryRow[]>([]);
  const [roleplaySaveSuccess, setRoleplaySaveSuccess] = useState(false);

  // Evaluation state
  const [evaluationRows, setEvaluationRows] = useState<EvaluationEntryRow[]>([]);
  const [evaluationSaveSuccess, setEvaluationSaveSuccess] = useState(false);

  // Meetings import state
  const [meetingsImportSuccess, setMeetingsImportSuccess] = useState(false);

  // KPI import state
  const [kpiImportSuccess, setKpiImportSuccess] = useState(false);

  // Representatives state
  const [selectedRepKey, setSelectedRepKey] = useState<string | null>(null);
  const [repStatusFilter, setRepStatusFilter] = useState<"all" | "active" | "departed" | "department_changed">("all");

  const activePeriodMonth = `${selectedYear}-${selectedMonthValue}`;

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const salesPeriods = useMemo(
    () => (periodsQuery.data ?? []).filter((p) => (p.department ?? "cs") === "sales"),
    [periodsQuery.data]
  );

  const selectedPeriod = salesPeriods.find((p) => p.id === selectedPeriodId);

  const representativesQuery = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const updateRepresentativeStatusMutation = useMutation({
    mutationFn: (input: { key: string; status: string }) =>
      api.updateRepresentativeStatus(auth.token, input.key, { status: input.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["representatives"] });
    }
  });

  const updateRepresentativeMutation = useMutation({
    mutationFn: (input: { key: string; displayName?: string; department?: string; badges?: string[]; timeline?: Array<Record<string, unknown>> }) => {
      const body: Record<string, unknown> = {};
      if (input.displayName != null) body.displayName = input.displayName;
      if (input.department != null) body.department = input.department;
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
      await queryClient.invalidateQueries({ queryKey: ["all-sales-agents"] });
      setShowCreateRepModal(false);
    }
  });

  const [repDeleteError, setRepDeleteError] = useState<string | null>(null);
  const deleteRepresentativeMutation = useMutation({
    mutationFn: (key: string) => api.deleteRepresentative(auth.token, key),
    onSuccess: async () => {
      setRepDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ["representatives"] });
      await queryClient.invalidateQueries({ queryKey: ["all-sales-agents"] });
    },
    onError: (error) => {
      setRepDeleteError(error instanceof Error ? error.message : "Temsilci silinemedi. Yetkiniz olmayabilir.");
    }
  });

  const [showCreateRepModal, setShowCreateRepModal] = useState(false);

  const availableYears = useMemo(
    () =>
      Array.from(new Set([String(now.getFullYear()), ...salesPeriods.map((p) => p.month.slice(0, 4))])).sort(
        (a, b) => b.localeCompare(a)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salesPeriods]
  );

  const createPeriodMutation = useMutation({
    mutationFn: (values: { month: string; title: string; compareToPeriodId?: string }) =>
      api.createPeriod(auth.token, {
        month: values.month,
        title: values.title,
        department: "sales",
        ...(values.compareToPeriodId ? { compareToPeriodId: values.compareToPeriodId } : {})
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      setSelectedPeriodId(created.id);
    }
  });

  const periodDetailsQuery = useQuery({
    enabled: Boolean(selectedPeriodId),
    queryKey: ["period-details", auth.token, selectedPeriodId],
    queryFn: () => api.getPeriodDetails(auth.token, selectedPeriodId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Roleplay verileri
  const roleplayQuery = useQuery({
    enabled: Boolean(selectedPeriodId),
    queryKey: ["roleplay-metrics", auth.token, selectedPeriodId],
    queryFn: () => api.getRoleplayMetrics(auth.token, selectedPeriodId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Değerlendirme soruları
  const evaluationQuery = useQuery({
    enabled: Boolean(selectedPeriodId),
    queryKey: ["evaluation-questions", auth.token, selectedPeriodId],
    queryFn: () => api.getEvaluationQuestions(auth.token, selectedPeriodId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Satış toplantıları
  const meetingsQuery = useQuery({
    enabled: Boolean(selectedPeriodId),
    queryKey: ["sales-meetings", auth.token, selectedPeriodId],
    queryFn: () => api.getSalesMeetings(auth.token, selectedPeriodId)
  });

  // KPI verileri
  const kpiDataQuery = useQuery({
    enabled: Boolean(selectedPeriodId),
    queryKey: ["sales-kpi", auth.token, selectedPeriodId],
    queryFn: () => api.getSalesKpiData(auth.token, selectedPeriodId)
  });

  // Tüm satış dönemlerindeki KPI verilerinden temsilci listesi (dönem bağımsız)
  const allSalesAgentsQuery = useQuery({
    enabled: salesPeriods.length > 0,
    queryKey: ["all-sales-agents", auth.token, salesPeriods.map((p) => p.id).join(",")],
    queryFn: async () => {
      const agents = new Map<string, string>();
      for (const period of salesPeriods) {
        try {
          const kpi = await api.getSalesKpiData(auth.token, period.id);
          if (kpi?.agents) {
            for (const agent of kpi.agents) {
              const key = agent.agentKey || normalizeKey(agent.agentName);
              if (key && !agents.has(key)) agents.set(key, agent.agentName);
            }
          }
        } catch { /* Dönem verisi okunamazsa atla */ }
      }
      return Array.from(agents.entries()).map(([key, name]) => ({ key, name }));
    },
    staleTime: 10 * 60 * 1000
  });

  const filteredSalesReps = useMemo(() => {
    const registered = (representativesQuery.data ?? []).filter((r) => r.department === "sales" || r.department === "partner");
    const registeredKeys = new Set(registered.map((r) => r.key));

    // KPI verilerindeki temsilcileri de dahil et (tüm dönemlerden, dönem bağımsız)
    const now = new Date().toISOString();
    const derived: Representative[] = [];
    for (const agent of allSalesAgentsQuery.data ?? []) {
      if (!registeredKeys.has(agent.key)) {
        registeredKeys.add(agent.key);
        derived.push({
          key: agent.key,
          displayName: agent.name,
          department: "sales",
          status: "active",
          badges: [],
          timeline: [],
          createdAt: now,
          updatedAt: now
        });
      }
    }

    let reps = [...registered, ...derived];
    if (repStatusFilter !== "all") reps = reps.filter((r) => r.status === repStatusFilter);
    return reps;
  }, [representativesQuery.data, allSalesAgentsQuery.data, repStatusFilter]);

  const selectedRep = filteredSalesReps.find((r) => r.key === selectedRepKey) ?? null;

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
            <select
              className="rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
              value={row.original.status}
              onChange={(e) =>
                updateRepresentativeStatusMutation.mutate({ key: row.original.key, status: e.target.value })
              }
            >
              <option value="active">Aktif</option>
              <option value="departed">Ayrıldı</option>
              <option value="department_changed">Departman Değişti</option>
            </select>
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

  // Dönem değişince mevcut audit satırlarını yükle
  const auditLoadedPeriodRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedPeriodId) return;
    if (auditLoadedPeriodRef.current === selectedPeriodId) return;
    if (periodDetailsQuery.isFetching) return;

    auditLoadedPeriodRef.current = selectedPeriodId;
    const auditMetrics = periodDetailsQuery.data?.datasets.auditMetrics ?? [];
    if (auditMetrics.length > 0) {
      setAuditRows(
        auditMetrics.map((row) => ({
          id: row.id,
          agentName: row.agentName,
          auditScore: row.auditScore != null ? String(row.auditScore) : ""
        }))
      );
    } else {
      // Kayıtlı veri yoksa aktif satış temsilcilerini otomatik doldur
      const activeReps = (representativesQuery.data ?? [])
        .filter((r) => (r.department === "sales" || r.department === "partner") && r.status === "active")
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
      if (activeReps.length > 0) {
        setAuditRows(activeReps.map((rep) => ({
          id: generateId(),
          agentName: rep.displayName,
          auditScore: ""
        })));
      } else {
        setAuditRows([{ id: generateId(), agentName: "", auditScore: "" }]);
      }
    }
  }, [periodDetailsQuery.data, periodDetailsQuery.isFetching, selectedPeriodId]);

  // Dönem değişince mevcut roleplay satırlarını yükle
  const roleplayLoadedPeriodRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedPeriodId) return;
    if (roleplayLoadedPeriodRef.current === selectedPeriodId) return;
    if (roleplayQuery.isFetching) return;

    roleplayLoadedPeriodRef.current = selectedPeriodId;
    const metrics = roleplayQuery.data ?? [];
    if (metrics.length > 0) {
      setRoleplayRows(
        metrics.map((row) => ({
          id: generateId(),
          agentName: row.agentName,
          rolePlayCount: String(row.rolePlayCount),
          revOpsCount: row.revOpsCount != null ? String(row.revOpsCount) : "",
          note: row.note ?? ""
        }))
      );
    } else {
      const activeReps = (representativesQuery.data ?? [])
        .filter((r) => (r.department === "sales" || r.department === "partner") && r.status === "active")
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
      if (activeReps.length > 0) {
        setRoleplayRows(activeReps.map((rep) => ({
          id: generateId(),
          agentName: rep.displayName,
          rolePlayCount: "",
          revOpsCount: "",
          note: ""
        })));
      } else {
        setRoleplayRows([{ id: generateId(), agentName: "", rolePlayCount: "", revOpsCount: "", note: "" }]);
      }
    }
  }, [roleplayQuery.data, roleplayQuery.isFetching, selectedPeriodId]);

  // Dönem değişince mevcut değerlendirme sorularını yükle
  const evaluationLoadedPeriodRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedPeriodId) return;
    if (evaluationLoadedPeriodRef.current === selectedPeriodId) return;
    if (evaluationQuery.isFetching) return;

    evaluationLoadedPeriodRef.current = selectedPeriodId;
    const questions = evaluationQuery.data ?? [];
    if (questions.length > 0) {
      setEvaluationRows(
        questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          answer: q.answer ?? "",
          score: String(q.score)
        }))
      );
    } else {
      setEvaluationRows([{ id: generateId(), questionText: "", answer: "", score: "" }]);
    }
  }, [evaluationQuery.data, evaluationQuery.isFetching, selectedPeriodId]);

  // Yıl/ay değişince mevcut dönemi bul
  useEffect(() => {
    if (!periodsQuery.data) {
      return;
    }

    const matched = salesPeriods.find((p) => p.month === activePeriodMonth);
    if (matched && matched.id !== selectedPeriodId) {
      setSelectedPeriodId(matched.id);
    } else if (!matched) {
      setSelectedPeriodId("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePeriodMonth, periodsQuery.data]);

  /* ── Audit kaydetme ── */
  const saveAuditMutation = useMutation({
    mutationFn: async () => {
      if (!firebaseDb) throw new Error("Firebase bağlantısı yok.");
      const validRows = auditRows.filter((row) => row.agentName.trim());
      if (validRows.length === 0) {
        throw new Error("En az bir temsilci satırı doldurun.");
      }

      let periodId = selectedPeriodId;
      if (!periodId) {
        const compareToPeriodId = salesPeriods.find((p) => p.month === getPreviousMonth(activePeriodMonth))?.id;
        const created = await api.createPeriod(auth.token, {
          month: activePeriodMonth,
          title: formatSalesPeriodTitle(activePeriodMonth),
          department: "sales",
          ...(compareToPeriodId ? { compareToPeriodId } : {})
        });
        periodId = created.id;
        setSelectedPeriodId(periodId);
      }

      for (const row of validRows) {
        const agentKey = normalizeKey(row.agentName.trim());
        const scoreStr = row.auditScore.trim().replace(/\s/g, "").replace(",", ".");
        const score = scoreStr ? Number(scoreStr) : null;
        await setDoc(doc(firebaseDb, "reportPeriods", periodId, "auditMetrics", agentKey), {
          id: agentKey,
          period: activePeriodMonth,
          agentKey,
          agentName: row.agentName.trim(),
          auditScore: Number.isFinite(score) ? score : null,
          previousAuditAccuracy: null
        });
      }
    },
    onSuccess: async () => {
      auditLoadedPeriodRef.current = undefined;
      await queryClient.invalidateQueries({ queryKey: ["periods", auth.token] });
      await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setAuditSaveSuccess(true);
      setTimeout(() => setAuditSaveSuccess(false), 3000);
    }
  });

  /* ── Role-Play kaydetme ── */
  const saveRoleplayMutation = useMutation({
    mutationFn: async () => {
      const validRows = roleplayRows.filter((row) => row.agentName.trim());
      if (validRows.length === 0) {
        throw new Error("En az bir temsilci satırı doldurun.");
      }

      // Dönem yoksa önce oluştur
      let periodId = selectedPeriodId;
      if (!periodId) {
        const compareToPeriodId = salesPeriods.find((p) => p.month === getPreviousMonth(activePeriodMonth))?.id;
        const created = await api.createPeriod(auth.token, {
          month: activePeriodMonth,
          title: formatSalesPeriodTitle(activePeriodMonth),
          department: "sales",
          ...(compareToPeriodId ? { compareToPeriodId } : {})
        });
        periodId = created.id;
        setSelectedPeriodId(periodId);
      }

      const entries = validRows.map((row) => ({
        agentKey: normalizeKey(row.agentName.trim()),
        agentName: row.agentName.trim(),
        rolePlayCount: row.rolePlayCount ? Number(row.rolePlayCount) : 0,
        revOpsCount: row.revOpsCount ? Number(row.revOpsCount) : null,
        ...(row.note.trim() ? { note: row.note.trim() } : {})
      }));

      await api.saveRoleplayMetrics(auth.token, periodId, entries);
      return periodId;
    },
    onSuccess: async (savedPeriodId) => {
      roleplayLoadedPeriodRef.current = undefined;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["roleplay-metrics"] }),
        queryClient.invalidateQueries({ queryKey: ["periods", auth.token] }),
        queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, savedPeriodId] })
      ]);
      setRoleplaySaveSuccess(true);
      setTimeout(() => setRoleplaySaveSuccess(false), 3000);
    }
  });

  /* ── Değerlendirme soruları kaydetme ── */
  const saveEvaluationMutation = useMutation({
    mutationFn: async () => {
      const validRows = evaluationRows.filter((row) => row.questionText.trim());
      if (validRows.length === 0) {
        throw new Error("En az bir soru satırı doldurun.");
      }

      let periodId = selectedPeriodId;
      if (!periodId) {
        const compareToPeriodId = salesPeriods.find((p) => p.month === getPreviousMonth(activePeriodMonth))?.id;
        const created = await api.createPeriod(auth.token, {
          month: activePeriodMonth,
          title: formatSalesPeriodTitle(activePeriodMonth),
          department: "sales",
          ...(compareToPeriodId ? { compareToPeriodId } : {})
        });
        periodId = created.id;
        setSelectedPeriodId(periodId);
      }

      const entries = validRows.map((row) => ({
        id: row.id,
        questionText: row.questionText.trim(),
        answer: row.answer.trim(),
        score: row.score ? (parseTurkishNumber(row.score) ?? 0) : 0
      }));

      await api.saveEvaluationQuestions(auth.token, periodId, entries);
      return periodId;
    },
    onSuccess: async (savedPeriodId) => {
      evaluationLoadedPeriodRef.current = undefined;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["evaluation-questions"] }),
        queryClient.invalidateQueries({ queryKey: ["periods", auth.token] }),
        queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, savedPeriodId] })
      ]);
      setEvaluationSaveSuccess(true);
      setTimeout(() => setEvaluationSaveSuccess(false), 3000);
    }
  });

  /* ── Çeyreklik CSV'den audit satırlarını doldur ── */
  const handleAuditCsvImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const rows = parseCsvRows(text);
      const report = parseQuarterlyReport(rows, selectedYear);

      // Seçili ay için sütun indeksini bul
      const mi = report.months.indexOf(activePeriodMonth);
      if (mi === -1) {
        alert(`CSV dosyasında ${formatLongMonth(activePeriodMonth)} ayı bulunamadı. Bulunan aylar: ${report.months.map(formatLongMonth).join(", ")}`);
        return;
      }

      // Audit satırlarını doldur
      const newRows: AuditEntryRow[] = [];
      for (const entry of report.audit.values()) {
        const score = entry.scores[mi];
        newRows.push({
          id: generateId(),
          agentName: entry.agentName,
          auditScore: score != null ? String(score) : ""
        });
      }
      if (newRows.length > 0) {
        setAuditRows(newRows);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  /* ── Çeyreklik CSV'den roleplay satırlarını doldur ── */
  const handleRoleplayCsvImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const rows = parseCsvRows(text);
      const report = parseQuarterlyReport(rows, selectedYear);

      const mi = report.months.indexOf(activePeriodMonth);
      if (mi === -1) {
        alert(`CSV dosyasında ${formatLongMonth(activePeriodMonth)} ayı bulunamadı. Bulunan aylar: ${report.months.map(formatLongMonth).join(", ")}`);
        return;
      }

      // IS roleplay + RevOPS birleştir
      const rpMap = new Map<string, { agentName: string; rolePlayCount: string; revOpsCount: string }>();
      for (const [key, entry] of report.roleplay) {
        const count = entry.counts[mi];
        rpMap.set(key, {
          agentName: entry.agentName,
          rolePlayCount: count != null ? String(count) : "0",
          revOpsCount: ""
        });
      }
      for (const [key, entry] of report.revops) {
        const count = entry.counts[mi];
        const existing = rpMap.get(key);
        if (existing) {
          existing.revOpsCount = count != null ? String(count) : "0";
        } else {
          rpMap.set(key, {
            agentName: entry.agentName,
            rolePlayCount: "0",
            revOpsCount: count != null ? String(count) : "0"
          });
        }
      }

      if (rpMap.size > 0) {
        const newRows: RoleplayEntryRow[] = Array.from(rpMap.values()).map((val) => ({
          id: generateId(),
          agentName: val.agentName,
          rolePlayCount: val.rolePlayCount,
          revOpsCount: val.revOpsCount,
          note: ""
        }));
        setRoleplayRows(newRows);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  /* ── Tek not kaydetme (modal'dan) ── */
  const saveNoteMutation = useMutation({
    mutationFn: async ({ agentKey, note }: { agentKey: string; note: string }) => {
      if (!selectedPeriodId) return;
      const currentData = roleplayQuery.data ?? [];
      if (currentData.length === 0) return;
      const entries = currentData.map((entry: any) => ({
        agentKey: entry.agentKey,
        agentName: entry.agentName,
        rolePlayCount: entry.rolePlayCount,
        revOpsCount: entry.revOpsCount ?? null,
        ...(entry.agentKey === agentKey
          ? (note.trim() ? { note: note.trim() } : {})
          : (entry.note ? { note: entry.note } : {}))
      }));
      await api.saveRoleplayMetrics(auth.token, selectedPeriodId, entries);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roleplay-metrics"] });
    }
  });

  /* ── Satış toplantıları CSV import ── */
  const saveMeetingsMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const parsedRows = parseCsvRows(text);

      // Dönem yoksa önce oluştur
      let periodId = selectedPeriodId;
      if (!periodId) {
        const compareToPeriodId = salesPeriods.find((p) => p.month === getPreviousMonth(activePeriodMonth))?.id;
        const created = await api.createPeriod(auth.token, {
          month: activePeriodMonth,
          title: formatSalesPeriodTitle(activePeriodMonth),
          department: "sales",
          ...(compareToPeriodId ? { compareToPeriodId } : {})
        });
        periodId = created.id;
        setSelectedPeriodId(periodId);
      }

      const meetings: {
        periodId: string;
        date?: string;
        qualityMember: string;
        salesRepresentative: string;
        customerName: string;
        status?: "devam_ediyor" | "kapandi" | "kaybedildi";
        licenseDetail?: string;
        licenseAmount?: number | null;
        lossReason?: string;
        lossNote?: string;
      }[] = [];

      for (let i = 1; i < parsedRows.length; i++) {
        const cols = parsedRows[i]!;
        // CSV: Tarih, Süreç Danışmanı, HS Kaydı, Süreç Takibi, Lisan Detayı, Lisans Tutarı, Kayıp Sebebi, Kayıp Notu
        const date = cols[0]?.trim() ?? "";
        const advisorRaw = cols[1]?.trim() ?? "";
        const customer = cols[2]?.trim() ?? "";
        const statusRaw = cols[3]?.trim() ?? "";
        const licenseDetail = cols[4]?.trim() ?? "";
        const licenseAmountRaw = cols[5]?.trim() ?? "";
        const lossReasonRaw = cols[6]?.trim() ?? "";
        const lossNoteRaw = cols[7]?.trim() ?? "";

        if (!customer && !advisorRaw) continue;

        // "Çağrı / Aslıhan GÜNDÜZ" veya "Yavuz / Emre Uzunoğlu" formatını parse et
        let qualityMember = "";
        let salesRep = "";
        if (advisorRaw.includes("/")) {
          const parts = advisorRaw.split("/").map((s) => s.trim());
          qualityMember = parts[0] ?? "";
          salesRep = parts[1] ?? "";
        } else {
          qualityMember = advisorRaw;
        }

        // Tarih formatı: DD.MM.YYYY -> YYYY-MM-DD
        let formattedDate: string | undefined;
        if (date && date.includes(".")) {
          const [day, month, year] = date.split(".");
          if (day && month && year) {
            formattedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
          }
        }

        // Durum
        const statusLower = statusRaw.toLocaleLowerCase("tr-TR");
        let status: "devam_ediyor" | "kapandi" | "kaybedildi" | undefined;
        if (statusLower === "kapandı" || statusLower === "kapandi") status = "kapandi";
        else if (statusLower === "kaybedildi") status = "kaybedildi";
        else if (statusLower.includes("devam")) status = "devam_ediyor";

        // Tutar parse: "179.976,00 TRY" -> 179976.00
        let licenseAmount: number | null = null;
        if (licenseAmountRaw) {
          const cleaned = licenseAmountRaw.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
          const parsed = Number.parseFloat(cleaned);
          if (!Number.isNaN(parsed)) licenseAmount = parsed;
        }

        meetings.push({
          periodId,
          qualityMember,
          salesRepresentative: salesRep,
          customerName: customer,
          licenseAmount,
          ...(formattedDate ? { date: formattedDate } : {}),
          ...(status ? { status } : {}),
          ...(licenseDetail ? { licenseDetail } : {}),
          ...(status === "kaybedildi" && lossReasonRaw ? { lossReason: lossReasonRaw } : {}),
          ...(status === "kaybedildi" && lossNoteRaw ? { lossNote: lossNoteRaw } : {})
        });
      }

      if (meetings.length === 0) {
        throw new Error("CSV dosyasında geçerli toplantı verisi bulunamadı.");
      }

      await api.saveSalesMeetings(auth.token, periodId, meetings);
      return periodId;
    },
    onSuccess: async (savedPeriodId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sales-meetings"] }),
        queryClient.invalidateQueries({ queryKey: ["periods", auth.token] }),
        queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, savedPeriodId] })
      ]);
      setMeetingsImportSuccess(true);
      setTimeout(() => setMeetingsImportSuccess(false), 3000);
    }
  });

  /* ── KPI CSV import ── */
  const saveKpiMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const parsedRows = parseCsvRows(text);

      if (parsedRows.length < 3) {
        throw new Error("CSV dosyasında yeterli veri bulunamadı. En az başlık, hedef ve bir temsilci satırı olmalı.");
      }

      // Dönem yoksa oluştur
      let periodId = selectedPeriodId;
      if (!periodId) {
        const compareToPeriodId = salesPeriods.find((p) => p.month === getPreviousMonth(activePeriodMonth))?.id;
        const created = await api.createPeriod(auth.token, {
          month: activePeriodMonth,
          title: formatSalesPeriodTitle(activePeriodMonth),
          department: "sales",
          ...(compareToPeriodId ? { compareToPeriodId } : {})
        });
        periodId = created.id;
        setSelectedPeriodId(periodId);
      }

      // Hedef satırı (row 1, columns 1-7)
      const targetRow = parsedRows[1]!;
      const talkDurationLabel = (targetRow[5] ?? "").trim();
      const targets = {
        perfScore: parseTurkishNumber(targetRow[1] ?? "") ?? 0,
        salesAmount: parseTurkishNumber(targetRow[2] ?? "") ?? 0,
        licenseCount: parseTurkishNumber(targetRow[3] ?? "") ?? 0,
        avgLicensePrice: parseTurkishNumber(targetRow[4] ?? "") ?? 0,
        talkDurationLabel,
        talkDurationTargetSeconds: parseTalkDurationLabelToSeconds(talkDurationLabel),
        callAttempts: parseTurkishNumber(targetRow[6] ?? "") ?? 0,
        conversionRate: parseTurkishNumber(targetRow[7] ?? "") ?? 0
      };

      // ── Tablo 1: Ana KPI temsilci satırları (row 2+, ORTALAMA/TOPLAM'a kadar) ──
      const agents: {
        agentKey: string;
        agentName: string;
        perfScore: number | null;
        salesAmount: number;
        licenseCount: number;
        avgLicensePrice: number;
        talkDurationSeconds: number;
        callAttempts: number;
        conversionRate: number;
        scaleCount: number;
        scalePlusCount: number;
        scaleConversion: number;
        scalePlusConversion: number;
        totalConversion: number;
      }[] = [];

      for (let i = 2; i < parsedRows.length; i++) {
        const cols = parsedRows[i]!;
        const name = (cols[0] ?? "").trim();

        if (!name || name.toLocaleUpperCase("tr-TR") === "ORTALAMA" || name.toLocaleUpperCase("tr-TR") === "TOPLAM") {
          break;
        }

        agents.push({
          agentKey: normalizeKey(name),
          agentName: name,
          perfScore: (cols[1] ?? "").trim() === "*" ? null : parseTurkishNumber(cols[1] ?? ""),
          salesAmount: parseTurkishNumber(cols[2] ?? "") ?? 0,
          licenseCount: parseTurkishNumber(cols[3] ?? "") ?? 0,
          avgLicensePrice: parseTurkishNumber(cols[4] ?? "") ?? 0,
          talkDurationSeconds: parseHmsToSeconds(cols[5] ?? ""),
          callAttempts: parseTurkishNumber(cols[6] ?? "") ?? 0,
          conversionRate: parseTurkishNumber(cols[7] ?? "") ?? 0,
          scaleCount: 0,
          scalePlusCount: 0,
          scaleConversion: 0,
          scalePlusConversion: 0,
          totalConversion: 0
        });
      }

      if (agents.length === 0) {
        throw new Error("CSV dosyasında geçerli temsilci verisi bulunamadı.");
      }

      // ── Tablo 2: 2+1 Dönüşüm verileri (Scale 2+1 başlığını bul) ──
      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i]!;
        const cell1 = (row[1] ?? "").trim().toLocaleUpperCase("tr-TR");
        if (cell1 === "SCALE 2+1") {
          // Başlık satırı bulundu, sonraki satırlardan temsilci verilerini oku
          for (let j = i + 1; j < parsedRows.length; j++) {
            const cols = parsedRows[j]!;
            const name = (cols[0] ?? "").trim();
            if (!name) break;
            const agentKey = normalizeKey(name);
            const agent = agents.find((a) => a.agentKey === agentKey);
            if (agent) {
              agent.scaleCount = parseTurkishNumber(cols[1] ?? "") ?? 0;
              agent.scaleConversion = parseTurkishNumber(cols[2] ?? "") ?? 0;
              agent.scalePlusCount = parseTurkishNumber(cols[3] ?? "") ?? 0;
              agent.scalePlusConversion = parseTurkishNumber(cols[4] ?? "") ?? 0;
              agent.totalConversion = parseTurkishNumber(cols[5] ?? "") ?? 0;
            }
          }
          break;
        }
      }

      // ── Tablo 3: Aylık lisans özeti (Pre., Scale, Scale 2+1, Scale Plus, Scale Plus 2+1) ──
      let licenseSummary: { preCount: number; scaleCount: number; scale2Plus1Count: number; scalePlusCount: number; scalePlus2Plus1Count: number } | undefined;
      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i]!;
        const cell1 = (row[1] ?? "").trim().toLocaleUpperCase("tr-TR");
        if (cell1 === "PRE." || cell1 === "PRE") {
          // Bu satırdan 5 satır boyunca oku
          const preRow = parsedRows[i];
          const scaleRow = parsedRows[i + 1];
          const scale21Row = parsedRows[i + 2];
          const scalePlusRow = parsedRows[i + 3];
          const scalePlus21Row = parsedRows[i + 4];

          const parseCount = (raw: string) => {
            const cleaned = raw.replace(/\//g, "").trim();
            return parseTurkishNumber(cleaned) ?? 0;
          };

          licenseSummary = {
            preCount: parseCount(preRow?.[5] ?? preRow?.[4] ?? "0"),
            scaleCount: parseCount(scaleRow?.[5] ?? scaleRow?.[4] ?? "0"),
            scale2Plus1Count: parseCount(scale21Row?.[5] ?? scale21Row?.[4] ?? "0"),
            scalePlusCount: parseCount(scalePlusRow?.[5] ?? scalePlusRow?.[4] ?? "0"),
            scalePlus2Plus1Count: parseCount(scalePlus21Row?.[5] ?? scalePlus21Row?.[4] ?? "0")
          };
          break;
        }
      }

      const now = new Date().toISOString();
      const savePayload: Record<string, unknown> = { targets, agents, updatedAt: now };
      if (licenseSummary) savePayload.licenseSummary = licenseSummary;
      await api.saveSalesKpiData(auth.token, periodId, savePayload as any);
      return periodId;
    },
    onSuccess: async (savedPeriodId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sales-kpi"] }),
        queryClient.invalidateQueries({ queryKey: ["periods", auth.token] }),
        queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, savedPeriodId] })
      ]);
      setKpiImportSuccess(true);
      setTimeout(() => setKpiImportSuccess(false), 3000);
    }
  });

  /* ── Tekil silme/güncelleme mutasyonları ── */

  const deleteRoleplayRecordMutation = useMutation({
    mutationFn: (agentKey: string) => api.deleteRoleplayMetric(auth.token, selectedPeriodId, agentKey),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["roleplay-metrics"] }); }
  });

  const updateRoleplayRecordMutation = useMutation({
    mutationFn: ({ agentKey, updates }: { agentKey: string; updates: Record<string, unknown> }) =>
      api.updateRoleplayMetric(auth.token, selectedPeriodId, agentKey, updates),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["roleplay-metrics"] }); }
  });

  const deleteEvaluationRecordMutation = useMutation({
    mutationFn: (id: string) => api.deleteEvaluationQuestion(auth.token, selectedPeriodId, id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["evaluation-questions"] }); }
  });

  const updateEvaluationRecordMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) =>
      api.updateEvaluationQuestion(auth.token, selectedPeriodId, id, updates),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["evaluation-questions"] }); }
  });

  const createMeetingMutation = useMutation({
    mutationFn: (meeting: Omit<SalesMeeting, "id" | "periodId" | "createdAt" | "updatedAt">) =>
      api.createSalesMeeting(auth.token, selectedPeriodId, meeting),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sales-meetings"] }); }
  });

  const updateMeetingMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) =>
      api.updateSalesMeeting(auth.token, selectedPeriodId, id, updates),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sales-meetings"] }); }
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: (id: string) => api.deleteSalesMeeting(auth.token, selectedPeriodId, id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sales-meetings"] }); }
  });

  const deleteAllMeetingsMutation = useMutation({
    mutationFn: () => api.saveSalesMeetings(auth.token, selectedPeriodId, []),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sales-meetings"] }); }
  });

  const addKpiAgentMutation = useMutation({
    mutationFn: (agent: { agentName: string; perfScore: number | null; salesAmount: number; licenseCount: number; avgLicensePrice: number; talkDurationSeconds: number; callAttempts: number; conversionRate: number }) =>
      api.addKpiAgent(auth.token, selectedPeriodId, agent),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sales-kpi"] }); }
  });

  const updateKpiAgentMutation = useMutation({
    mutationFn: ({ agentKey, updates }: { agentKey: string; updates: Record<string, unknown> }) =>
      api.updateKpiAgent(auth.token, selectedPeriodId, agentKey, updates),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sales-kpi"] }); }
  });

  const deleteKpiAgentMutation = useMutation({
    mutationFn: (agentKey: string) => api.deleteKpiAgent(auth.token, selectedPeriodId, agentKey),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sales-kpi"] }); }
  });

  const resetKpiAgentsMutation = useMutation({
    mutationFn: () => api.resetKpiAgents(auth.token, selectedPeriodId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sales-kpi"] }); }
  });

  const updateKpiTargetsMutation = useMutation({
    mutationFn: (targets: Record<string, unknown>) => api.updateKpiTargets(auth.token, selectedPeriodId, targets),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sales-kpi"] }); }
  });

  const updateLicenseSummaryMutation = useMutation({
    mutationFn: (summary: { preCount: number; scaleCount: number; scale2Plus1Count: number; scalePlusCount: number; scalePlus2Plus1Count: number }) =>
      api.updateLicenseSummary(auth.token, selectedPeriodId, summary),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sales-kpi"] }); }
  });

  const refreshCurrentView = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["periods", auth.token] }),
      queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] }),
      queryClient.invalidateQueries({ queryKey: ["roleplay-metrics", auth.token, selectedPeriodId] }),
      queryClient.invalidateQueries({ queryKey: ["evaluation-questions", auth.token, selectedPeriodId] }),
      queryClient.invalidateQueries({ queryKey: ["sales-meetings", auth.token, selectedPeriodId] }),
      queryClient.invalidateQueries({ queryKey: ["sales-kpi", auth.token, selectedPeriodId] })
    ]);
  };

  /* ── Audit satır işlemleri ── */
  const addAuditRow = () =>
    setAuditRows((prev) => [...prev, { id: generateId(), agentName: "", auditScore: "" }]);
  const removeAuditRow = (id: string) =>
    setAuditRows((prev) => prev.filter((row) => row.id !== id));
  const updateAuditRow = (id: string, field: keyof AuditEntryRow, value: string) =>
    setAuditRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));

  /* ── Evaluation satır işlemleri ── */
  const addEvaluationRow = () =>
    setEvaluationRows((prev) => [...prev, { id: generateId(), questionText: "", answer: "", score: "" }]);
  const removeEvaluationRow = (id: string) =>
    setEvaluationRows((prev) => prev.filter((row) => row.id !== id));
  const updateEvaluationRow = (id: string, field: keyof EvaluationEntryRow, value: string) =>
    setEvaluationRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));

  const handleEvaluationCsvImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const rows: EvaluationEntryRow[] = [];
      // CSV'deki çok satırlı alanları düzgün parse et
      const parsedRows = parseCsvRows(text);

      for (let i = 1; i < parsedRows.length; i++) {
        const cols = parsedRows[i]!;
        const score = cols[0]?.trim() ?? "";
        const question = cols[2]?.trim() ?? "";
        const answer = cols[3]?.trim() ?? "";

        // Boş satırları ve sadece puan olan satırları (toplam satırı gibi) atla
        if (!question) continue;

        rows.push({
          id: generateId(),
          questionText: question,
          answer,
          score: score || "0"
        });
      }

      if (rows.length > 0) {
        setEvaluationRows(rows);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  /* ── Roleplay satır işlemleri ── */
  const addRoleplayRow = () =>
    setRoleplayRows((prev) => [...prev, { id: generateId(), agentName: "", rolePlayCount: "", revOpsCount: "", note: "" }]);
  const removeRoleplayRow = (id: string) =>
    setRoleplayRows((prev) => prev.filter((row) => row.id !== id));
  const updateRoleplayRow = (id: string, field: keyof RoleplayEntryRow, value: string) =>
    setRoleplayRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));

  /* ── Mevcut temsilci listesi (audit + roleplay) ── */
  const availableAgents = useMemo(() => {
    const names = new Map<string, string>();
    // Temsilciler listesindeki aktif satış temsilcileri
    const reps = (representativesQuery.data ?? []).filter((r) => (r.department === "sales" || r.department === "partner") && r.status === "active");
    for (const rep of reps) {
      names.set(rep.key, rep.displayName);
    }
    const auditMetrics = periodDetailsQuery.data?.datasets.auditMetrics ?? [];
    for (const row of auditMetrics) {
      if (!names.has(normalizeKey(row.agentName))) {
        names.set(normalizeKey(row.agentName), row.agentName);
      }
    }
    const rpMetrics = roleplayQuery.data ?? [];
    for (const row of rpMetrics) {
      if (!names.has(row.agentKey)) {
        names.set(row.agentKey, row.agentName);
      }
    }
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, "tr"));
  }, [representativesQuery.data, periodDetailsQuery.data, roleplayQuery.data]);

  const validAuditRowCount = auditRows.filter((r) => r.agentName.trim()).length;
  const validRoleplayRowCount = roleplayRows.filter((r) => r.agentName.trim()).length;
  const validEvaluationRowCount = evaluationRows.filter((r) => r.questionText.trim()).length;

  const meetingsCount = meetingsQuery.data?.length ?? 0;
  const kpiAgentCount = kpiDataQuery.data?.agents.length ?? 0;

  const isSaving = activeSection === "audit"
    ? saveAuditMutation.isPending
    : activeSection === "roleplay"
      ? saveRoleplayMutation.isPending
      : activeSection === "evaluation"
        ? saveEvaluationMutation.isPending
        : activeSection === "kpi"
          ? saveKpiMutation.isPending
          : saveMeetingsMutation.isPending;
  const validRowCount = activeSection === "audit"
    ? validAuditRowCount
    : activeSection === "roleplay"
      ? validRoleplayRowCount
      : activeSection === "evaluation"
        ? validEvaluationRowCount
        : activeSection === "kpi"
          ? kpiAgentCount
          : meetingsCount;

  const currentStatusLabel = createPeriodMutation.isPending
    ? "Hazırlanıyor"
    : selectedPeriod?.status === "published"
      ? "Yayında"
      : "Taslak";
  const currentStatusTone = selectedPeriod?.status === "published" ? "success" : "neutral";

  const handleSave = () => {
    if (activeSection === "audit") {
      saveAuditMutation.mutate();
    } else if (activeSection === "roleplay") {
      saveRoleplayMutation.mutate();
    } else {
      saveEvaluationMutation.mutate();
    }
  };

  const sectionMeta: Record<AdminSection, { label: string; description: string; icon: ReactNode }> = {
    audit: { label: "Audit Girişi", description: "Temsilci bazlı audit skorlarını CSV ile veya manuel ekleyin.", icon: <ClipboardCheck size={14} /> },
    roleplay: { label: "Role-Play Girişi", description: "Role-play ve RevOps çalışma sayıları ile notları yönetin.", icon: <Play size={14} /> },
    evaluation: { label: "Değerlendirme Soruları", description: "Dönem değerlendirme sorularını ve cevap skorlarını tanımlayın.", icon: <FileQuestion size={14} /> },
    kpi: { label: "KPI Verileri", description: "Hedefler, temsilci performans verileri ve lisans özetini yönetin.", icon: <Target size={14} /> },
    meetings: { label: "Satış Toplantıları", description: "Toplantı listesini yönetin; CSV import ve satır düzenleme.", icon: <Handshake size={14} /> },
    representatives: { label: "Temsilciler", description: "Satış ve partner temsilcilerini yönetin.", icon: <Users size={14} /> },
    ramp: { label: "RAMP Girişi", description: "Yeni katılan temsilciler için RAMP dönemini yönetin.", icon: <TrendingUp size={14} /> }
  };

  const activeMeta = sectionMeta[activeSection];

  const navGroups: AdminNavGroup[] = [
    {
      id: "evaluation",
      label: "Değerlendirme",
      items: (["audit", "roleplay", "evaluation"] as const).map((id) => ({
        id,
        label: sectionMeta[id].label,
        description: sectionMeta[id].description,
        icon: sectionMeta[id].icon,
        active: activeSection === id,
        onClick: () => setActiveSection(id)
      }))
    },
    {
      id: "performance",
      label: "Performans & Operasyon",
      items: (["kpi", "meetings"] as const).map((id) => ({
        id,
        label: sectionMeta[id].label,
        description: sectionMeta[id].description,
        icon: sectionMeta[id].icon,
        active: activeSection === id,
        onClick: () => setActiveSection(id)
      }))
    },
    {
      id: "team",
      label: "Takım",
      items: (["representatives", "ramp"] as const).map((id) => ({
        id,
        label: sectionMeta[id].label,
        description: sectionMeta[id].description,
        icon: sectionMeta[id].icon,
        active: activeSection === id,
        onClick: () => setActiveSection(id)
      }))
    }
  ];

  const showSaveAction = activeSection === "audit" || activeSection === "roleplay" || activeSection === "evaluation";

  const sidebarHeader = (
    <div className="space-y-3">
      <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
        {auth.user?.email ?? "Yerel yönetim erişimi"}
      </p>
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
  );

  const sidebarFooter = (
    <button
      className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 transition hover:text-slate-900 dark:hover:text-slate-200"
      onClick={() => void auth.logout()}
      type="button"
    >
      <LogOut size={15} />
      Çıkış Yap
    </button>
  );

  const headerActions = (
    <>
      {showSaveAction ? (
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-slate-950 dark:bg-slate-100 px-4 text-sm font-semibold text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isSaving || validRowCount === 0}
          onClick={handleSave}
          type="button"
        >
          <Save size={14} />
          {isSaving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      ) : null}
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-slate-300 dark:hover:border-slate-600"
        onClick={() => void refreshCurrentView()}
        type="button"
      >
        <RefreshCw size={14} />
        Yenile
      </button>
    </>
  );

  const headerPills = (
    <>
      <HeaderPill tone="accent">{formatPeriodChip(activePeriodMonth)}</HeaderPill>
      <HeaderPill tone="success">Manuel Giriş</HeaderPill>
      <HeaderPill tone={currentStatusTone}>{currentStatusLabel}</HeaderPill>
    </>
  );

  return (
    <AdminShell
      sidebar={
        <AdminShellSidebar
          header={sidebarHeader}
          search={{ value: sidebarQuery, onChange: setSidebarQuery, placeholder: "Bölüm ara..." }}
          groups={navGroups}
          footer={sidebarFooter}
        />
      }
    >
      <AdminShellHeader
        breadcrumb={<span>Yönetim · Satış</span>}
        title={activeMeta.label}
        description={activeMeta.description}
        pills={headerPills}
        actions={headerActions}
      />

          {/* ── Audit Bölümü ── */}
          {activeSection === "audit" ? (
            <AuditSection
              activePeriodMonth={activePeriodMonth}
              auditRows={auditRows}
              auditSaveSuccess={auditSaveSuccess}
              availableAgents={availableAgents}
              createPeriodMutation={createPeriodMutation}
              onAddRow={addAuditRow}
              onDeleteSavedRecord={(id: string) => {
                void api.deleteDatasetRecord(auth.token, selectedPeriodId, "audit-metrics", id).then(() => {
                  auditLoadedPeriodRef.current = undefined;
                  void queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
                });
              }}
              onRemoveRow={removeAuditRow}
              onUpdateRow={updateAuditRow}
              onUpdateSavedRecord={(id: string, field: string, value: string) => {
                void api.updatePeriod(auth.token, selectedPeriodId, {
                  datasetType: "audit-metrics" as any,
                  recordId: id,
                  updates: { [field]: field === "auditScore" ? Number(value) || 0 : value }
                } as any).then(() => {
                  auditLoadedPeriodRef.current = undefined;
                  void queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
                });
              }}
              periodDetailsQuery={periodDetailsQuery}
              saveAuditMutation={saveAuditMutation}
              selectedPeriod={selectedPeriod}
              validRowCount={validAuditRowCount}
              onCsvImport={handleAuditCsvImport}
            />
          ) : activeSection === "roleplay" ? (
            <RoleplaySection
              activePeriodMonth={activePeriodMonth}
              availableAgents={availableAgents}
              createPeriodMutation={createPeriodMutation}
              deleteRecordMutation={deleteRoleplayRecordMutation}
              onAddRow={addRoleplayRow}
              onRemoveRow={removeRoleplayRow}
              onUpdateRow={updateRoleplayRow}
              roleplayQuery={roleplayQuery}
              roleplayRows={roleplayRows}
              roleplaySaveSuccess={roleplaySaveSuccess}
              saveNoteMutation={saveNoteMutation}
              saveRoleplayMutation={saveRoleplayMutation}
              selectedPeriod={selectedPeriod}
              updateRecordMutation={updateRoleplayRecordMutation}
              validRowCount={validRoleplayRowCount}
              onCsvImport={handleRoleplayCsvImport}
            />
          ) : activeSection === "evaluation" ? (
            <EvaluationSection
              activePeriodMonth={activePeriodMonth}
              createPeriodMutation={createPeriodMutation}
              deleteRecordMutation={deleteEvaluationRecordMutation}
              evaluationQuery={evaluationQuery}
              evaluationRows={evaluationRows}
              evaluationSaveSuccess={evaluationSaveSuccess}
              onAddRow={addEvaluationRow}
              onCsvImport={handleEvaluationCsvImport}
              onRemoveRow={removeEvaluationRow}
              onUpdateRow={updateEvaluationRow}
              saveEvaluationMutation={saveEvaluationMutation}
              selectedPeriod={selectedPeriod}
              updateRecordMutation={updateEvaluationRecordMutation}
              validRowCount={validEvaluationRowCount}
            />
          ) : activeSection === "kpi" ? (
            <KpiSection
              activePeriodMonth={activePeriodMonth}
              addAgentMutation={addKpiAgentMutation}
              deleteAgentMutation={deleteKpiAgentMutation}
              kpiAgentCount={kpiAgentCount}
              kpiData={kpiDataQuery.data}
              kpiImportSuccess={kpiImportSuccess}
              resetAgentsMutation={resetKpiAgentsMutation}
              saveKpiMutation={saveKpiMutation}
              selectedPeriodId={selectedPeriodId}
              updateAgentMutation={updateKpiAgentMutation}
              updateLicenseSummaryMutation={updateLicenseSummaryMutation}
              updateTargetsMutation={updateKpiTargetsMutation}
            />
          ) : activeSection === "representatives" ? (
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
                  <select
                    className="rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition focus:border-primary/40 focus:outline-none"
                    value={repStatusFilter}
                    onChange={(e) => setRepStatusFilter(e.target.value as typeof repStatusFilter)}
                  >
                    <option value="all">Tüm Durumlar</option>
                    <option value="active">Aktif</option>
                    <option value="departed">Ayrıldı</option>
                    <option value="department_changed">Departman Değişti</option>
                  </select>
                </div>
              </div>
              {repDeleteError ? <ErrorBanner message={repDeleteError} prefix="Silme hatası" /> : null}
              {representativesQuery.isLoading ? (
                <EmptyBlock message="Temsilciler yükleniyor..." />
              ) : filteredSalesReps.length === 0 ? (
                <EmptyBlock message="Henüz satış temsilcisi kaydı yok. Veri içe aktarıldığında temsilciler otomatik oluşturulur." />
              ) : (
                <SurfaceCard title={`Satış Temsilcileri (${filteredSalesReps.length})`} description="Temsilci durumlarını görüntüleyin ve düzenleyin." variant="default">
                  <DataTable columns={representativeColumns} data={filteredSalesReps} density="compact" />
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
                  defaultDepartment="sales"
                  isSaving={createRepresentativeMutation.isPending}
                  onClose={() => setShowCreateRepModal(false)}
                  onSave={(data) => createRepresentativeMutation.mutate({ displayName: data.displayName!, department: data.department ?? "sales" })}
                />
              ) : null}
            </div>
          ) : activeSection === "ramp" ? (
            <RampSection selectedPeriodId={selectedPeriodId} activePeriodMonth={activePeriodMonth} kpiAgents={(kpiDataQuery.data as any)?.agents ?? []} />
          ) : (
            <MeetingsSection
              activePeriodMonth={activePeriodMonth}
              createMeetingMutation={createMeetingMutation}
              deleteMeetingMutation={deleteMeetingMutation}
              deleteAllMeetingsMutation={deleteAllMeetingsMutation}
              meetings={meetingsQuery.data ?? []}
              meetingsCount={meetingsCount}
              meetingsImportSuccess={meetingsImportSuccess}
              saveMeetingsMutation={saveMeetingsMutation}
              selectedPeriodId={selectedPeriodId}
              updateMeetingMutation={updateMeetingMutation}
            />
          )}
    </AdminShell>
  );
}

/* ── Audit Giriş Bölümü ── */

function AuditSection(props: {
  activePeriodMonth: string;
  availableAgents: string[];
  selectedPeriod: ReturnType<typeof useMemo<any>> | undefined;
  auditRows: AuditEntryRow[];
  validRowCount: number;
  auditSaveSuccess: boolean;
  createPeriodMutation: { isPending: boolean; isError: boolean; error: unknown };
  saveAuditMutation: { isPending: boolean; isError: boolean; error: unknown };
  periodDetailsQuery: { data: any; isFetching: boolean };
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, field: keyof AuditEntryRow, value: string) => void;
  onDeleteSavedRecord: (id: string) => void;
  onUpdateSavedRecord: (id: string, field: string, value: string) => void;
  onCsvImport: (file: File) => void;
}) {
  const {
    availableAgents, selectedPeriod, auditRows, validRowCount, auditSaveSuccess,
    createPeriodMutation, saveAuditMutation, periodDetailsQuery,
    onAddRow, onRemoveRow, onUpdateRow, onDeleteSavedRecord, onUpdateSavedRecord
  } = props;

  return (
    <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <HeaderPill><ClipboardCheck size={12} className="mr-1 inline-block" />Audit</HeaderPill>
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">Audit girişi</h2>
          {validRowCount > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{validRowCount} kayıt</span>}
        </div>

        {createPeriodMutation.isError ? (
          <ErrorBanner message={createPeriodMutation.error instanceof Error ? createPeriodMutation.error.message : "Bilinmeyen hata."} prefix="Dönem oluşturulamadı" />
        ) : null}

        {saveAuditMutation.isError ? (
          <ErrorBanner message={saveAuditMutation.error instanceof Error ? saveAuditMutation.error.message : "Kayıt sırasında bir hata oluştu."} />
        ) : null}

        {auditSaveSuccess ? <SuccessBanner message="Veriler başarıyla kaydedildi." /> : null}

        <SurfaceCard
          description="Her satır bir temsilciyi temsil eder. Temsilci adı dolu olan satırlar kaydedilir."
          title="Audit Skoru Girişi"
          variant="default"
        >
          {createPeriodMutation.isPending ? (
            <EmptyBlock message="Dönem hazırlanıyor..." />
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-[10px] border border-slate-200 dark:border-slate-600">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-700/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Temsilci adı</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Audit skoru</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {auditRows.map((row) => (
                      <tr key={row.id} className="bg-white dark:bg-slate-800">
                        <td className="px-4 py-2">
                          <AgentCombobox
                            agents={availableAgents}
                            onChange={(v) => onUpdateRow(row.id, "agentName", v)}
                            value={row.agentName}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className="h-11 w-32 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-primary/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
                            inputMode="decimal"
                            onChange={(e) => onUpdateRow(row.id, "auditScore", e.target.value)}
                            placeholder="0–100"
                            type="text"
                            value={row.auditScore}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <DeleteRowButton onClick={() => onRemoveRow(row.id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <AddRowButton onClick={onAddRow} />
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:border-slate-500">
                  <Upload size={13} />
                  CSV'den doldur
                  <input
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { props.onCsvImport(f); e.target.value = ""; } }}
                    type="file"
                  />
                </label>
                {selectedPeriod ? (
                  <p className="text-xs text-slate-400">{selectedPeriod.title} · {validRowCount} temsilci</p>
                ) : null}
              </div>

              {periodDetailsQuery.data?.datasets.auditMetrics && periodDetailsQuery.data.datasets.auditMetrics.length > 0 ? (
                <EditableSavedData
                  columns={["Temsilci", "Audit skoru"]}
                  rows={periodDetailsQuery.data.datasets.auditMetrics.map((row: any) => ({
                    id: row.id,
                    cells: [row.agentName, row.auditScore != null ? String(row.auditScore) : ""],
                    fields: ["agentName", "auditScore"],
                    types: ["text", "number"] as ("text" | "number")[]
                  }))}
                  onDelete={onDeleteSavedRecord}
                  onUpdate={onUpdateSavedRecord}
                />
              ) : null}
            </div>
          )}
        </SurfaceCard>
    </div>
  );
}

/* ── Role-Play Giriş Bölümü ── */

function RoleplaySection(props: {
  activePeriodMonth: string;
  availableAgents: string[];
  selectedPeriod: any;
  roleplayRows: RoleplayEntryRow[];
  validRowCount: number;
  roleplaySaveSuccess: boolean;
  createPeriodMutation: { isPending: boolean; isError: boolean; error: unknown };
  saveRoleplayMutation: { isPending: boolean; isError: boolean; error: unknown };
  saveNoteMutation: { mutate: (params: { agentKey: string; note: string }) => void; isPending: boolean };
  roleplayQuery: { data: any; isFetching: boolean };
  deleteRecordMutation: { mutate: (agentKey: string) => void; isPending: boolean };
  updateRecordMutation: { mutate: (params: { agentKey: string; updates: Record<string, unknown> }) => void; isPending: boolean };
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, field: keyof RoleplayEntryRow, value: string) => void;
  onCsvImport: (file: File) => void;
}) {
  const {
    availableAgents, selectedPeriod, roleplayRows, validRowCount, roleplaySaveSuccess,
    createPeriodMutation, saveRoleplayMutation, saveNoteMutation, roleplayQuery, deleteRecordMutation, updateRecordMutation,
    onAddRow, onRemoveRow, onUpdateRow
  } = props;
  const selectedAgentNames = new Set(roleplayRows.map((r) => r.agentName.trim()).filter(Boolean));

  const [noteModalRowId, setNoteModalRowId] = useState<string | null>(null);
  const noteModalRow = roleplayRows.find((r) => r.id === noteModalRowId);

  return (
    <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <HeaderPill><Play size={12} className="mr-1 inline-block" />Role-Play</HeaderPill>
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">Role-Play girişi</h2>
          {validRowCount > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{validRowCount} kayıt</span>}
        </div>

        {createPeriodMutation.isError ? (
          <ErrorBanner message={createPeriodMutation.error instanceof Error ? createPeriodMutation.error.message : "Bilinmeyen hata."} prefix="Dönem oluşturulamadı" />
        ) : null}

        {saveRoleplayMutation.isError ? (
          <ErrorBanner message={saveRoleplayMutation.error instanceof Error ? saveRoleplayMutation.error.message : "Kayıt sırasında bir hata oluştu."} />
        ) : null}

        {roleplaySaveSuccess ? <SuccessBanner message="Role-Play verileri başarıyla kaydedildi." /> : null}

        <SurfaceCard
          description="Her satır bir temsilciyi temsil eder. Temsilci adı dolu olan satırlar kaydedilir."
          title="Role-Play Veri Girişi"
          variant="default"
        >
          {createPeriodMutation.isPending ? (
            <EmptyBlock message="Dönem hazırlanıyor..." />
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-[10px] border border-slate-200 dark:border-slate-600">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-700/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Temsilci adı</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">IS Role-Play Adet</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">RevOPS</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Not</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {roleplayRows.map((row) => (
                      <tr key={row.id} className="bg-white dark:bg-slate-800">
                        <td className="px-4 py-2">
                          <select
                            className="h-11 w-full min-w-[180px] rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm text-slate-800 transition focus:border-primary/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                            onChange={(e) => onUpdateRow(row.id, "agentName", e.target.value)}
                            value={row.agentName}
                          >
                            <option value="">Temsilci seçin</option>
                            {availableAgents.map((name) => (
                              <option
                                key={name}
                                disabled={name !== row.agentName && selectedAgentNames.has(name)}
                                value={name}
                              >
                                {name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className="h-11 w-32 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-primary/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
                            min={0}
                            onChange={(e) => onUpdateRow(row.id, "rolePlayCount", e.target.value)}
                            placeholder="0"
                            type="number"
                            value={row.rolePlayCount}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className="h-11 w-32 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-primary/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
                            min={0}
                            onChange={(e) => onUpdateRow(row.id, "revOpsCount", e.target.value)}
                            placeholder="0"
                            type="number"
                            value={row.revOpsCount}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <button
                            className={[
                              "inline-flex size-9 items-center justify-center rounded-full border transition",
                              row.note
                                ? "border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-600/40 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
                                : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-500 dark:border-slate-600 dark:text-slate-500 dark:hover:border-slate-500 dark:hover:text-slate-400"
                            ].join(" ")}
                            onClick={() => setNoteModalRowId(row.id)}
                            title={row.note ? "Notu düzenle" : "Not ekle"}
                            type="button"
                          >
                            {row.note ? <MessageSquare size={14} /> : <MessageSquarePlus size={14} />}
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          <DeleteRowButton onClick={() => onRemoveRow(row.id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <AddRowButton onClick={onAddRow} />
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:border-slate-500">
                  <Upload size={13} />
                  CSV'den doldur
                  <input
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { props.onCsvImport(f); e.target.value = ""; } }}
                    type="file"
                  />
                </label>
                {selectedPeriod ? (
                  <p className="text-xs text-slate-400">{selectedPeriod.title} · {validRowCount} temsilci</p>
                ) : null}
              </div>

              {roleplayQuery.data && roleplayQuery.data.length > 0 ? (
                <EditableSavedData
                  columns={["Temsilci", "Role-Play Adet", "RevOPS"]}
                  rows={roleplayQuery.data.map((row: any) => ({
                    id: row.agentKey,
                    cells: [row.agentName, String(row.rolePlayCount), row.revOpsCount != null ? String(row.revOpsCount) : ""],
                    fields: ["agentName", "rolePlayCount", "revOpsCount"],
                    types: ["text", "number", "number"] as ("text" | "number")[]
                  }))}
                  onDelete={(id) => deleteRecordMutation.mutate(id)}
                  onUpdate={(id, field, value) => updateRecordMutation.mutate({ agentKey: id, updates: { [field]: field === "agentName" ? value : Number(value) || 0 } })}
                  isDeleting={deleteRecordMutation.isPending}
                />
              ) : null}
            </div>
          )}
        </SurfaceCard>

      {noteModalRow && (
        <NoteModal
          agentName={noteModalRow.agentName || "Temsilci"}
          isSaving={saveNoteMutation.isPending}
          note={noteModalRow.note}
          onClose={() => setNoteModalRowId(null)}
          onSave={(value) => {
            onUpdateRow(noteModalRow.id, "note", value);
            const agentKey = normalizeKey(noteModalRow.agentName.trim());
            if (agentKey && roleplayQuery.data?.length) {
              saveNoteMutation.mutate({ agentKey, note: value });
            }
            setNoteModalRowId(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Değerlendirme Soruları Bölümü ── */

function EvaluationSection(props: {
  activePeriodMonth: string;
  selectedPeriod: any;
  evaluationRows: EvaluationEntryRow[];
  validRowCount: number;
  evaluationSaveSuccess: boolean;
  createPeriodMutation: { isPending: boolean; isError: boolean; error: unknown };
  saveEvaluationMutation: { isPending: boolean; isError: boolean; error: unknown };
  evaluationQuery: { data: any; isFetching: boolean };
  deleteRecordMutation: { mutate: (id: string) => void; isPending: boolean };
  updateRecordMutation: { mutate: (params: { id: string; updates: Record<string, unknown> }) => void; isPending: boolean };
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, field: keyof EvaluationEntryRow, value: string) => void;
  onCsvImport: (file: File) => void;
}) {
  const {
    selectedPeriod, evaluationRows, validRowCount, evaluationSaveSuccess,
    createPeriodMutation, saveEvaluationMutation, evaluationQuery, deleteRecordMutation, updateRecordMutation,
    onAddRow, onRemoveRow, onUpdateRow, onCsvImport
  } = props;

  return (
    <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <HeaderPill><FileQuestion size={12} className="mr-1 inline-block" />Değerlendirme</HeaderPill>
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">Değerlendirme soruları</h2>
          {validRowCount > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{validRowCount} soru</span>}
        </div>

        {createPeriodMutation.isError ? (
          <ErrorBanner message={createPeriodMutation.error instanceof Error ? createPeriodMutation.error.message : "Bilinmeyen hata."} prefix="Dönem oluşturulamadı" />
        ) : null}

        {saveEvaluationMutation.isError ? (
          <ErrorBanner message={saveEvaluationMutation.error instanceof Error ? saveEvaluationMutation.error.message : "Kayıt sırasında bir hata oluştu."} />
        ) : null}

        {evaluationSaveSuccess ? <SuccessBanner message="Değerlendirme soruları başarıyla kaydedildi." /> : null}

        <SurfaceCard
          description="Her satır bir değerlendirme sorusunu temsil eder. CSV dosyasından toplu aktarım yapabilirsiniz."
          title="Soru Girişi"
          variant="default"
        >
          {createPeriodMutation.isPending ? (
            <EmptyBlock message="Dönem hazırlanıyor..." />
          ) : (
            <div className="space-y-4">
              {/* CSV Import */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-sky-200 bg-sky-50 px-5 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 dark:border-sky-700/40 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:border-sky-600/60 dark:hover:bg-sky-900/50">
                  <Upload size={14} />
                  CSV Yükle
                  <input
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        onCsvImport(file);
                        e.target.value = "";
                      }
                    }}
                    type="file"
                  />
                </label>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Format: Puanlama,,Soru,Cevap
                </span>
              </div>

              <div className="overflow-x-auto rounded-[10px] border border-slate-200 dark:border-slate-600">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-700/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Soru</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cevap</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 w-28">Puan</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {evaluationRows.map((row) => (
                      <tr key={row.id} className="bg-white dark:bg-slate-800">
                        <td className="px-4 py-2">
                          <textarea
                            className="min-h-[44px] w-full resize-y rounded-[10px] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-primary/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
                            onChange={(e) => onUpdateRow(row.id, "questionText", e.target.value)}
                            placeholder="Soru metni"
                            rows={2}
                            value={row.questionText}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <textarea
                            className="min-h-[44px] w-full resize-y rounded-[10px] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-primary/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
                            onChange={(e) => onUpdateRow(row.id, "answer", e.target.value)}
                            placeholder="Cevap"
                            rows={2}
                            value={row.answer}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className="h-11 w-24 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-primary/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
                            inputMode="decimal"
                            onChange={(e) => onUpdateRow(row.id, "score", e.target.value)}
                            placeholder="0"
                            type="text"
                            value={row.score}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <DeleteRowButton onClick={() => onRemoveRow(row.id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <AddRowButton onClick={onAddRow} />
                {selectedPeriod ? (
                  <p className="text-xs text-slate-400">{selectedPeriod.title} · {validRowCount} soru</p>
                ) : null}
              </div>

              {evaluationQuery.data && evaluationQuery.data.length > 0 ? (
                <EditableSavedData
                  columns={["Soru", "Cevap", "Puan"]}
                  rows={evaluationQuery.data.map((row: any) => ({
                    id: row.id,
                    cells: [row.questionText, row.answer || "", String(row.score)],
                    fields: ["questionText", "answer", "score"],
                    types: ["text", "text", "number"] as ("text" | "number")[]
                  }))}
                  onDelete={(id) => deleteRecordMutation.mutate(id)}
                  onUpdate={(id, field, value) => updateRecordMutation.mutate({ id, updates: { [field]: field === "score" ? (parseTurkishNumber(String(value)) ?? 0) : value } })}
                  isDeleting={deleteRecordMutation.isPending}
                />
              ) : null}
            </div>
          )}
        </SurfaceCard>
    </div>
  );
}

/* ── CSV Parser (çok satırlı alanları destekler) ── */

/* ── Satış Toplantıları İçe Aktarım Bölümü ── */

function MeetingsSection(props: {
  activePeriodMonth: string;
  meetingsCount: number;
  meetingsImportSuccess: boolean;
  meetings: SalesMeeting[];
  selectedPeriodId: string;
  saveMeetingsMutation: { isPending: boolean; isError: boolean; error: unknown; mutate: (file: File) => void };
  createMeetingMutation: { mutate: (m: any) => void; isPending: boolean };
  updateMeetingMutation: { mutate: (p: { id: string; updates: Record<string, unknown> }) => void; isPending: boolean };
  deleteMeetingMutation: { mutate: (id: string) => void; isPending: boolean };
  deleteAllMeetingsMutation: { mutate: () => void; isPending: boolean };
}) {
  const {
    meetingsCount, meetingsImportSuccess, meetings,
    saveMeetingsMutation, createMeetingMutation, updateMeetingMutation, deleteMeetingMutation,
    deleteAllMeetingsMutation
  } = props;

  const [showManualForm, setShowManualForm] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [manualForm, setManualForm] = useState({
    date: "", qualityMember: "", salesRepresentative: "", customerName: "",
    status: "devam_ediyor" as "devam_ediyor" | "kapandi" | "kaybedildi",
    licenseDetail: "", licenseAmount: "",
    lossReason: "", lossNote: ""
  });

  const existingLossReasons = useMemo(
    () => {
      const set = new Set<string>();
      for (const m of meetings) {
        if (m.lossReason && m.lossReason.trim()) set.add(m.lossReason.trim());
      }
      return Array.from(set);
    },
    [meetings]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      saveMeetingsMutation.mutate(file);
      e.target.value = "";
    }
  };

  const handleManualAdd = () => {
    if (!manualForm.customerName.trim() || !manualForm.salesRepresentative.trim()) return;
    const isLost = manualForm.status === "kaybedildi";
    createMeetingMutation.mutate({
      date: manualForm.date || undefined,
      qualityMember: manualForm.qualityMember.trim(),
      salesRepresentative: manualForm.salesRepresentative.trim(),
      customerName: manualForm.customerName.trim(),
      status: manualForm.status,
      licenseDetail: manualForm.licenseDetail.trim() || undefined,
      licenseAmount: manualForm.licenseAmount ? Number(manualForm.licenseAmount) : null,
      ...(isLost && manualForm.lossReason.trim() ? { lossReason: manualForm.lossReason.trim() } : {}),
      ...(isLost && manualForm.lossNote.trim() ? { lossNote: manualForm.lossNote.trim() } : {})
    });
    setManualForm({ date: "", qualityMember: "", salesRepresentative: "", customerName: "", status: "devam_ediyor", licenseDetail: "", licenseAmount: "", lossReason: "", lossNote: "" });
  };

  const statusLabel = (s: string | undefined) =>
    s === "kapandi" ? "Kapandı" : s === "kaybedildi" ? "Kaybedildi" : "Devam Ediyor";

  return (
    <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <HeaderPill><Handshake size={12} className="mr-1 inline-block" />Toplantılar</HeaderPill>
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">Satış toplantıları</h2>
          {meetingsCount > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{meetingsCount} toplantı</span>}
        </div>

        {/* Manuel Ekleme */}
        <section className="rounded-[10px] border border-slate-200/80 bg-white p-6 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">Manuel Toplantı Ekle</h3>
            <button
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
              onClick={() => setShowManualForm(!showManualForm)}
              type="button"
            >
              {showManualForm ? <X size={14} /> : <Plus size={14} />}
              {showManualForm ? "Kapat" : "Yeni Toplantı"}
            </button>
          </div>
          {showManualForm && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Tarih alanı gizli — CSV'den gelen tarih verisi korunuyor */}
              <MiniInput label="Kalite Üyesi" value={manualForm.qualityMember} onChange={(v) => setManualForm((p) => ({ ...p, qualityMember: v }))} />
              <MiniInput label="Satış Temsilcisi *" value={manualForm.salesRepresentative} onChange={(v) => setManualForm((p) => ({ ...p, salesRepresentative: v }))} />
              <MiniInput label="Müşteri Adı *" value={manualForm.customerName} onChange={(v) => setManualForm((p) => ({ ...p, customerName: v }))} />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Durum</span>
                <select
                  className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  value={manualForm.status}
                  onChange={(e) => setManualForm((p) => ({ ...p, status: e.target.value as any }))}
                >
                  <option value="devam_ediyor">Devam Ediyor</option>
                  <option value="kapandi">Kapandı</option>
                  <option value="kaybedildi">Kaybedildi</option>
                </select>
              </div>
              <MiniInput label="Lisans Detayı" value={manualForm.licenseDetail} onChange={(v) => setManualForm((p) => ({ ...p, licenseDetail: v }))} />
              <MiniInput label="Lisans Tutarı" value={manualForm.licenseAmount} onChange={(v) => setManualForm((p) => ({ ...p, licenseAmount: v }))} type="number" />
              {manualForm.status === "kaybedildi" ? (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">Kayıp Sebebi</span>
                    <LossReasonSelect
                      value={manualForm.lossReason}
                      onChange={(v) => setManualForm((p) => ({ ...p, lossReason: v }))}
                      existingReasons={existingLossReasons}
                    />
                  </div>
                  <MiniInput label="Kayıp Notu" value={manualForm.lossNote} onChange={(v) => setManualForm((p) => ({ ...p, lossNote: v }))} />
                </>
              ) : null}
              <div className="flex items-end">
                <button
                  className="h-10 rounded-[10px] bg-[#2f6b7a] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#285d6a] disabled:opacity-50"
                  disabled={createMeetingMutation.isPending || !manualForm.customerName.trim() || !manualForm.salesRepresentative.trim()}
                  onClick={handleManualAdd}
                  type="button"
                >
                  {createMeetingMutation.isPending ? "Ekleniyor..." : "Ekle"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* CSV Import */}
        <section className="rounded-[10px] border border-slate-200/80 bg-white p-6 dark:border-slate-700 dark:bg-slate-800/60">
          <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">CSV İçe Aktarım</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            CSV formatı: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-700">Tarih, Süreç Danışmanı, HS Kaydı, Süreç Takibi, Lisan Detayı, Lisans Tutarı, Kayıp Sebebi, Kayıp Notu</code>
          </p>
          <div className="mt-4">
            <label
              className={[
                "flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed px-6 py-8 transition",
                saveMeetingsMutation.isPending
                  ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  : "border-slate-300 bg-white hover:border-sky-400 hover:bg-sky-50/40 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-sky-500 dark:hover:bg-sky-900/20"
              ].join(" ")}
            >
              <Upload className="text-slate-400" size={24} />
              <span className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                {saveMeetingsMutation.isPending ? "Yükleniyor..." : "CSV dosyası seçin veya sürükleyin"}
              </span>
              <input accept=".csv" className="hidden" disabled={saveMeetingsMutation.isPending} onChange={handleFileSelect} type="file" />
            </label>
          </div>
          {saveMeetingsMutation.isError ? <div className="mt-3"><ErrorBanner message={(saveMeetingsMutation.error as Error)?.message ?? "Bir hata oluştu."} /></div> : null}
          {meetingsImportSuccess ? <SuccessBanner message="Toplantı verileri başarıyla içe aktarıldı." /> : null}
        </section>

        {/* Kayıtlı Toplantılar */}
        {meetings.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{meetings.length} kayıt</span>
              {!confirmDeleteAll ? (
                <button
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20"
                  onClick={() => setConfirmDeleteAll(true)}
                  type="button"
                >
                  <Trash2 size={13} />
                  Tümünü Sil
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Tüm toplantılar silinecek. Emin misiniz?</span>
                  <button
                    className="rounded-[10px] bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                    disabled={deleteAllMeetingsMutation.isPending}
                    onClick={() => { deleteAllMeetingsMutation.mutate(); setConfirmDeleteAll(false); }}
                    type="button"
                  >
                    {deleteAllMeetingsMutation.isPending ? "Siliniyor..." : "Evet, Sil"}
                  </button>
                  <button
                    className="rounded-[10px] border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                    onClick={() => setConfirmDeleteAll(false)}
                    type="button"
                  >
                    İptal
                  </button>
                </div>
              )}
            </div>
          <EditableSavedData
            columns={["Kalite Üyesi", "Satış Temsilcisi", "Müşteri", "Durum", "Lisans Tutarı"]}
            rows={meetings.map((m) => ({
              id: m.id,
              cells: [
                m.qualityMember,
                m.salesRepresentative,
                m.customerName,
                statusLabel(m.status),
                m.licenseAmount != null ? new Intl.NumberFormat("tr-TR").format(m.licenseAmount) + " TRY" : "-"
              ],
              fields: ["qualityMember", "salesRepresentative", "customerName", "status", "licenseAmount"],
              types: ["text", "text", "text", "text", "number"] as ("text" | "number")[]
            }))}
            onDelete={(id) => deleteMeetingMutation.mutate(id)}
            onUpdate={(id, field, value) => {
              const updates: Record<string, unknown> = {};
              if (field === "licenseAmount") updates[field] = Number(value) || 0;
              else updates[field] = value;
              updateMeetingMutation.mutate({ id, updates });
            }}
            isDeleting={deleteMeetingMutation.isPending}
          />
          </div>
        ) : null}
    </div>
  );
}

/* ── KPI İçe Aktarım Bölümü ── */

function KpiSection(props: {
  activePeriodMonth: string;
  kpiAgentCount: number;
  kpiData: SalesKpiData | null | undefined;
  kpiImportSuccess: boolean;
  selectedPeriodId: string;
  saveKpiMutation: { isPending: boolean; isError: boolean; error: unknown; mutate: (file: File) => void };
  addAgentMutation: { mutate: (a: any) => void; isPending: boolean };
  updateAgentMutation: { mutate: (p: { agentKey: string; updates: Record<string, unknown> }) => void; isPending: boolean };
  deleteAgentMutation: { mutate: (k: string) => void; isPending: boolean };
  resetAgentsMutation: { mutate: () => void; isPending: boolean };
  updateTargetsMutation: { mutate: (t: Record<string, unknown>) => void; isPending: boolean };
  updateLicenseSummaryMutation: { mutate: (s: { preCount: number; scaleCount: number; scale2Plus1Count: number; scalePlusCount: number; scalePlus2Plus1Count: number }) => void; isPending: boolean };
}) {
  const {
    kpiAgentCount, kpiData, kpiImportSuccess,
    saveKpiMutation, addAgentMutation, updateAgentMutation, deleteAgentMutation, resetAgentsMutation, updateTargetsMutation, updateLicenseSummaryMutation
  } = props;

  const [showManualForm, setShowManualForm] = useState(false);
  const [agentForm, setAgentForm] = useState({
    agentName: "", perfScore: "", salesAmount: "", licenseCount: "",
    avgLicensePrice: "", talkDurationSeconds: "", callAttempts: "", conversionRate: "",
    scaleCount: "", scalePlusCount: "", scaleConversion: "", scalePlusConversion: "", totalConversion: ""
  });

  const [editingTargets, setEditingTargets] = useState(false);
  const [targetDraft, setTargetDraft] = useState<Record<string, string>>({});

  const [editingLicenseSummary, setEditingLicenseSummary] = useState(false);
  const [licenseSummaryDraft, setLicenseSummaryDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (kpiData?.targets) {
      setTargetDraft({
        perfScore: String(kpiData.targets.perfScore),
        salesAmount: String(kpiData.targets.salesAmount),
        licenseCount: String(kpiData.targets.licenseCount),
        avgLicensePrice: String(kpiData.targets.avgLicensePrice),
        talkDurationLabel: kpiData.targets.talkDurationLabel,
        callAttempts: String(kpiData.targets.callAttempts),
        conversionRate: String(kpiData.targets.conversionRate)
      });
    }
  }, [kpiData?.targets]);

  useEffect(() => {
    if ((kpiData as any)?.licenseSummary) {
      const ls = (kpiData as any).licenseSummary;
      setLicenseSummaryDraft({
        preCount: String(ls.preCount ?? 0),
        scaleCount: String(ls.scaleCount ?? 0),
        scale2Plus1Count: String(ls.scale2Plus1Count ?? 0),
        scalePlusCount: String(ls.scalePlusCount ?? 0),
        scalePlus2Plus1Count: String(ls.scalePlus2Plus1Count ?? 0)
      });
    }
  }, [(kpiData as any)?.licenseSummary]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      saveKpiMutation.mutate(file);
      e.target.value = "";
    }
  };

  const handleAddAgent = () => {
    if (!agentForm.agentName.trim()) return;
    addAgentMutation.mutate({
      agentName: agentForm.agentName.trim(),
      perfScore: agentForm.perfScore ? Number(agentForm.perfScore) : null,
      salesAmount: Number(agentForm.salesAmount) || 0,
      licenseCount: Number(agentForm.licenseCount) || 0,
      avgLicensePrice: Number(agentForm.avgLicensePrice) || 0,
      talkDurationSeconds: Number(agentForm.talkDurationSeconds) || 0,
      callAttempts: Number(agentForm.callAttempts) || 0,
      conversionRate: Number(agentForm.conversionRate) || 0,
      scaleCount: Number(agentForm.scaleCount) || 0,
      scalePlusCount: Number(agentForm.scalePlusCount) || 0,
      scaleConversion: Number(agentForm.scaleConversion) || 0,
      scalePlusConversion: Number(agentForm.scalePlusConversion) || 0,
      totalConversion: Number(agentForm.totalConversion) || 0
    });
    setAgentForm({ agentName: "", perfScore: "", salesAmount: "", licenseCount: "", avgLicensePrice: "", talkDurationSeconds: "", callAttempts: "", conversionRate: "", scaleCount: "", scalePlusCount: "", scaleConversion: "", scalePlusConversion: "", totalConversion: "" });
  };

  const handleSaveLicenseSummary = () => {
    updateLicenseSummaryMutation.mutate({
      preCount: Number(licenseSummaryDraft.preCount) || 0,
      scaleCount: Number(licenseSummaryDraft.scaleCount) || 0,
      scale2Plus1Count: Number(licenseSummaryDraft.scale2Plus1Count) || 0,
      scalePlusCount: Number(licenseSummaryDraft.scalePlusCount) || 0,
      scalePlus2Plus1Count: Number(licenseSummaryDraft.scalePlus2Plus1Count) || 0
    });
    setEditingLicenseSummary(false);
  };

  const handleSaveTargets = () => {
    const talkDurationLabel = targetDraft.talkDurationLabel ?? "";
    updateTargetsMutation.mutate({
      perfScore: Number(targetDraft.perfScore) || 0,
      salesAmount: Number(targetDraft.salesAmount) || 0,
      licenseCount: Number(targetDraft.licenseCount) || 0,
      avgLicensePrice: Number(targetDraft.avgLicensePrice) || 0,
      talkDurationLabel,
      talkDurationTargetSeconds: parseTalkDurationLabelToSeconds(talkDurationLabel),
      callAttempts: Number(targetDraft.callAttempts) || 0,
      conversionRate: Number(targetDraft.conversionRate) || 0
    });
    setEditingTargets(false);
  };

  const formatTryCurrency = (v: number) => new Intl.NumberFormat("tr-TR").format(v) + " TRY";

  return (
    <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <HeaderPill><Target size={12} className="mr-1 inline-block" />KPI</HeaderPill>
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">KPI verileri</h2>
          {kpiAgentCount > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{kpiAgentCount} temsilci</span>}
        </div>

        {/* Hedef Düzenleme */}
        {kpiData?.targets ? (
          <section className="rounded-[10px] border border-slate-200/80 bg-white p-6 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">Hedef Değerler</h3>
              <button
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                onClick={() => setEditingTargets(!editingTargets)}
                type="button"
              >
                {editingTargets ? <X size={12} /> : <Pencil size={12} />}
                {editingTargets ? "Vazgeç" : "Düzenle"}
              </button>
            </div>
            {editingTargets ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MiniInput label="Perf. Değ." value={targetDraft.perfScore ?? ""} onChange={(v) => setTargetDraft((p) => ({ ...p, perfScore: v }))} type="number" />
                  <MiniInput label="Satış Tutarı" value={targetDraft.salesAmount ?? ""} onChange={(v) => setTargetDraft((p) => ({ ...p, salesAmount: v }))} type="number" />
                  <MiniInput label="Lisans Adeti" value={targetDraft.licenseCount ?? ""} onChange={(v) => setTargetDraft((p) => ({ ...p, licenseCount: v }))} type="number" />
                  <MiniInput label="Ort. Lisans Fiyatı" value={targetDraft.avgLicensePrice ?? ""} onChange={(v) => setTargetDraft((p) => ({ ...p, avgLicensePrice: v }))} type="number" />
                  <MiniInput label="Konuşma Süresi" value={targetDraft.talkDurationLabel ?? ""} onChange={(v) => setTargetDraft((p) => ({ ...p, talkDurationLabel: v }))} />
                  <MiniInput label="Arama Denemesi" value={targetDraft.callAttempts ?? ""} onChange={(v) => setTargetDraft((p) => ({ ...p, callAttempts: v }))} type="number" />
                  <MiniInput label="Dönüşüm Oranı" value={targetDraft.conversionRate ?? ""} onChange={(v) => setTargetDraft((p) => ({ ...p, conversionRate: v }))} type="number" />
                  <div className="flex items-end">
                    <button
                      className="h-10 rounded-[10px] bg-[#2f6b7a] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#285d6a] disabled:opacity-50"
                      disabled={updateTargetsMutation.isPending}
                      onClick={handleSaveTargets}
                      type="button"
                    >
                      {updateTargetsMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="text-slate-500">Perf. Değ.:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{kpiData.targets.perfScore}</span></div>
                <div><span className="text-slate-500">Satış Tutarı:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{formatTryCurrency(kpiData.targets.salesAmount)}</span></div>
                <div><span className="text-slate-500">Lisans:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{kpiData.targets.licenseCount}</span></div>
                <div><span className="text-slate-500">Ort. Fiyat:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{formatTryCurrency(kpiData.targets.avgLicensePrice)}</span></div>
                <div><span className="text-slate-500">Konuşma:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{kpiData.targets.talkDurationLabel}</span></div>
                <div><span className="text-slate-500">Arama:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{kpiData.targets.callAttempts}</span></div>
                <div><span className="text-slate-500">Dönüşüm:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{kpiData.targets.conversionRate}%</span></div>
              </div>
            )}
          </section>
        ) : null}

        {/* Lisans Özet Tablosu */}
        <section className="rounded-[10px] border border-slate-200/80 bg-white p-6 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">Aylık Lisans Özeti</h3>
            <button
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
              onClick={() => setEditingLicenseSummary(!editingLicenseSummary)}
              type="button"
            >
              {editingLicenseSummary ? <X size={12} /> : <Pencil size={12} />}
              {editingLicenseSummary ? "Vazgeç" : "Düzenle"}
            </button>
          </div>
          {editingLicenseSummary ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MiniInput label="Pre." value={licenseSummaryDraft.preCount ?? ""} onChange={(v) => setLicenseSummaryDraft((p) => ({ ...p, preCount: v }))} type="number" />
                <MiniInput label="Scale" value={licenseSummaryDraft.scaleCount ?? ""} onChange={(v) => setLicenseSummaryDraft((p) => ({ ...p, scaleCount: v }))} type="number" />
                <MiniInput label="Scale 2+1" value={licenseSummaryDraft.scale2Plus1Count ?? ""} onChange={(v) => setLicenseSummaryDraft((p) => ({ ...p, scale2Plus1Count: v }))} type="number" />
                <MiniInput label="Scale Plus" value={licenseSummaryDraft.scalePlusCount ?? ""} onChange={(v) => setLicenseSummaryDraft((p) => ({ ...p, scalePlusCount: v }))} type="number" />
                <MiniInput label="Scale Plus 2+1" value={licenseSummaryDraft.scalePlus2Plus1Count ?? ""} onChange={(v) => setLicenseSummaryDraft((p) => ({ ...p, scalePlus2Plus1Count: v }))} type="number" />
              </div>
              <button
                className="h-10 rounded-[10px] bg-[#2f6b7a] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#285d6a] disabled:opacity-50"
                disabled={updateLicenseSummaryMutation.isPending}
                onClick={handleSaveLicenseSummary}
                type="button"
              >
                {updateLicenseSummaryMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          ) : (kpiData as any)?.licenseSummary ? (
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <div><span className="text-slate-500">Pre.:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{(kpiData as any).licenseSummary.preCount}</span></div>
              <div><span className="text-slate-500">Scale:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{(kpiData as any).licenseSummary.scaleCount}</span></div>
              <div><span className="text-slate-500">Scale 2+1:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{(kpiData as any).licenseSummary.scale2Plus1Count}</span></div>
              <div><span className="text-slate-500">Scale Plus:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{(kpiData as any).licenseSummary.scalePlusCount}</span></div>
              <div><span className="text-slate-500">Scale Plus 2+1:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{(kpiData as any).licenseSummary.scalePlus2Plus1Count}</span></div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Henüz lisans özeti girilmemiş. Düzenle butonuyla ekleyin.</p>
          )}
        </section>

        {/* Manuel Temsilci Ekleme */}
        <section className="rounded-[10px] border border-slate-200/80 bg-white p-6 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">Manuel Temsilci Ekle</h3>
            <button
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
              onClick={() => setShowManualForm(!showManualForm)}
              type="button"
            >
              {showManualForm ? <X size={14} /> : <Plus size={14} />}
              {showManualForm ? "Kapat" : "Yeni Temsilci"}
            </button>
          </div>
          {showManualForm && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniInput label="Temsilci Adı *" value={agentForm.agentName} onChange={(v) => setAgentForm((p) => ({ ...p, agentName: v }))} />
              <MiniInput label="Perf. Değ." value={agentForm.perfScore} onChange={(v) => setAgentForm((p) => ({ ...p, perfScore: v }))} type="number" />
              <MiniInput label="Satış Tutarı" value={agentForm.salesAmount} onChange={(v) => setAgentForm((p) => ({ ...p, salesAmount: v }))} type="number" />
              <MiniInput label="Lisans Adeti" value={agentForm.licenseCount} onChange={(v) => setAgentForm((p) => ({ ...p, licenseCount: v }))} type="number" />
              <MiniInput label="Ort. Lisans Fiyatı" value={agentForm.avgLicensePrice} onChange={(v) => setAgentForm((p) => ({ ...p, avgLicensePrice: v }))} type="number" />
              <MiniInput label="Konuşma Süresi (sn)" value={agentForm.talkDurationSeconds} onChange={(v) => setAgentForm((p) => ({ ...p, talkDurationSeconds: v }))} type="number" />
              <MiniInput label="Arama Denemesi" value={agentForm.callAttempts} onChange={(v) => setAgentForm((p) => ({ ...p, callAttempts: v }))} type="number" />
              <MiniInput label="Dönüşüm Oranı (%)" value={agentForm.conversionRate} onChange={(v) => setAgentForm((p) => ({ ...p, conversionRate: v }))} type="number" />
              <MiniInput label="Scale 2+1" value={agentForm.scaleCount} onChange={(v) => setAgentForm((p) => ({ ...p, scaleCount: v }))} type="number" />
              <MiniInput label="Scale %" value={agentForm.scaleConversion} onChange={(v) => setAgentForm((p) => ({ ...p, scaleConversion: v }))} type="number" />
              <MiniInput label="Scale Plus 2+1" value={agentForm.scalePlusCount} onChange={(v) => setAgentForm((p) => ({ ...p, scalePlusCount: v }))} type="number" />
              <MiniInput label="Scale Plus %" value={agentForm.scalePlusConversion} onChange={(v) => setAgentForm((p) => ({ ...p, scalePlusConversion: v }))} type="number" />
              <MiniInput label="Toplam %" value={agentForm.totalConversion} onChange={(v) => setAgentForm((p) => ({ ...p, totalConversion: v }))} type="number" />
              <div className="flex items-end">
                <button
                  className="h-10 rounded-[10px] bg-[#2f6b7a] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#285d6a] disabled:opacity-50"
                  disabled={addAgentMutation.isPending || !agentForm.agentName.trim()}
                  onClick={handleAddAgent}
                  type="button"
                >
                  {addAgentMutation.isPending ? "Ekleniyor..." : "Ekle"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* CSV Import */}
        <section className="rounded-[10px] border border-slate-200/80 bg-white p-6 dark:border-slate-700 dark:bg-slate-800/60">
          <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">CSV İçe Aktarım</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            CSV formatı: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-700">KPI's, PERF. DEĞ., [AY], LİSANS ADETİ, ORT. LİSANS FİYATI, TOPLAM KONUŞMA SÜRESİ, ARAMA DENEMESİ, DÖNÜŞÜM ORANI</code>
          </p>
          <div className="mt-4">
            <label
              className={[
                "flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed px-6 py-8 transition",
                saveKpiMutation.isPending
                  ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  : "border-slate-300 bg-white hover:border-sky-400 hover:bg-sky-50/40 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-sky-500 dark:hover:bg-sky-900/20"
              ].join(" ")}
            >
              <Upload className="text-slate-400" size={24} />
              <span className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                {saveKpiMutation.isPending ? "Yükleniyor..." : "CSV dosyası seçin veya sürükleyin"}
              </span>
              <input accept=".csv" className="hidden" disabled={saveKpiMutation.isPending} onChange={handleFileSelect} type="file" />
            </label>
          </div>
          {saveKpiMutation.isError ? <div className="mt-3"><ErrorBanner message={(saveKpiMutation.error as Error)?.message ?? "Bir hata oluştu."} /></div> : null}
          {kpiImportSuccess ? <SuccessBanner message="KPI verileri başarıyla içe aktarıldı." /> : null}
        </section>

        {/* Kayıtlı Temsilci Verileri */}
        {kpiData && kpiData.agents.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{kpiData.agents.length} temsilci kaydı</p>
              <button
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-700/40 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40 disabled:opacity-50"
                disabled={resetAgentsMutation.isPending}
                onClick={() => { if (confirm("Tüm temsilci KPI verilerini silmek istediğinize emin misiniz?")) resetAgentsMutation.mutate(); }}
                type="button"
              >
                <Trash2 size={12} />
                {resetAgentsMutation.isPending ? "Siliniyor..." : "Tümünü sil"}
              </button>
            </div>
          <EditableSavedData
            columns={["Temsilci", "Perf. Değ.", "Satış Tutarı", "Lisans", "Ort. Fiyat", "Konuşma (sn)", "Arama", "Dönüşüm %", "Scale 2+1", "Scale %", "Scale+ 2+1", "Scale+ %", "Toplam %"]}
            rows={kpiData.agents.map((a) => ({
              id: a.agentKey ?? normalizeKey(a.agentName),
              cells: [
                a.agentName,
                a.perfScore !== null ? String(a.perfScore) : "",
                String(a.salesAmount),
                String(a.licenseCount),
                String(a.avgLicensePrice),
                String(a.talkDurationSeconds),
                String(a.callAttempts),
                String(a.conversionRate),
                String(a.scaleCount ?? 0),
                String(a.scaleConversion ?? 0),
                String(a.scalePlusCount ?? 0),
                String(a.scalePlusConversion ?? 0),
                String(a.totalConversion ?? 0)
              ],
              fields: ["agentName", "perfScore", "salesAmount", "licenseCount", "avgLicensePrice", "talkDurationSeconds", "callAttempts", "conversionRate", "scaleCount", "scaleConversion", "scalePlusCount", "scalePlusConversion", "totalConversion"],
              types: ["text", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number"] as ("text" | "number")[]
            }))}
            onDelete={(agentKey) => deleteAgentMutation.mutate(agentKey)}
            onUpdate={(agentKey, field, value) => {
              const updates: Record<string, unknown> = {};
              if (field === "agentName") updates[field] = value;
              else if (field === "perfScore") updates[field] = value === "" ? null : Number(value);
              else updates[field] = Number(value) || 0;
              updateAgentMutation.mutate({ agentKey, updates });
            }}
            isDeleting={deleteAgentMutation.isPending}
          />
          </div>
        ) : null}
    </div>
  );
}

/* ── KPI CSV Yardımcı Fonksiyonlar ── */

function parseTurkishNumber(raw: string): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/TRY/gi, "").replace(/%/g, "").trim();
  if (!cleaned || cleaned === "*") return null;
  // Türkçe format: nokta binlik ayracı, virgül ondalık ayracı
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

type QuarterlyReport = {
  months: string[]; // ["2026-01", "2026-02", "2026-03"]
  audit: Map<string, { agentName: string; scores: (number | null)[] }>;
  roleplay: Map<string, { agentName: string; counts: (number | null)[] }>;
  revops: Map<string, { agentName: string; counts: (number | null)[] }>;
};

const MONTH_NAME_TO_INDEX: Record<string, string> = {
  ocak: "01", subat: "02", mart: "03", nisan: "04",
  mayis: "05", haziran: "06", temmuz: "07", agustos: "08",
  eylul: "09", ekim: "10", kasim: "11", aralik: "12"
};

function normalizeMonthName(raw: string): string | null {
  const cleaned = raw.trim().toLocaleLowerCase("tr")
    .replace(/ş/g, "s").replace(/ü/g, "u").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ç/g, "c").replace(/ğ/g, "g");
  return MONTH_NAME_TO_INDEX[cleaned] ?? null;
}

function parseQuarterlyValue(raw: string): number | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "*" || trimmed.toLocaleUpperCase("tr") === "ORT") return null;
  return parseTurkishNumber(trimmed);
}

function parseQuarterlyReport(rows: string[][], year: string): QuarterlyReport {
  const result: QuarterlyReport = {
    months: [],
    audit: new Map(),
    roleplay: new Map(),
    revops: new Map()
  };

  // Bölüm 1: Audit (ilk satırdaki ay başlıkları)
  const headerRow = rows[0] ?? [];
  const monthIndices: { col: number; month: string }[] = [];
  for (let c = 1; c <= 3 && c < headerRow.length; c++) {
    const monthCode = normalizeMonthName(headerRow[c] ?? "");
    if (monthCode) {
      monthIndices.push({ col: c, month: `${year}-${monthCode}` });
    }
  }
  result.months = monthIndices.map((m) => m.month);

  // Audit satırlarını oku (satır 2+, ORTALAMA'ya kadar)
  for (let i = 2; i < rows.length; i++) {
    const cols = rows[i]!;
    const name = (cols[0] ?? "").trim();
    if (!name) continue;
    if (name.toLocaleUpperCase("tr") === "ORTALAMA" || name.toLocaleUpperCase("tr") === "TOPLAM") break;

    const scores = monthIndices.map((mi) => parseQuarterlyValue(cols[mi.col] ?? ""));
    result.audit.set(normalizeKey(name), { agentName: name, scores });
  }

  // Bölüm 2: IS Role-Play Adet
  for (let i = 0; i < rows.length; i++) {
    const cell0 = (rows[i]![0] ?? "").trim().toLocaleUpperCase("tr");
    if (cell0.includes("IS ROLE-PLAY") || cell0.includes("IS ROLE PLAY") || cell0 === "IS ROLE-PLAY ADET") {
      // Başlık bulundu, sonraki satırlardan veri oku
      for (let j = i + 2; j < rows.length; j++) {
        const cols = rows[j]!;
        const name = (cols[0] ?? "").trim();
        if (!name) break;
        const counts = monthIndices.map((mi) => parseQuarterlyValue(cols[mi.col] ?? ""));
        // Tüm değerler null ise toplam satırı olabilir, atla değil ekle
        result.roleplay.set(normalizeKey(name), { agentName: name, counts });
      }
      break;
    }
  }

  // Bölüm 3: RevOps Role-Play Adet
  for (let i = 0; i < rows.length; i++) {
    const cell0 = (rows[i]![0] ?? "").trim().toLocaleUpperCase("tr");
    if (cell0.includes("REVOPS") || cell0.includes("REV OPS")) {
      for (let j = i + 2; j < rows.length; j++) {
        const cols = rows[j]!;
        const name = (cols[0] ?? "").trim();
        if (!name) break;
        const counts = monthIndices.map((mi) => parseQuarterlyValue(cols[mi.col] ?? ""));
        result.revops.set(normalizeKey(name), { agentName: name, counts });
      }
      break;
    }
  }

  return result;
}

function parseHmsToSeconds(raw: string): number {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":");
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts.map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        current.push(field);
        field = "";
        i++;
      } else if (char === '\n' || char === '\r') {
        current.push(field);
        field = "";
        rows.push(current);
        current = [];
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          i += 2;
        } else {
          i++;
        }
      } else {
        field += char;
        i++;
      }
    }
  }

  // Son satır
  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows;
}

/* ── Yardımcı bileşenler ── */

function AgentCombobox(props: { agents: string[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const query = props.value.toLocaleLowerCase("tr");
  const filtered = props.agents.filter((name) => name.toLocaleLowerCase("tr").includes(query));

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <>
      <input
        ref={inputRef}
        className="h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-primary/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
        onChange={(e) => { props.onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Temsilci seçin veya yazın"
        type="text"
        value={props.value}
      />
      {open && filtered.length > 0 && rect && createPortal(
        <ul
          className="fixed z-[9999] max-h-48 overflow-y-auto rounded-[10px] border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800"
          style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}
        >
          {filtered.map((name) => (
            <li key={name}>
              <button
                className="w-full px-3.5 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                onMouseDown={(e) => { e.preventDefault(); props.onChange(name); setOpen(false); }}
                type="button"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </>
  );
}

function SidebarButton(props: { active: boolean; label: string; icon?: ReactNode; onClick: () => void }) {
  return (
    <button
      className={[
        "flex w-full items-center gap-2.5 rounded-[10px] border px-4 py-3 text-left text-sm font-semibold transition",
        props.active
          ? "border-[#2f6b7a] bg-[#2f6b7a] text-white shadow-[0_16px_34px_rgba(47,107,122,0.22)]"
          : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-100"
      ].join(" ")}
      onClick={props.onClick}
      type="button"
    >
      {props.icon}
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
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={[
        "inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-sm font-semibold transition",
        props.primary
          ? "bg-[#2f6b7a] text-white shadow-[0_14px_28px_rgba(47,107,122,0.18)] hover:bg-[#285d6a]"
          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-600",
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

function HeaderPill(props: { children: ReactNode; tone?: "neutral" | "accent" | "success" }) {
  const tone = props.tone ?? "neutral";
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "accent"
          ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700/40 dark:bg-sky-900/30 dark:text-sky-400"
          : tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-400"
            : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400"
      ].join(" ")}
    >
      {props.children}
    </span>
  );
}

function InputField(props: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{props.label}</span>
      {props.children}
    </label>
  );
}

function EmptyBlock(props: { message: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
      {props.message}
    </div>
  );
}

function ErrorBanner(props: { message: string; prefix?: string }) {
  return (
    <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400">
      {props.prefix ? `${props.prefix}: ` : ""}{props.message}
    </div>
  );
}

function SuccessBanner(props: { message: string }) {
  return (
    <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-400">
      {props.message}
    </div>
  );
}

function DeleteRowButton(props: { onClick: () => void }) {
  return (
    <button
      className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:text-rose-500 dark:border-slate-600 dark:text-slate-500 dark:hover:border-rose-700/40 dark:hover:text-rose-400"
      onClick={props.onClick}
      title="Satırı sil"
      type="button"
    >
      <Trash2 size={13} />
    </button>
  );
}

function AddRowButton(props: { onClick: () => void }) {
  return (
    <button
      className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-600"
      onClick={props.onClick}
      type="button"
    >
      <Plus size={14} />
      Satır ekle
    </button>
  );
}

function NoteModal(props: {
  agentName: string;
  isSaving?: boolean;
  note: string;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(props.note);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}>
      <div
        className="mx-4 w-full max-w-md rounded-[10px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)] dark:border-slate-600 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-950 dark:text-slate-100">
            {props.agentName} &mdash; Not
          </h3>
          <button
            className="inline-flex size-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            onClick={props.onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
        <textarea
          autoFocus
          className="mt-4 h-32 w-full resize-none rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-primary/40 focus:outline-none"
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Temsilci hakkında not girin..."
          value={draft}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-[10px] border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            onClick={props.onClose}
            type="button"
          >
            Vazgeç
          </button>
          <button
            className="rounded-[10px] bg-[#2f6b7a] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(47,107,122,0.18)] transition hover:bg-[#285d6a] disabled:opacity-50"
            disabled={props.isSaving}
            onClick={() => props.onSave(draft)}
            type="button"
          >
            {props.isSaving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

type EditableRow = {
  id: string;
  cells: string[];
  fields: string[];
  types: ("text" | "number")[];
};

function EditableSavedData(props: {
  columns: string[];
  rows: EditableRow[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, field: string, value: string) => void;
  isDeleting?: boolean;
}) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; colIdx: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startEdit = (rowId: string, colIdx: number, currentValue: string) => {
    setEditingCell({ rowId, colIdx });
    setEditValue(currentValue);
  };

  const commitEdit = (row: EditableRow) => {
    if (!editingCell) return;
    const field = row.fields[editingCell.colIdx];
    const original = row.cells[editingCell.colIdx];
    if (field && editValue !== original) {
      props.onUpdate(row.id, field, editValue);
    }
    setEditingCell(null);
  };

  const cancelEdit = () => setEditingCell(null);

  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-700/30">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        Kaydedilmiş veriler
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-600">
              {props.columns.map((col) => (
                <th key={col} className="pb-2 text-left text-xs font-medium text-slate-500">{col}</th>
              ))}
              <th className="w-20 pb-2 text-right text-xs font-medium text-slate-500">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {props.rows.map((row) => (
              <tr key={row.id} className="group">
                {row.cells.map((cell, cIdx) => {
                  const isEditing = editingCell?.rowId === row.id && editingCell?.colIdx === cIdx;
                  return (
                    <td key={cIdx} className="py-1.5 pr-2">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            className="h-8 w-full min-w-[60px] rounded-[10px] border border-sky-300 bg-white px-2 text-sm text-slate-800 focus:outline-none dark:border-sky-600 dark:bg-slate-700 dark:text-slate-200"
                            onBlur={() => commitEdit(row)}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(row);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            type={row.types[cIdx] === "number" ? "number" : "text"}
                            value={editValue}
                          />
                        </div>
                      ) : (
                        <span
                          className={[
                            "cursor-pointer rounded px-1 py-0.5 transition hover:bg-sky-50 dark:hover:bg-sky-900/20",
                            cIdx === 0 ? "font-medium text-slate-900 dark:text-slate-200" : "text-slate-600 dark:text-slate-400"
                          ].join(" ")}
                          onClick={() => startEdit(row.id, cIdx, cell)}
                          title="Düzenlemek için tıklayın"
                        >
                          {cell || <span className="text-slate-300">-</span>}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="py-1.5 text-right">
                  {confirmDeleteId === row.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        className="rounded-[10px] bg-rose-500 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-600"
                        onClick={() => { props.onDelete(row.id); setConfirmDeleteId(null); }}
                        type="button"
                      >
                        Sil
                      </button>
                      <button
                        className="rounded-[10px] border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
                        onClick={() => setConfirmDeleteId(null)}
                        type="button"
                      >
                        İptal
                      </button>
                    </span>
                  ) : (
                    <button
                      className="invisible inline-flex size-7 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:text-rose-500 group-hover:visible dark:border-slate-600 dark:hover:border-rose-700/40 dark:hover:text-rose-400"
                      onClick={() => setConfirmDeleteId(row.id)}
                      title="Sil"
                      type="button"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniInput(props: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  // type="number" virgüllü ondalık değerleri (7,5) kabul etmez, text+inputMode kullan
  const isNumeric = props.type === "number";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{props.label}</span>
      <input
        className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
        inputMode={isNumeric ? "decimal" : undefined}
        onChange={(e) => props.onChange(e.target.value)}
        type={isNumeric ? "text" : (props.type ?? "text")}
        value={props.value}
      />
    </div>
  );
}

/* ── RAMP Giriş Bölümü ── */

type RampRowData = { agentKey: string; agentName: string; pipeline: string; growAmount: string; scaleAmount: string; scalePlusAmount: string };

function RampSection(props: { selectedPeriodId: string; activePeriodMonth: string; kpiAgents: Array<{ agentKey: string; agentName: string }> }) {
  const { selectedPeriodId, kpiAgents } = props;
  const [rows, setRows] = useState<RampRowData[]>([]);
  const [targets, setTargets] = useState({ touchesTarget: "1500", talkTimeTargetSeconds: "144000", wsaTarget: "200000", pipelineCoverage: "3" });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!firebaseDb || !selectedPeriodId) return;
    setLoaded(false);
    const load = async () => {
      const snap = await getDocs(collection(firebaseDb!, "reportPeriods", selectedPeriodId, "rampEntries"));
      const existing = new Map<string, { pipeline: number; growAmount: number; scaleAmount: number; scalePlusAmount: number }>();
      snap.forEach((d) => {
        if (d.id === "__targets__") {
          const t = d.data();
          setTargets({
            touchesTarget: String(t.touchesTarget ?? 1500),
            talkTimeTargetSeconds: String(t.talkTimeTargetSeconds ?? 144000),
            wsaTarget: String(t.wsaTarget ?? 200000),
            pipelineCoverage: String(t.pipelineCoverage ?? 3)
          });
        } else {
          const data = d.data();
          existing.set(d.id, { pipeline: data.pipeline ?? 0, growAmount: data.growAmount ?? 0, scaleAmount: data.scaleAmount ?? 0, scalePlusAmount: data.scalePlusAmount ?? 0 });
        }
      });
      const merged: RampRowData[] = kpiAgents.map((a) => {
        const e = existing.get(a.agentKey);
        return {
          agentKey: a.agentKey,
          agentName: a.agentName,
          pipeline: String(e?.pipeline ?? ""),
          growAmount: String(e?.growAmount ?? ""),
          scaleAmount: String(e?.scaleAmount ?? ""),
          scalePlusAmount: String(e?.scalePlusAmount ?? "")
        };
      });
      setRows(merged);
      setLoaded(true);
    };
    void load();
  }, [selectedPeriodId, kpiAgents]);

  const updateRow = (agentKey: string, field: keyof RampRowData, value: string) => {
    setRows((prev) => prev.map((r) => r.agentKey === agentKey ? { ...r, [field]: value } : r));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!firebaseDb || !selectedPeriodId) return;
    setSaving(true);
    setSaveSuccess(false);
    const now = new Date().toISOString();
    try {
      // Hedefleri kaydet
      await setDoc(doc(firebaseDb, "reportPeriods", selectedPeriodId, "rampEntries", "__targets__"), {
        touchesTarget: Number(targets.touchesTarget) || 1500,
        talkTimeTargetSeconds: Number(targets.talkTimeTargetSeconds) || 144000,
        wsaTarget: Number(targets.wsaTarget) || 200000,
        pipelineCoverage: Number(targets.pipelineCoverage) || 3,
        updatedAt: now
      });
      // Temsilci verilerini kaydet
      for (const row of rows) {
        await setDoc(doc(firebaseDb, "reportPeriods", selectedPeriodId, "rampEntries", row.agentKey), {
          agentKey: row.agentKey,
          pipeline: Number(row.pipeline) || 0,
          growAmount: Number(row.growAmount) || 0,
          scaleAmount: Number(row.scaleAmount) || 0,
          scalePlusAmount: Number(row.scalePlusAmount) || 0,
          updatedAt: now
        });
      }
      setSaveSuccess(true);
    } catch (err) {
      console.error("RAMP kayıt hatası:", err);
    } finally {
      setSaving(false);
    }
  };

  const cellCls = "px-3 py-2 text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap";
  const inputCls = "w-full rounded border border-slate-200 dark:border-slate-600 bg-transparent px-2 py-1.5 text-sm text-right tabular-nums focus:border-sky-400 focus:outline-none";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <HeaderPill><TrendingUp size={12} className="mr-1 inline-block" />RAMP</HeaderPill>
        <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">RAMP Veri Girişi</h2>
      </div>

      {saveSuccess ? <SuccessBanner message="RAMP verileri başarıyla kaydedildi." /> : null}

      {/* Hedefler */}
      <SurfaceCard title="RAMP Hedefleri" description="Varsayılan hedefleri dönem bazında ayarlayabilirsiniz." variant="default">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Dokunma Hedefi</label>
            <input className={inputCls} value={targets.touchesTarget} onChange={(e) => setTargets((p) => ({ ...p, touchesTarget: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Konuşma Hedefi (sn)</label>
            <input className={inputCls} value={targets.talkTimeTargetSeconds} onChange={(e) => setTargets((p) => ({ ...p, talkTimeTargetSeconds: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">WSA Hedefi (TRY)</label>
            <input className={inputCls} value={targets.wsaTarget} onChange={(e) => setTargets((p) => ({ ...p, wsaTarget: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Pipeline Katsayısı</label>
            <input className={inputCls} value={targets.pipelineCoverage} onChange={(e) => setTargets((p) => ({ ...p, pipelineCoverage: e.target.value }))} />
          </div>
        </div>
      </SurfaceCard>

      {/* Temsilci Verileri */}
      <SurfaceCard title="Temsilci RAMP Verileri" description="Pipeline ve paket bazlı satış tutarlarını girin." variant="default">
        {!selectedPeriodId ? (
          <p className="text-sm text-slate-500">Önce sol panelden ay ve yıl seçerek bir dönem oluşturun.</p>
        ) : !loaded ? (
          <p className="text-sm text-slate-500">Yükleniyor...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">Seçili dönemde KPI verisi bulunamadı. Önce KPI verilerini yükleyin.</p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-slate-200 dark:border-slate-600">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50">
                  <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Temsilci</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Pipeline (TRY)</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Grow (TRY)</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Scale (TRY)</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Scale+ (TRY)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.agentKey} className={idx % 2 === 0 ? "bg-white dark:bg-slate-800/30" : "bg-slate-50/50 dark:bg-slate-800/50"}>
                    <td className={`${cellCls} font-medium`}>{row.agentName}</td>
                    <td className={cellCls}><input className={inputCls} value={row.pipeline} onChange={(e) => updateRow(row.agentKey, "pipeline", e.target.value)} placeholder="0" /></td>
                    <td className={cellCls}><input className={inputCls} value={row.growAmount} onChange={(e) => updateRow(row.agentKey, "growAmount", e.target.value)} placeholder="0" /></td>
                    <td className={cellCls}><input className={inputCls} value={row.scaleAmount} onChange={(e) => updateRow(row.agentKey, "scaleAmount", e.target.value)} placeholder="0" /></td>
                    <td className={cellCls}><input className={inputCls} value={row.scalePlusAmount} onChange={(e) => updateRow(row.agentKey, "scalePlusAmount", e.target.value)} placeholder="0" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            className="inline-flex items-center gap-2 rounded-[10px] bg-[#2f6b7a] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#285d6a] disabled:opacity-50"
            disabled={saving || rows.length === 0}
            onClick={() => void handleSave()}
            type="button"
          >
            <Save size={15} />
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </SurfaceCard>
    </div>
  );
}
