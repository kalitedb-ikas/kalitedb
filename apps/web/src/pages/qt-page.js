import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { HeatChip, SectionCard } from "@kalitedb/ui";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { resolveThresholdTone } from "@kalitedb/shared";
import { useState } from "react";
import { DataTable } from "../components/data-table";
import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";
const columnHelper = createColumnHelper();
export function QtPage() {
    const auth = useAuth();
    const periodsQuery = useQuery({
        queryKey: ["periods", auth.token],
        queryFn: () => api.getPeriods(auth.token)
    });
    const [periodId, setPeriodId] = useState(periodsQuery.data?.[0]?.id);
    const [compareToPeriodId, setCompareToPeriodId] = useState();
    const dashboardQuery = useQuery({
        enabled: Boolean(periodId),
        queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
        queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId)
    });
    const snapshot = dashboardQuery.data;
    const columns = [
        columnHelper.accessor("specialistName", { header: "Kalite uzmani" }),
        columnHelper.accessor("evaluatedCallCount", { header: "Cagri" }),
        columnHelper.accessor("evaluatedChatMailCount", { header: "Chat / Mail" }),
        columnHelper.accessor("listeningHours", {
            header: "Dinleme saati",
            cell: (info) => formatNumber(info.getValue(), 2)
        }),
        columnHelper.accessor("feedbackCount", { header: "Feedback" }),
        columnHelper.accessor("feedbackTarget", {
            header: "Hedef",
            cell: (info) => formatNumber(info.getValue(), 2)
        }),
        columnHelper.accessor("feedbackCoverage", {
            header: "Coverage",
            cell: (info) => (_jsx(HeatChip, { tone: snapshot ? resolveThresholdTone(info.getValue(), snapshot.thresholds.feedbackCoverage) : "neutral", value: formatNumber(info.getValue(), 2) }))
        })
    ];
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(PeriodFilters, { compareToPeriodId: compareToPeriodId, onCompareChange: (value) => setCompareToPeriodId(value || undefined), onPeriodChange: (value) => setPeriodId(value), periodId: periodId, periods: periodsQuery.data ?? [] }), _jsx(SectionCard, { title: "QT performansi", description: "Her 1 saat dinlemeye minimum 2 feedback hedefi uygulanir.", children: _jsx(DataTable, { columns: columns, data: snapshot?.datasets.qtMetrics ?? [] }) })] }));
}
