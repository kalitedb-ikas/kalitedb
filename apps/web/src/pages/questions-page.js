import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { HeatChip, Leaderboard, SectionCard } from "@kalitedb/ui";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { DataTable } from "../components/data-table";
import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPercent } from "../lib/format";
const columnHelper = createColumnHelper();
export function QuestionsPage() {
    const auth = useAuth();
    const periodsQuery = useQuery({
        queryKey: ["periods", auth.token],
        queryFn: () => api.getPeriods(auth.token)
    });
    const defaultPeriod = periodsQuery.data?.[0]?.id;
    const [periodId, setPeriodId] = useState(defaultPeriod);
    const [compareToPeriodId, setCompareToPeriodId] = useState();
    const [topic, setTopic] = useState("");
    const dashboardQuery = useQuery({
        enabled: Boolean(periodId),
        queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
        queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId)
    });
    const rows = useMemo(() => {
        const dataset = dashboardQuery.data?.datasets.questionPerformance ?? [];
        if (!topic) {
            return dataset;
        }
        return dataset.filter((item) => item.topic === topic);
    }, [dashboardQuery.data?.datasets.questionPerformance, topic]);
    const topics = Array.from(new Set((dashboardQuery.data?.datasets.questionPerformance ?? []).map((item) => item.topic)));
    const columns = [
        columnHelper.accessor("questionText", {
            header: "Soru"
        }),
        columnHelper.accessor("accuracyRate", {
            header: "Bilinme orani",
            cell: (info) => (_jsx(HeatChip, { tone: info.getValue() >= 90 ? "green" : info.getValue() >= 70 ? "yellow" : "red", value: formatPercent(info.getValue()) }))
        }),
        columnHelper.accessor("correctCount", {
            header: "Dogru"
        }),
        columnHelper.accessor("wrongCount", {
            header: "Yanlis"
        }),
        columnHelper.accessor("topic", {
            header: "Konu"
        })
    ];
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(PeriodFilters, { compareToPeriodId: compareToPeriodId, onCompareChange: (value) => setCompareToPeriodId(value || undefined), onPeriodChange: (value) => setPeriodId(value), periodId: periodId, periods: periodsQuery.data ?? [] }), _jsx(SectionCard, { title: "Konu filtresi", actions: _jsxs("select", { className: "rounded-2xl border border-slate-200 px-3 py-2 text-sm", onChange: (event) => setTopic(event.target.value), value: topic, children: [_jsx("option", { value: "", children: "Tum konular" }), topics.map((item) => (_jsx("option", { value: item, children: item }, item)))] }), children: _jsxs("div", { className: "grid gap-4 xl:grid-cols-2", children: [_jsx(Leaderboard, { items: (dashboardQuery.data?.rankings.weakestQuestions ?? []).map((item) => ({
                                id: item.id,
                                label: item.questionText,
                                value: formatPercent(item.accuracyRate)
                            })), title: "En zayif sorular" }), _jsx(Leaderboard, { items: (dashboardQuery.data?.rankings.strongestQuestions ?? []).map((item) => ({
                                id: item.id,
                                label: item.questionText,
                                value: formatPercent(item.accuracyRate)
                            })), title: "En guclu sorular" })] }) }), _jsx(SectionCard, { title: "Soru performans tablosu", children: _jsx(DataTable, { columns: columns, data: rows }) })] }));
}
