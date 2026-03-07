import { zodResolver } from "@hookform/resolvers/zod";
import { getTemplateContent, type DatasetType, type KpiMetricKey } from "@kalitedb/shared";
import { SectionCard } from "@kalitedb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
    defaultValues: {
      month: "",
      title: "",
      compareToPeriodId: ""
    }
  });
  const roleForm = useForm<z.infer<typeof roleSchema>>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      email: "",
      role: "team"
    }
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
      if (!file || !selectedPeriodId) {
        throw new Error("Dönem ve dosya seçin.");
      }

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

  const datasetRows = useMemo(() => {
    if (!periodDetailsQuery.data) {
      return [];
    }

    if (selectedDatasetType === "agent-metrics") {
      return periodDetailsQuery.data.datasets.agentMetrics;
    }

    if (selectedDatasetType === "question-performance") {
      return periodDetailsQuery.data.datasets.questionPerformance;
    }

    return periodDetailsQuery.data.datasets.qtMetrics;
  }, [periodDetailsQuery.data, selectedDatasetType]);

  const selectedRecord =
    datasetRows.find((record) => record.id === selectedRecordId) ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Dönem oluştur" description="Yeni taslak ay oluşturulur ve içe aktarımlar bu taslak altında toplanır.">
          <form className="grid gap-4" onSubmit={periodForm.handleSubmit((values) => createPeriodMutation.mutate(values))}>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Ay
              <input className="rounded-2xl border border-slate-200 px-3 py-2" placeholder="2026-02" {...periodForm.register("month")} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Başlık
              <input className="rounded-2xl border border-slate-200 px-3 py-2" placeholder="CS Şubat 2026" {...periodForm.register("title")} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Karşılaştırma dönemi
              <select className="rounded-2xl border border-slate-200 px-3 py-2" {...periodForm.register("compareToPeriodId")}>
                <option value="">Seçiniz</option>
                {(periodsQuery.data ?? []).map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white" type="submit">
              Dönem oluştur
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Taslak yönetimi" description="Seçili dönem için içe aktarma, düzenleme ve yayımlama adımları burada yönetilir.">
          <div className="grid gap-4">
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Dönem seç
              <select className="rounded-2xl border border-slate-200 px-3 py-2" onChange={(event) => setSelectedPeriodId(event.target.value)} value={selectedPeriodId}>
                <option value="">Dönem seçin</option>
                {(periodsQuery.data ?? []).map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.title} ({period.status})
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-full border px-4 py-2 text-sm font-semibold" onClick={() => publishMutation.mutate("publish")} type="button">
                Yayımla
              </button>
              <button className="rounded-full border px-4 py-2 text-sm font-semibold" onClick={() => publishMutation.mutate("reopen")} type="button">
                Taslağa geri al
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="CSV içe aktar" description="Önce ön izleme alın, sonra veriyi taslağa kaydedin.">
        <div className="grid gap-4 xl:grid-cols-3">
          {(["agent-metrics", "question-performance", "qt-metrics"] as DatasetType[]).map((datasetType) => (
            <div key={datasetType} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{datasetLabels[datasetType]}</p>
              <input
                className="mt-4 block w-full text-sm"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setSelectedFiles((current) => ({ ...current, [datasetType]: file }));
                }}
                type="file"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-full border px-4 py-2 text-xs font-semibold" onClick={() => importMutation.mutate({ datasetType, commit: false })} type="button">
                  Ön izleme
                </button>
                <button className="rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white" onClick={() => importMutation.mutate({ datasetType, commit: true })} type="button">
                  İçe aktar
                </button>
                <button
                  className="rounded-full border px-4 py-2 text-xs font-semibold"
                  onClick={() => {
                    const content = getTemplateContent(datasetType);
                    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `${datasetType}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                  type="button"
                >
                  Şablonu indir
                </button>
              </div>
            </div>
          ))}
        </div>
        {importMutation.data ? (
          <pre className="mt-4 overflow-auto rounded-3xl bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(importMutation.data, null, 2)}
          </pre>
        ) : null}
      </SectionCard>

      <SectionCard title="Taslak düzenleyici" description="Seçili veri kümesindeki satırları düzenleyip yeniden kaydedebilirsiniz.">
        <div className="flex flex-wrap gap-3">
          <select className="rounded-2xl border border-slate-200 px-3 py-2" onChange={(event) => setSelectedDatasetType(event.target.value as DatasetType)} value={selectedDatasetType}>
            <option value="agent-metrics">{datasetLabels["agent-metrics"]}</option>
            <option value="question-performance">{datasetLabels["question-performance"]}</option>
            <option value="qt-metrics">{datasetLabels["qt-metrics"]}</option>
          </select>
        </div>
        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="px-4 py-3">Kayıt</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {datasetRows.slice(0, 12).map((record) => (
                <tr key={record.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">{JSON.stringify(record)}</td>
                  <td className="px-4 py-3">
                    <button className="rounded-full border px-4 py-2 text-xs font-semibold" onClick={() => setSelectedRecordId(record.id)} type="button">
                      Düzenle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <RecordEditor
        onSave={async (updates) => {
          if (!selectedPeriodId || !selectedRecord) {
            return;
          }

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

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Eşik ayarları" description="Kırmızı-sarı-yeşil bantları yönetim panelinden düzenlenir.">
          <div className="space-y-4">
            {thresholdKeys.map((key) => {
              const threshold = thresholdsQuery.data?.[key];
              if (!threshold) {
                return null;
              }

              return (
                <div key={key} className="grid gap-3 rounded-3xl border border-slate-200 p-4 md:grid-cols-3">
                  <p className="md:col-span-3 text-sm font-semibold text-slate-900">{threshold.label}</p>
                  <label className="flex flex-col gap-2 text-sm">
                    Kırmızı
                    <input
                      className="rounded-2xl border border-slate-200 px-3 py-2"
                      onChange={(event) =>
                        queryClient.setQueryData(["thresholds", auth.token], (current: typeof thresholdsQuery.data) =>
                          current
                            ? {
                                ...current,
                                [key]: { ...current[key], red: Number(event.target.value) }
                              }
                            : current
                        )
                      }
                      value={threshold.red}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    Sarı
                    <input
                      className="rounded-2xl border border-slate-200 px-3 py-2"
                      onChange={(event) =>
                        queryClient.setQueryData(["thresholds", auth.token], (current: typeof thresholdsQuery.data) =>
                          current
                            ? {
                                ...current,
                                [key]: { ...current[key], yellow: Number(event.target.value) }
                              }
                            : current
                        )
                      }
                      value={threshold.yellow}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    Yeşil
                    <input
                      className="rounded-2xl border border-slate-200 px-3 py-2"
                      onChange={(event) =>
                        queryClient.setQueryData(["thresholds", auth.token], (current: typeof thresholdsQuery.data) =>
                          current
                            ? {
                                ...current,
                                [key]: { ...current[key], green: Number(event.target.value) }
                              }
                            : current
                        )
                      }
                      value={threshold.green}
                    />
                  </label>
                </div>
              );
            })}
          </div>
          <button className="mt-4 rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white" onClick={() => thresholdMutation.mutate()} type="button">
            Eşikleri kaydet
          </button>
        </SectionCard>

        <SectionCard title="Rol atama" description="Firebase custom claims yapısıyla uyumlu rol kaydı oluşturulur.">
          <form className="grid gap-4" onSubmit={roleForm.handleSubmit((values) => roleMutation.mutate(values))}>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              E-posta
              <input className="rounded-2xl border border-slate-200 px-3 py-2" {...roleForm.register("email")} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Rol
              <select className="rounded-2xl border border-slate-200 px-3 py-2" {...roleForm.register("role")}>
                <option value="admin">Admin</option>
                <option value="team">Ekip</option>
                <option value="ceo">CEO</option>
              </select>
            </label>
            <button className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white" type="submit">
              Rol ekle
            </button>
          </form>
          <div className="mt-6">
            <DataTable
              columns={[
                {
                  header: "E-posta",
                  accessorKey: "email"
                },
                {
                  header: "Rol",
                  accessorKey: "role"
                }
              ]}
              data={rolesQuery.data ?? []}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
