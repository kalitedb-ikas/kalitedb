import { PageHeader, SurfaceCard } from "@kalitedb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { selectDefaultReportPeriod } from "@kalitedb/shared";
import { CalendarRange, ClipboardCheck, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPeriodMonth } from "../lib/format";

type AdminSection = "periods" | "audit";

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const value = String(i + 1).padStart(2, "0");
  const label = new Intl.DateTimeFormat("tr-TR", { month: "long" }).format(new Date(`2026-${value}-01T00:00:00`));
  return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
});

type AuditEntryRow = {
  id: string;
  agentName: string;
  auditScore: string;
  previousAuditAccuracy: string;
};

function generateId() {
  return Math.random().toString(36).slice(2, 12);
}

export function SalesAdminPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();

  const [selectedSection, setSelectedSection] = useState<AdminSection>("periods");
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [auditRows, setAuditRows] = useState<AuditEntryRow[]>([]);
  const [auditSaveSuccess, setAuditSaveSuccess] = useState(false);

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const salesPeriods = useMemo(
    () => (periodsQuery.data ?? []).filter((p) => (p.department ?? "cs") === "sales"),
    [periodsQuery.data]
  );

  // Seçili yılda hangi aylar mevcut
  const existingMonthMap = useMemo(() => {
    const map = new Map<string, string>(); // "YYYY-MM" → periodId
    for (const p of salesPeriods) {
      if (p.month.startsWith(selectedYear)) {
        map.set(p.month, p.id);
      }
    }
    return map;
  }, [salesPeriods, selectedYear]);

  const periodDetailsQuery = useQuery({
    enabled: Boolean(selectedPeriodId) && selectedSection === "audit",
    queryKey: ["period-details", auth.token, selectedPeriodId],
    queryFn: () => api.getPeriodDetails(auth.token, selectedPeriodId)
  });

  // Dönem seçildiğinde mevcut audit verilerini forma yükle
  useMemo(() => {
    const auditMetrics = periodDetailsQuery.data?.datasets.auditMetrics ?? [];
    if (auditMetrics.length > 0) {
      setAuditRows(
        auditMetrics.map((row) => ({
          id: row.id,
          agentName: row.agentName,
          auditScore: row.auditScore != null ? String(row.auditScore) : "",
          previousAuditAccuracy: row.previousAuditAccuracy != null ? String(row.previousAuditAccuracy) : ""
        }))
      );
    } else if (selectedPeriodId && !periodDetailsQuery.isFetching) {
      setAuditRows([{ id: generateId(), agentName: "", auditScore: "", previousAuditAccuracy: "" }]);
    }
  }, [periodDetailsQuery.data, periodDetailsQuery.isFetching, selectedPeriodId]);

  const selectOrCreatePeriodMutation = useMutation({
    mutationFn: (monthValue: string) => {
      const month = `${selectedYear}-${monthValue}`;
      return api.createPeriod(auth.token, {
        month,
        title: `Satış ${formatPeriodMonth(month, { includeYear: true })} Audit Raporu`,
        department: "sales"
      });
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      setSelectedPeriodId(created.id);
      setSelectedSection("audit");
    }
  });

  const handleMonthClick = (monthValue: string) => {
    const month = `${selectedYear}-${monthValue}`;
    const existingId = existingMonthMap.get(month);
    if (existingId) {
      setSelectedPeriodId(existingId);
      setSelectedSection("audit");
    } else {
      selectOrCreatePeriodMutation.mutate(monthValue);
    }
  };

  const saveAuditMutation = useMutation({
    mutationFn: async () => {
      const validRows = auditRows.filter((row) => row.agentName.trim());
      const header = "Temsilci,Audit skoru,Önceki audit doğruluk oranı";
      const lines = validRows.map((row) =>
        [row.agentName.trim(), row.auditScore, row.previousAuditAccuracy].join(",")
      );
      const csvFile = new File([[header, ...lines].join("\n")], "audit.csv", { type: "text/csv" });
      await api.importDataset(auth.token, selectedPeriodId, "audit-metrics", csvFile, true);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setAuditSaveSuccess(true);
      setTimeout(() => setAuditSaveSuccess(false), 3000);
    }
  });

  const addRow = () =>
    setAuditRows((prev) => [...prev, { id: generateId(), agentName: "", auditScore: "", previousAuditAccuracy: "" }]);

  const removeRow = (id: string) =>
    setAuditRows((prev) => prev.filter((row) => row.id !== id));

  const updateRow = (id: string, field: keyof AuditEntryRow, value: string) =>
    setAuditRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));

  const selectedPeriod = salesPeriods.find((p) => p.id === selectedPeriodId);
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-6">
      <PageHeader title="Satış Yönetim" />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Sol menü */}
        <div className="flex flex-col gap-2">
          <SectionButton
            active={selectedSection === "periods"}
            description="Ay ve yıl seçimi"
            icon={<CalendarRange size={16} strokeWidth={1.8} />}
            label="Dönemler"
            onClick={() => setSelectedSection("periods")}
          />
          <SectionButton
            active={selectedSection === "audit"}
            description="Temsilci bazlı skor girişi"
            icon={<ClipboardCheck size={16} strokeWidth={1.8} />}
            label="Audit girişi"
            onClick={() => setSelectedSection("audit")}
          />
        </div>

        {/* İçerik */}
        <div>
          {selectedSection === "periods" && (
            <SurfaceCard title="Dönem seç" variant="default">
              <div className="space-y-5">
                {/* Yıl seçici */}
                <div className="flex gap-2">
                  {yearOptions.map((y) => (
                    <button
                      key={y}
                      className={[
                        "rounded-full border px-5 py-2 text-sm font-semibold transition",
                        String(y) === selectedYear
                          ? "border-slate-900 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      ].join(" ")}
                      onClick={() => setSelectedYear(String(y))}
                      type="button"
                    >
                      {y}
                    </button>
                  ))}
                </div>

                {/* Ay ızgarası */}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {MONTHS.map((month) => {
                    const key = `${selectedYear}-${month.value}`;
                    const hasData = existingMonthMap.has(key);
                    const isSelected = existingMonthMap.get(key) === selectedPeriodId;
                    const isLoading = selectOrCreatePeriodMutation.isPending &&
                      selectOrCreatePeriodMutation.variables === month.value;

                    return (
                      <button
                        key={month.value}
                        className={[
                          "relative rounded-2xl border px-3 py-4 text-center text-sm font-medium transition",
                          isSelected
                            ? "border-slate-900 bg-slate-950 text-white"
                            : hasData
                            ? "border-slate-300 bg-white text-slate-900 hover:border-slate-400"
                            : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-700"
                        ].join(" ")}
                        disabled={isLoading}
                        onClick={() => handleMonthClick(month.value)}
                        type="button"
                      >
                        {isLoading ? "..." : month.label}
                        {hasData && !isSelected && (
                          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-emerald-400" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="inline-block size-1.5 rounded-full bg-emerald-400" />
                  Veri girilmiş dönemler
                </p>
              </div>
            </SurfaceCard>
          )}

          {selectedSection === "audit" && (
            <SurfaceCard title="Audit Skoru Girişi" variant="default">
              <div className="space-y-4">
                {/* Dönem seçici (audit sekmesinde de erişim için) */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Dönem
                  </label>
                  {salesPeriods.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Henüz dönem yok.{" "}
                      <button
                        className="font-semibold text-slate-900 underline"
                        onClick={() => setSelectedSection("periods")}
                        type="button"
                      >
                        Dönem seç
                      </button>
                    </p>
                  ) : (
                    <select
                      className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 focus:border-primary/40 focus:outline-none"
                      onChange={(e) => setSelectedPeriodId(e.target.value)}
                      value={selectedPeriodId || selectDefaultReportPeriod(salesPeriods)?.id || ""}
                    >
                      <option value="">— Dönem seçin —</option>
                      {salesPeriods.map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedPeriodId && (
                  <>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Temsilci adı</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Audit skoru</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Önceki doğruluk (%)</th>
                            <th className="w-12 px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {auditRows.map((row) => (
                            <tr key={row.id} className="bg-white">
                              <td className="px-4 py-2">
                                <input
                                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:outline-none"
                                  onChange={(e) => updateRow(row.id, "agentName", e.target.value)}
                                  placeholder="Ad Soyad"
                                  type="text"
                                  value={row.agentName}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:outline-none"
                                  max={100}
                                  min={0}
                                  onChange={(e) => updateRow(row.id, "auditScore", e.target.value)}
                                  placeholder="0–100"
                                  step={0.01}
                                  type="number"
                                  value={row.auditScore}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:outline-none"
                                  max={100}
                                  min={0}
                                  onChange={(e) => updateRow(row.id, "previousAuditAccuracy", e.target.value)}
                                  placeholder="0–100"
                                  step={0.01}
                                  type="number"
                                  value={row.previousAuditAccuracy}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <button
                                  className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:text-rose-500"
                                  onClick={() => removeRow(row.id)}
                                  title="Satırı sil"
                                  type="button"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300"
                        onClick={addRow}
                        type="button"
                      >
                        <Plus size={14} />
                        Satır ekle
                      </button>

                      <button
                        className="inline-flex h-9 items-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                        disabled={saveAuditMutation.isPending || auditRows.filter((r) => r.agentName.trim()).length === 0}
                        onClick={() => saveAuditMutation.mutate()}
                        type="button"
                      >
                        <Save size={14} />
                        {saveAuditMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
                      </button>

                      {auditSaveSuccess && (
                        <span className="text-sm font-medium text-emerald-600">Kaydedildi!</span>
                      )}
                      {saveAuditMutation.isError && (
                        <span className="text-sm text-rose-600">Kayıt sırasında hata oluştu.</span>
                      )}
                    </div>

                    {selectedPeriod && (
                      <p className="text-xs text-slate-400">
                        {selectedPeriod.title} · {auditRows.filter((r) => r.agentName.trim()).length} temsilci
                      </p>
                    )}
                  </>
                )}
              </div>
            </SurfaceCard>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionButton(props: {
  active: boolean;
  label: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition",
        props.active
          ? "border-slate-900 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      ].join(" ")}
      onClick={props.onClick}
      type="button"
    >
      <span className={props.active ? "mt-0.5 text-white/70" : "mt-0.5 text-slate-400"}>
        {props.icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{props.label}</span>
        <span className={`block text-xs ${props.active ? "text-white/60" : "text-slate-500"}`}>
          {props.description}
        </span>
      </span>
    </button>
  );
}
