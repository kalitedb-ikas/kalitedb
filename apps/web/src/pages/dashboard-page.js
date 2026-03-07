import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Leaderboard, SectionCard, StatCard } from "@kalitedb/ui";
import { useSearchParams } from "react-router-dom";
import { MetricBarChart } from "../components/metric-chart";
import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatDelta, formatNumber, formatPercent } from "../lib/format";
export function DashboardPage() {
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
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(PeriodFilters, { compareToPeriodId: compareToPeriodId, onCompareChange: (value) => {
                    const next = new URLSearchParams(searchParams);
                    if (value) {
                        next.set("compareToPeriodId", value);
                    }
                    else {
                        next.delete("compareToPeriodId");
                    }
                    setSearchParams(next);
                }, onPeriodChange: (value) => {
                    const next = new URLSearchParams(searchParams);
                    next.set("periodId", value);
                    setSearchParams(next);
                }, periodId: periodId, periods: periodsQuery.data ?? [] }), snapshot ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid gap-4 md:grid-cols-2 xl:grid-cols-4", children: [_jsx(StatCard, { label: "Audit ortalamasi", tone: "green", value: formatPercent(snapshot.summary.auditAverage) }), _jsx(StatCard, { label: "Missing questions", tone: "yellow", value: formatPercent(snapshot.summary.missingQuestionsAverage) }), _jsx(StatCard, { label: "CSAT ortalamasi", tone: "neutral", value: formatNumber(snapshot.summary.csatAverage, 3) }), _jsx(StatCard, { label: "Toplam gorusme", tone: "neutral", value: formatNumber(snapshot.summary.totalConversationCount) })] }), _jsxs("div", { className: "grid gap-4 xl:grid-cols-2", children: [_jsx(SectionCard, { title: "Aylik vurucu ozet", description: "Yukselen ve dusen isimler bir onceki secilen aya gore hesaplanir.", children: _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsx(StatCard, { hint: snapshot.highlights.bestAudit ? snapshot.highlights.bestAudit.label : "Veri yok", label: "En yuksek audit", tone: "green", value: formatPercent(snapshot.highlights.bestAudit?.value) }), _jsx(StatCard, { hint: snapshot.highlights.lowestAudit ? snapshot.highlights.lowestAudit.label : "Veri yok", label: "En dusuk audit", tone: "red", value: formatPercent(snapshot.highlights.lowestAudit?.value) }), _jsx(StatCard, { hint: snapshot.highlights.bestCsat ? snapshot.highlights.bestCsat.label : "Veri yok", label: "En yuksek CSAT", tone: "green", value: formatNumber(snapshot.highlights.bestCsat?.value, 3) }), _jsx(StatCard, { hint: snapshot.highlights.mostImproved
                                                ? `${snapshot.highlights.mostImproved.label} (${formatDelta(snapshot.highlights.mostImproved.delta)})`
                                                : "Veri yok", label: "En cok yukselen", tone: "yellow", value: snapshot.highlights.mostImproved?.label ?? "-" })] }) }), _jsx(MetricBarChart, { color: "#EB7155", data: (snapshot.rankings.auditTop ?? []).map((item) => ({
                                    label: item.label,
                                    value: item.value ?? 0
                                })) })] }), _jsxs("div", { className: "grid gap-4 xl:grid-cols-2", children: [_jsx(Leaderboard, { items: snapshot.rankings.auditTop.map((item) => ({
                                    id: item.id,
                                    label: item.label,
                                    value: formatPercent(item.value),
                                    delta: formatDelta(item.delta)
                                })), title: "Audit liderleri" }), _jsx(Leaderboard, { items: snapshot.rankings.csatTop.map((item) => ({
                                    id: item.id,
                                    label: item.label,
                                    value: formatNumber(item.value, 3),
                                    delta: formatDelta(item.delta)
                                })), title: "CSAT liderleri" })] })] })) : (_jsx(SectionCard, { title: "Dashboard", children: _jsx("p", { className: "text-sm text-slate-500", children: "Veri yukleniyor veya henuz donem bulunmuyor." }) }))] }));
}
