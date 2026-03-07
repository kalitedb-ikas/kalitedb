import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { HeatChip, SectionCard } from "@kalitedb/ui";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { resolveThresholdTone } from "@kalitedb/shared";
import { useSearchParams } from "react-router-dom";
import { DataTable } from "../components/data-table";
import { MetricBarChart } from "../components/metric-chart";
import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPercent } from "../lib/format";
const columnHelper = createColumnHelper();
export function AuditPage() {
    const auth = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const periodsQuery = useQuery({
        queryKey: ["periods", auth.token],
        queryFn: () => api.getPeriods(auth.token)
    });
    const periodId = searchParams.get("periodId") ?? periodsQuery.data?.[0]?.id;
    const compareToPeriodId = searchParams.get("compareToPeriodId") ?? undefined;
    const dashboardQuery = useQuery({
        enabled: Boolean(periodId),
        queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
        queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId)
    });
    const snapshot = dashboardQuery.data;
    const auditThreshold = snapshot?.thresholds.auditScore;
    const columns = [
        columnHelper.accessor("agentName", {
            header: "Temsilci"
        }),
        columnHelper.accessor("workstream", {
            header: "Kanal"
        }),
        columnHelper.accessor("auditScore", {
            header: "Audit skoru",
            cell: (info) => (_jsx(HeatChip, { tone: auditThreshold ? resolveThresholdTone(info.getValue(), auditThreshold) : "neutral", value: formatPercent(info.getValue()) }))
        }),
        columnHelper.accessor("missingQuestionsAccuracy", {
            header: "Kalan soru dogruluk",
            cell: (info) => formatPercent(info.getValue())
        }),
        columnHelper.accessor("previousAuditAccuracy", {
            header: "Onceki audit",
            cell: (info) => formatPercent(info.getValue())
        })
    ];
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(PeriodFilters, { compareToPeriodId: compareToPeriodId, onCompareChange: (value) => {
                    const next = new URLSearchParams(searchParams);
                    if (value)
                        next.set("compareToPeriodId", value);
                    else
                        next.delete("compareToPeriodId");
                    setSearchParams(next);
                }, onPeriodChange: (value) => {
                    const next = new URLSearchParams(searchParams);
                    next.set("periodId", value);
                    setSearchParams(next);
                }, periodId: periodId, periods: periodsQuery.data ?? [] }), snapshot ? (_jsxs(_Fragment, { children: [_jsx(MetricBarChart, { data: snapshot.datasets.agentMetrics.map((item) => ({
                            label: item.agentName,
                            value: item.auditScore ?? 0
                        })) }), _jsx(SectionCard, { title: "Temsilci bazli audit sonucu", children: _jsx(DataTable, { columns: columns, data: snapshot.datasets.agentMetrics }) })] })) : null] }));
}
