import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { zodResolver } from "@hookform/resolvers/zod";
import { getTemplateContent } from "@kalitedb/shared";
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
];
export function AdminPage() {
    const auth = useAuth();
    const queryClient = useQueryClient();
    const [selectedPeriodId, setSelectedPeriodId] = useState("");
    const [selectedDatasetType, setSelectedDatasetType] = useState("agent-metrics");
    const [selectedRecordId, setSelectedRecordId] = useState("");
    const [selectedFiles, setSelectedFiles] = useState({});
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
    const periodForm = useForm({
        resolver: zodResolver(createPeriodSchema),
        defaultValues: {
            month: "",
            title: "",
            compareToPeriodId: ""
        }
    });
    const roleForm = useForm({
        resolver: zodResolver(roleSchema),
        defaultValues: {
            email: "",
            role: "team"
        }
    });
    const createPeriodMutation = useMutation({
        mutationFn: (values) => api.createPeriod(auth.token, {
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
        mutationFn: (action) => action === "publish"
            ? api.publishPeriod(auth.token, selectedPeriodId)
            : api.reopenPeriod(auth.token, selectedPeriodId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["periods"] });
            await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
        }
    });
    const importMutation = useMutation({
        mutationFn: async (input) => {
            const file = selectedFiles[input.datasetType];
            if (!file || !selectedPeriodId) {
                throw new Error("Donem ve dosya secin");
            }
            return api.importDataset(auth.token, selectedPeriodId, input.datasetType, file, input.commit);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
            await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        }
    });
    const roleMutation = useMutation({
        mutationFn: (values) => api.createRole(auth.token, values),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["roles"] });
            roleForm.reset();
        }
    });
    const thresholdMutation = useMutation({
        mutationFn: () => {
            const current = thresholdsQuery.data;
            if (!current) {
                throw new Error("Threshold verisi bulunamadi");
            }
            const payload = thresholdKeys.reduce((accumulator, key) => {
                accumulator[key] = current[key];
                return accumulator;
            }, {});
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
    const selectedRecord = datasetRows.find((record) => record.id === selectedRecordId) ?? null;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid gap-6 xl:grid-cols-[0.9fr_1.1fr]", children: [_jsx(SectionCard, { title: "Donem olustur", description: "Yeni draft ay olusturulur ve importlar bu draft altina toplanir.", children: _jsxs("form", { className: "grid gap-4", onSubmit: periodForm.handleSubmit((values) => createPeriodMutation.mutate(values)), children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-slate-700", children: ["Ay", _jsx("input", { className: "rounded-2xl border border-slate-200 px-3 py-2", placeholder: "2026-02", ...periodForm.register("month") })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-slate-700", children: ["Baslik", _jsx("input", { className: "rounded-2xl border border-slate-200 px-3 py-2", placeholder: "CS Subat 2026", ...periodForm.register("title") })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-slate-700", children: ["Karsilastirma donemi", _jsxs("select", { className: "rounded-2xl border border-slate-200 px-3 py-2", ...periodForm.register("compareToPeriodId"), children: [_jsx("option", { value: "", children: "Seciniz" }), (periodsQuery.data ?? []).map((period) => (_jsx("option", { value: period.id, children: period.title }, period.id)))] })] }), _jsx("button", { className: "rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white", type: "submit", children: "Donem olustur" })] }) }), _jsx(SectionCard, { title: "Draft yonetimi", description: "Secili donem icin import, duzenleme ve publish adimlari burada.", children: _jsxs("div", { className: "grid gap-4", children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-slate-700", children: ["Donem sec", _jsxs("select", { className: "rounded-2xl border border-slate-200 px-3 py-2", onChange: (event) => setSelectedPeriodId(event.target.value), value: selectedPeriodId, children: [_jsx("option", { value: "", children: "Donem secin" }), (periodsQuery.data ?? []).map((period) => (_jsxs("option", { value: period.id, children: [period.title, " (", period.status, ")"] }, period.id)))] })] }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsx("button", { className: "rounded-full border px-4 py-2 text-sm font-semibold", onClick: () => publishMutation.mutate("publish"), type: "button", children: "Publish et" }), _jsx("button", { className: "rounded-full border px-4 py-2 text-sm font-semibold", onClick: () => publishMutation.mutate("reopen"), type: "button", children: "Draft'a geri al" })] })] }) })] }), _jsxs(SectionCard, { title: "CSV import", description: "Ilk adimda preview al, sonra commit ile draft veri tabanina yaz.", children: [_jsx("div", { className: "grid gap-4 xl:grid-cols-3", children: ["agent-metrics", "question-performance", "qt-metrics"].map((datasetType) => (_jsxs("div", { className: "rounded-3xl border border-slate-200 bg-slate-50 p-4", children: [_jsx("p", { className: "text-sm font-semibold text-slate-900", children: datasetType }), _jsx("input", { className: "mt-4 block w-full text-sm", onChange: (event) => {
                                        const file = event.target.files?.[0];
                                        if (!file)
                                            return;
                                        setSelectedFiles((current) => ({ ...current, [datasetType]: file }));
                                    }, type: "file" }), _jsxs("div", { className: "mt-4 flex flex-wrap gap-2", children: [_jsx("button", { className: "rounded-full border px-4 py-2 text-xs font-semibold", onClick: () => importMutation.mutate({ datasetType, commit: false }), type: "button", children: "Preview" }), _jsx("button", { className: "rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white", onClick: () => importMutation.mutate({ datasetType, commit: true }), type: "button", children: "Commit" }), _jsx("button", { className: "rounded-full border px-4 py-2 text-xs font-semibold", onClick: () => {
                                                const content = getTemplateContent(datasetType);
                                                const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
                                                const url = URL.createObjectURL(blob);
                                                const link = document.createElement("a");
                                                link.href = url;
                                                link.download = `${datasetType}.csv`;
                                                link.click();
                                                URL.revokeObjectURL(url);
                                            }, type: "button", children: "Template indir" })] })] }, datasetType))) }), importMutation.data ? (_jsx("pre", { className: "mt-4 overflow-auto rounded-3xl bg-slate-950 p-4 text-xs text-slate-100", children: JSON.stringify(importMutation.data, null, 2) })) : null] }), _jsxs(SectionCard, { title: "Draft editor", description: "Secili dataset satirlarini tiklayip yeniden kaydedebilirsiniz.", children: [_jsx("div", { className: "flex flex-wrap gap-3", children: _jsxs("select", { className: "rounded-2xl border border-slate-200 px-3 py-2", onChange: (event) => setSelectedDatasetType(event.target.value), value: selectedDatasetType, children: [_jsx("option", { value: "agent-metrics", children: "agent-metrics" }), _jsx("option", { value: "question-performance", children: "question-performance" }), _jsx("option", { value: "qt-metrics", children: "qt-metrics" })] }) }), _jsx("div", { className: "mt-4 overflow-hidden rounded-3xl border border-slate-200", children: _jsxs("table", { className: "min-w-full text-left text-sm", children: [_jsx("thead", { className: "bg-slate-950 text-white", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Kayit" }), _jsx("th", { className: "px-4 py-3", children: "Islem" })] }) }), _jsx("tbody", { children: datasetRows.slice(0, 12).map((record) => (_jsxs("tr", { className: "border-b border-slate-100", children: [_jsx("td", { className: "px-4 py-3", children: JSON.stringify(record) }), _jsx("td", { className: "px-4 py-3", children: _jsx("button", { className: "rounded-full border px-4 py-2 text-xs font-semibold", onClick: () => setSelectedRecordId(record.id), type: "button", children: "Duzenle" }) })] }, record.id))) })] }) })] }), _jsx(RecordEditor, { onSave: async (updates) => {
                    if (!selectedPeriodId || !selectedRecord) {
                        return;
                    }
                    await api.updatePeriod(auth.token, selectedPeriodId, {
                        datasetType: selectedDatasetType,
                        recordId: selectedRecord.id,
                        updates
                    });
                    await queryClient.invalidateQueries({ queryKey: ["period-details", auth.token, selectedPeriodId] });
                }, record: selectedRecord, title: "Kayit duzenleyici" }), _jsxs("div", { className: "grid gap-6 xl:grid-cols-2", children: [_jsxs(SectionCard, { title: "Threshold ayarlari", description: "Kirmizi-sari-yesil bandlari admin tarafindan yonetilir.", children: [_jsx("div", { className: "space-y-4", children: thresholdKeys.map((key) => {
                                    const threshold = thresholdsQuery.data?.[key];
                                    if (!threshold) {
                                        return null;
                                    }
                                    return (_jsxs("div", { className: "grid gap-3 rounded-3xl border border-slate-200 p-4 md:grid-cols-3", children: [_jsx("p", { className: "md:col-span-3 text-sm font-semibold text-slate-900", children: threshold.label }), _jsxs("label", { className: "flex flex-col gap-2 text-sm", children: ["Kirmizi", _jsx("input", { className: "rounded-2xl border border-slate-200 px-3 py-2", onChange: (event) => queryClient.setQueryData(["thresholds", auth.token], (current) => current
                                                            ? {
                                                                ...current,
                                                                [key]: { ...current[key], red: Number(event.target.value) }
                                                            }
                                                            : current), value: threshold.red })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm", children: ["Sari", _jsx("input", { className: "rounded-2xl border border-slate-200 px-3 py-2", onChange: (event) => queryClient.setQueryData(["thresholds", auth.token], (current) => current
                                                            ? {
                                                                ...current,
                                                                [key]: { ...current[key], yellow: Number(event.target.value) }
                                                            }
                                                            : current), value: threshold.yellow })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm", children: ["Yesil", _jsx("input", { className: "rounded-2xl border border-slate-200 px-3 py-2", onChange: (event) => queryClient.setQueryData(["thresholds", auth.token], (current) => current
                                                            ? {
                                                                ...current,
                                                                [key]: { ...current[key], green: Number(event.target.value) }
                                                            }
                                                            : current), value: threshold.green })] })] }, key));
                                }) }), _jsx("button", { className: "mt-4 rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white", onClick: () => thresholdMutation.mutate(), type: "button", children: "Threshold kaydet" })] }), _jsxs(SectionCard, { title: "Rol atama", description: "Firebase custom claims ile uyumlu rol atama kaydi.", children: [_jsxs("form", { className: "grid gap-4", onSubmit: roleForm.handleSubmit((values) => roleMutation.mutate(values)), children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-slate-700", children: ["E-posta", _jsx("input", { className: "rounded-2xl border border-slate-200 px-3 py-2", ...roleForm.register("email") })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-slate-700", children: ["Rol", _jsxs("select", { className: "rounded-2xl border border-slate-200 px-3 py-2", ...roleForm.register("role"), children: [_jsx("option", { value: "admin", children: "admin" }), _jsx("option", { value: "team", children: "team" }), _jsx("option", { value: "ceo", children: "ceo" })] })] }), _jsx("button", { className: "rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white", type: "submit", children: "Rol ekle" })] }), _jsx("div", { className: "mt-6", children: _jsx(DataTable, { columns: [
                                        {
                                            header: "E-posta",
                                            accessorKey: "email"
                                        },
                                        {
                                            header: "Rol",
                                            accessorKey: "role"
                                        }
                                    ], data: rolesQuery.data ?? [] }) })] })] })] }));
}
