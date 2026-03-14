import { zodResolver } from "@hookform/resolvers/zod";
import { getTemplateContent, type DatasetType, type KpiMetricKey } from "@kalitedb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  User,
  BarChart3,
  ClipboardCheck,
  Upload,
  Eye,
  FileDown,
  Settings2,
  UserPlus
} from "lucide-react";

import { DataTable } from "../components/data-table";
import { RecordEditor } from "../components/record-editor";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

const createPeriodSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  title: z.string().min(1),
  compareToPeriodId: z.string().optional()
});

const roleSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "team", "ceo"])
});

const thresholdKeys = [
  "auditScore",
  "missingQuestionsAccuracy",
  "callEvaluationAverage",
  "localCloseRate",
  "avgTalkDurationSeconds",
  "feedbackCoverage"
] satisfies KpiMetricKey[];

const datasetLabels: Record<DatasetType, string> = {
  "agent-metrics": "Temsilci performans özeti",
  "question-performance": "Soru performansı",
  "qt-metrics": "QT dinleme kayıtları"
};

export function AdminPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedDatasetType, setSelectedDatasetType] = useState<DatasetType>("agent-metrics");
  const [selectedRecordId, setSelectedRecordId] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<DatasetType, File>>>({});

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token)
  });
  const thresholdsQuery = useQuery({
    enabled: auth.token !== null,
    queryKey: ["thresholds", auth.token],
    queryFn: () => api.getThresholds(auth.token)
  });
  const rolesQuery = useQuery({
    enabled: auth.token !== null,
    queryKey: ["roles", auth.token],
    queryFn: () => api.getRoles(auth.token)
  });
  const periodDetailsQuery = useQuery({
    enabled: Boolean(selectedPeriodId),
    queryKey: ["period-details", auth.token, selectedPeriodId],
    queryFn: () => api.getPeriodDetails(auth.token, selectedPeriodId)
  });

  const periodForm = useForm<z.infer<typeof createPeriodSchema>>({
    resolver: zodResolver(createPeriodSchema),
    defaultValues: { month: "", title: "", compareToPeriodId: "" }
  });
  const roleForm = useForm<z.infer<typeof roleSchema>>({
    resolver: zodResolver(roleSchema),
    defaultValues: { email: "", role: "team" }
  });

  const createPeriodMutation = useMutation({
    mutationFn: (values: z.infer<typeof createPeriodSchema>) =>
      api.createPeriod(auth.token, {
        month: values.month,
        title: values.title,
        compareToPeriodId: values.compareToPeriodId || undefined
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      periodForm.reset();
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
      if (!file || !selectedPeriodId) throw new Error("Dönem ve dosya seçin.");
      return api.importDataset(auth.token, selectedPeriodId, input.datasetType, file, input.commit);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });

  const roleMutation = useMutation({
    mutationFn: (values: z.infer<typeof roleSchema>) => api.createRole(auth.token, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      roleForm.reset();
    }
  });

  const thresholdMutation = useMutation({
    mutationFn: () => {
      const current = thresholdsQuery.data;
      if (!current) throw new Error("Eşik verisi bulunamadı.");
      const payload = thresholdKeys.reduce<Record<KpiMetricKey, Partial<typeof current[KpiMetricKey]>>>(
        (acc, key) => { acc[key] = current[key]; return acc; },
        {} as Record<KpiMetricKey, Partial<typeof current[KpiMetricKey]>>
      );
      return api.updateThresholds(auth.token, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["thresholds"] });
    }
  });

  const datasetRows = useMemo(() => {
    if (!periodDetailsQuery.data) return [];
    if (selectedDatasetType === "agent-metrics") return periodDetailsQuery.data.datasets.agentMetrics;
    if (selectedDatasetType === "question-performance") return periodDetailsQuery.data.datasets.questionPerformance;
    return periodDetailsQuery.data.datasets.qtMetrics;
  }, [periodDetailsQuery.data, selectedDatasetType]);

  const selectedRecord = datasetRows.find((r) => r.id === selectedRecordId) ?? null;

  return (
    <div className="max-w-5xl mx-auto p-8">
      {/* Header */}
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Yönetim Paneli</h2>
        <p className="text-slate-500 mt-1">Dönem oluşturma, veri aktarımı ve ayarlar.</p>
      </header>

      <div className="space-y-6">
        {/* Section: Period Creation */}
        <FormSection icon={<User size={16} />} title="Dönem Bilgileri">
          <form
            className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6"
            onSubmit={periodForm.handleSubmit((v) => createPeriodMutation.mutate(v))}
          >
            <FormField label="Ay (YYYY-AA)">
              <input
                className="form-input w-full rounded-lg border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-primary h-11"
                placeholder="2026-02"
                {...periodForm.register("month")}
              />
            </FormField>
            <FormField label="Başlık">
              <input
                className="form-input w-full rounded-lg border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-primary h-11"
                placeholder="CS Şubat 2026"
                {...periodForm.register("title")}
              />
            </FormField>
            <FormField label="Karşılaştırma Dönemi">
              <select
                className="form-select w-full rounded-lg border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-primary h-11"
                {...periodForm.register("compareToPeriodId")}
              >
                <option value="">Seçiniz</option>
                {(periodsQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </FormField>
            <div className="flex items-end">
              <button
                className="px-8 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all h-11"
                type="submit"
              >
                Dönem Oluştur
              </button>
            </div>
          </form>
        </FormSection>

        {/* Section: Draft Management */}
        <FormSection icon={<BarChart3 size={16} />} title="Taslak Yönetimi">
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Dönem Seç">
              <select
                className="form-select w-full rounded-lg border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-primary h-11"
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                value={selectedPeriodId}
              >
                <option value="">Dönem seçin</option>
                {(periodsQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
                ))}
              </select>
            </FormField>
            <div className="flex items-end gap-3">
              <button
                className="px-6 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors h-11"
                onClick={() => publishMutation.mutate("publish")}
                type="button"
              >
                Yayımla
              </button>
              <button
                className="px-6 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors h-11"
                onClick={() => publishMutation.mutate("reopen")}
                type="button"
              >
                Taslağa Geri Al
              </button>
            </div>
          </div>
        </FormSection>

        {/* Section: CSV Import */}
        <FormSection icon={<Upload size={16} />} title="CSV İçe Aktarım">
          <div className="p-6">
            <div className="grid gap-4 xl:grid-cols-3">
              {(["agent-metrics", "question-performance", "qt-metrics"] as DatasetType[]).map((dt) => (
                <div key={dt} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-3">{datasetLabels[dt]}</p>
                  <input
                    className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setSelectedFiles((c) => ({ ...c, [dt]: file }));
                    }}
                    type="file"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white transition-colors"
                      onClick={() => importMutation.mutate({ datasetType: dt, commit: false })}
                      type="button"
                    >
                      <Eye size={14} /> Ön İzleme
                    </button>
                    <button
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
                      onClick={() => importMutation.mutate({ datasetType: dt, commit: true })}
                      type="button"
                    >
                      <Upload size={14} /> İçe Aktar
                    </button>
                    <button
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white transition-colors"
                      onClick={() => {
                        const content = getTemplateContent(dt);
                        const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `${dt}.csv`;
                        link.click();
                        URL.revokeObjectURL(url);
                      }}
                      type="button"
                    >
                      <FileDown size={14} /> Şablon
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {importMutation.data ? (
              <pre className="mt-4 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(importMutation.data, null, 2)}
              </pre>
            ) : null}
          </div>
        </FormSection>

        {/* Section: Draft Editor (Table) */}
        <FormSection icon={<ClipboardCheck size={16} />} title="Taslak Düzenleyici">
          <div className="p-6">
            <div className="flex flex-wrap gap-3 mb-4">
              <select
                className="form-select rounded-lg border-slate-200 px-3 py-2 text-sm"
                onChange={(e) => setSelectedDatasetType(e.target.value as DatasetType)}
                value={selectedDatasetType}
              >
                <option value="agent-metrics">{datasetLabels["agent-metrics"]}</option>
                <option value="question-performance">{datasetLabels["question-performance"]}</option>
                <option value="qt-metrics">{datasetLabels["qt-metrics"]}</option>
              </select>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-500">
                    <th className="px-6 py-3 border-b border-slate-100">Kayıt</th>
                    <th className="px-6 py-3 border-b border-slate-100 text-center w-32">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {datasetRows.slice(0, 12).map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-700 max-w-md truncate">
                        {JSON.stringify(record)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          className="text-primary text-sm font-semibold hover:underline"
                          onClick={() => setSelectedRecordId(record.id)}
                          type="button"
                        >
                          Düzenle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </FormSection>

        <RecordEditor
          onSave={async (updates) => {
            if (!selectedPeriodId || !selectedRecord) return;
            await api.updatePeriod(auth.token, selectedPeriodId, {
              datasetType: selectedDatasetType,
              recordId: selectedRecord.id,
              updates
            });
            await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
          }}
          record={selectedRecord as Record<string, string | number | null> | null}
          title="Kayıt düzenleyici"
        />

        {/* Threshold & Role Grid */}
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Thresholds */}
          <FormSection icon={<Settings2 size={16} />} title="Eşik Ayarları">
            <div className="p-6 space-y-4">
              {thresholdKeys.map((key) => {
                const t = thresholdsQuery.data?.[key];
                if (!t) return null;
                return (
                  <div key={key} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-3">
                    <p className="md:col-span-3 text-sm font-semibold text-slate-900">{t.label}</p>
                    {(["red", "yellow", "green"] as const).map((band) => (
                      <FormField key={band} label={band === "red" ? "Kırmızı" : band === "yellow" ? "Sarı" : "Yeşil"}>
                        <input
                          className="form-input w-full rounded-lg border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-primary h-10 text-sm"
                          onChange={(e) =>
                            queryClient.setQueryData(["thresholds", auth.token], (cur: typeof thresholdsQuery.data) =>
                              cur ? { ...cur, [key]: { ...cur[key], [band]: Number(e.target.value) } } : cur
                            )
                          }
                          value={t[band]}
                        />
                      </FormField>
                    ))}
                  </div>
                );
              })}
              <button
                className="px-8 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                onClick={() => thresholdMutation.mutate()}
                type="button"
              >
                Eşikleri Kaydet
              </button>
            </div>
          </FormSection>

          {/* Role Assignment */}
          <FormSection icon={<UserPlus size={16} />} title="Rol Atama">
            <div className="p-6">
              <form
                className="grid gap-4"
                onSubmit={roleForm.handleSubmit((v) => roleMutation.mutate(v))}
              >
                <FormField label="E-posta">
                  <input
                    className="form-input w-full rounded-lg border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-primary h-11"
                    {...roleForm.register("email")}
                  />
                </FormField>
                <FormField label="Rol">
                  <select
                    className="form-select w-full rounded-lg border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-primary h-11"
                    {...roleForm.register("role")}
                  >
                    <option value="admin">Admin</option>
                    <option value="team">Ekip</option>
                    <option value="ceo">CEO</option>
                  </select>
                </FormField>
                <button
                  className="px-8 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                  type="submit"
                >
                  Rol Ekle
                </button>
              </form>
              <div className="mt-6">
                <DataTable
                  columns={[
                    { header: "E-posta", accessorKey: "email" },
                    { header: "Rol", accessorKey: "role" }
                  ]}
                  data={rolesQuery.data ?? []}
                />
              </div>
            </div>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function FormSection(props: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          {props.icon}
          {props.title}
        </h3>
      </div>
      {props.children}
    </div>
  );
}

function FormField(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-slate-700">{props.label}</label>
      {props.children}
    </div>
  );
}
