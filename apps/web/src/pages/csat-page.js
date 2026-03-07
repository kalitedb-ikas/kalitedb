import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { HeatChip, SectionCard } from "@kalitedb/ui";
import { resolveThresholdTone } from "@kalitedb/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { DataTable } from "../components/data-table";
import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber, formatPercent, formatSeconds } from "../lib/format";
const columnHelper = createColumnHelper();
export function CsatPage() {
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
    const columns = [
        columnHelper.accessor("agentName", { header: "M.T" }),
        columnHelper.accessor("auditScore", {
            header: "Audit",
            cell: (info) => formatPercent(info.getValue())
        }),
        columnHelper.accessor("previousAuditAccuracy", {
            header: "Onceki Audit",
            cell: (info) => formatPercent(info.getValue())
        }),
        columnHelper.accessor("totalCallCount", { header: "Cagri" }),
        columnHelper.accessor("totalChatMailCount", { header: "Chat / Mail" }),
        columnHelper.accessor("totalTicketClosedCount", { header: "Ticket" }),
        columnHelper.accessor("totalConversationCount", { header: "Toplam" }),
        columnHelper.accessor("avgTalkDurationSeconds", {
            header: "Ort. Sure",
            cell: (info) => (_jsx(HeatChip, { tone: snapshot
                    ? resolveThresholdTone(info.getValue(), snapshot.thresholds.avgTalkDurationSeconds)
                    : "neutral", value: formatSeconds(info.getValue()) }))
        }),
        columnHelper.accessor("localCloseRate", {
            header: "Lokal Kapatma",
            cell: (info) => (_jsx(HeatChip, { tone: snapshot ? resolveThresholdTone(info.getValue(), snapshot.thresholds.localCloseRate) : "neutral", value: formatPercent(info.getValue()) }))
        }),
        columnHelper.accessor("missedCalls", { header: "Kacan Cagri" }),
        columnHelper.accessor("callEvaluationAverage", {
            header: "Cagri Degerlendirme",
            cell: (info) => (_jsx(HeatChip, { tone: snapshot ? resolveThresholdTone(info.getValue(), snapshot.thresholds.callEvaluationAverage) : "neutral", value: formatNumber(info.getValue(), 3) }))
        }),
        columnHelper.accessor("evaluationCount", { header: "Degerlendirme Adedi" })
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
                }, periodId: periodId, periods: periodsQuery.data ?? [] }), _jsx(SectionCard, { title: "CSAT raporu", description: "Cagri, chat-mail ve ticket metrikleri ayni tabloda toplanir.", children: _jsx(DataTable, { columns: columns, data: snapshot?.datasets.agentMetrics ?? [] }) })] }));
}
