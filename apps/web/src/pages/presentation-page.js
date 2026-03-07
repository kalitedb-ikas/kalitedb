import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PresentationSlide, StatCard } from "@kalitedb/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatNumber, formatPercent } from "../lib/format";
export function PresentationPage() {
    const auth = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeSlide, setActiveSlide] = useState(0);
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
    useEffect(() => {
        const handler = (event) => {
            if (event.key === "ArrowRight") {
                setActiveSlide((current) => current + 1);
            }
            if (event.key === "ArrowLeft") {
                setActiveSlide((current) => Math.max(0, current - 1));
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);
    const snapshot = dashboardQuery.data;
    const slides = snapshot
        ? [
            _jsx(PresentationSlide, { eyebrow: "Genel Bakis", subtitle: "Toplantida hizli acilis icin yonetici ozeti.", title: snapshot.period.title, children: _jsxs("div", { className: "grid gap-4 md:grid-cols-2 xl:grid-cols-4", children: [_jsx(StatCard, { label: "Audit", tone: "green", value: formatPercent(snapshot.summary.auditAverage) }), _jsx(StatCard, { label: "CSAT", tone: "green", value: formatNumber(snapshot.summary.csatAverage, 3) }), _jsx(StatCard, { label: "Missing Questions", tone: "yellow", value: formatPercent(snapshot.summary.missingQuestionsAverage) }), _jsx(StatCard, { label: "Toplam Gorusme", tone: "neutral", value: formatNumber(snapshot.summary.totalConversationCount) })] }) }, "summary"),
            _jsx(PresentationSlide, { eyebrow: "Audit", title: "Audit liderleri ve risk alanlari", children: _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "rounded-3xl border border-slate-200 p-6", children: [_jsx("h3", { className: "text-2xl font-semibold", children: "En yuksek audit" }), _jsx("p", { className: "mt-4 text-5xl font-semibold text-emerald-700", children: snapshot.highlights.bestAudit?.label ?? "-" }), _jsx("p", { className: "mt-2 text-xl text-slate-600", children: formatPercent(snapshot.highlights.bestAudit?.value) })] }), _jsxs("div", { className: "rounded-3xl border border-slate-200 p-6", children: [_jsx("h3", { className: "text-2xl font-semibold", children: "En dusuk audit" }), _jsx("p", { className: "mt-4 text-5xl font-semibold text-rose-700", children: snapshot.highlights.lowestAudit?.label ?? "-" }), _jsx("p", { className: "mt-2 text-xl text-slate-600", children: formatPercent(snapshot.highlights.lowestAudit?.value) })] })] }) }, "audit"),
            _jsx(PresentationSlide, { eyebrow: "CSAT", title: "CSAT one cikanlar", children: _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "rounded-3xl border border-slate-200 p-6", children: [_jsx("h3", { className: "text-2xl font-semibold", children: "En yuksek CSAT" }), _jsx("p", { className: "mt-4 text-5xl font-semibold text-emerald-700", children: snapshot.highlights.bestCsat?.label ?? "-" }), _jsx("p", { className: "mt-2 text-xl text-slate-600", children: formatNumber(snapshot.highlights.bestCsat?.value, 3) })] }), _jsxs("div", { className: "rounded-3xl border border-slate-200 p-6", children: [_jsx("h3", { className: "text-2xl font-semibold", children: "En cok yukselen" }), _jsx("p", { className: "mt-4 text-5xl font-semibold text-amber-700", children: snapshot.highlights.mostImproved?.label ?? "-" }), _jsx("p", { className: "mt-2 text-xl text-slate-600", children: formatNumber(snapshot.highlights.mostImproved?.delta, 2) })] })] }) }, "csat"),
            _jsx(PresentationSlide, { eyebrow: "Sorular", title: "En zayif soru basliklari", children: _jsx("div", { className: "grid gap-4", children: snapshot.rankings.weakestQuestions.map((question) => (_jsxs("div", { className: "rounded-3xl border border-slate-200 p-5", children: [_jsx("p", { className: "text-sm uppercase tracking-[0.2em] text-slate-500", children: question.topic }), _jsx("p", { className: "mt-2 text-2xl font-semibold text-slate-950", children: question.questionText }), _jsx("p", { className: "mt-2 text-lg text-rose-700", children: formatPercent(question.accuracyRate) })] }, question.id))) }) }, "questions")
        ]
        : [];
    const visibleSlide = slides[Math.min(activeSlide, Math.max(slides.length - 1, 0))];
    return (_jsxs("div", { className: "space-y-4 p-6", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-panel", children: [_jsx("select", { className: "rounded-2xl border border-slate-200 px-3 py-2", onChange: (event) => setSearchParams({ periodId: event.target.value, compareToPeriodId: compareToPeriodId ?? "" }), value: periodId, children: (periodsQuery.data ?? []).map((period) => (_jsx("option", { value: period.id, children: period.title }, period.id))) }), _jsxs("select", { className: "rounded-2xl border border-slate-200 px-3 py-2", onChange: (event) => setSearchParams({ periodId: periodId ?? "", compareToPeriodId: event.target.value }), value: compareToPeriodId ?? "", children: [_jsx("option", { value: "", children: "Karsilastirma yok" }), (periodsQuery.data ?? []).map((period) => (_jsx("option", { value: period.id, children: period.title }, period.id)))] }), _jsxs("div", { className: "ml-auto flex gap-2", children: [_jsx("button", { className: "rounded-full border px-4 py-2 text-sm font-semibold", onClick: () => setActiveSlide((current) => Math.max(0, current - 1)), type: "button", children: "Onceki" }), _jsx("button", { className: "rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white", onClick: () => setActiveSlide((current) => Math.min(slides.length - 1, current + 1)), type: "button", children: "Sonraki" })] })] }), visibleSlide] }));
}
