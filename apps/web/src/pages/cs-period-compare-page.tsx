import {
  average,
  buildDashboardSnapshot,
  sum,
  type AgentMetric,
  type AuditMetric
} from "@kalitedb/shared";
import { SectionCard } from "@kalitedb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatAuditScore, formatNumber, formatPercent, formatPeriodMonth, formatSeconds } from "../lib/format";
import { aggregateAgentMetrics, aggregateAuditMetrics, computeActivePeriodIds, derivePeriodRangeSelectors, QUARTER_SHORT } from "../lib/period-aggregation";
import { useRepresentativeKeysExcludedFrom, useRepresentativeKeysWithBadge } from "../lib/use-active-representatives";
import { CompareMetricRow } from "../components/compare/compare-metric-row";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";

/* ── Varsayılan dönemler: Sol = iki ay önce, Sağ = en son kapanan ay ── */

function makeDefaultPeriodRange(monthsAgo: number): () => PeriodRangeValue {
  return () => {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    const year = String(target.getFullYear());
    const quarter = Math.ceil((target.getMonth() + 1) / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  };
}

/* ── Tek bir taraf için dönem → toplu veri çözümleme ── */

function useCsPeriodSide(
  auth: { token: string | null },
  csPeriods: ReturnType<typeof derivePeriodRangeSelectors> extends { yearPeriods: infer T } ? T : never,
  periodRange: PeriodRangeValue,
  setPeriodRange: (fn: (prev: PeriodRangeValue) => PeriodRangeValue) => void,
  dashboardExcludedKeys: Set<string>,
  premiumOnboardingKeys: Set<string>
) {
  const yearPeriods = useMemo(
    () => derivePeriodRangeSelectors(csPeriods as any, periodRange.year).yearPeriods,
    [csPeriods, periodRange.year]
  );

  const now = new Date();
  const defaultPeriod = useMemo(() => {
    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
    return yearPeriods.find((p) => p.month === prevMonth) ?? yearPeriods[yearPeriods.length - 1];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearPeriods]);

  const monthlyPeriodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId) ? periodRange.monthPeriodId : defaultPeriod?.id;

  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
  }, [defaultPeriod?.id, periodRange.monthPeriodId, setPeriodRange]);

  const activePeriodIds = useMemo(
    () => computeActivePeriodIds(yearPeriods, { ...periodRange, monthPeriodId: monthlyPeriodId }),
    [periodRange, monthlyPeriodId, yearPeriods]
  );
  const activePeriodIdsKey = activePeriodIds.join(",");

  const agentMetricsBulkQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["cs-period-compare-agent-bulk", auth.token, activePeriodIdsKey],
    queryFn: () => api.getAgentMetricsForPeriods(auth.token, activePeriodIds),
    staleTime: 60 * 1000
  });
  const auditMetricsBulkQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["cs-period-compare-audit-bulk", auth.token, activePeriodIdsKey],
    queryFn: () => api.getAuditMetricsForPeriods(auth.token, activePeriodIds),
    staleTime: 60 * 1000
  });

  const referencePeriod = yearPeriods.find((p) => p.id === monthlyPeriodId) ?? yearPeriods[yearPeriods.length - 1];

  const snapshot = useMemo(() => {
    const agentMap = agentMetricsBulkQuery.data;
    const auditMap = auditMetricsBulkQuery.data;
    if (!agentMap || !auditMap || !referencePeriod || activePeriodIds.length === 0) return undefined;

    const agentPerPeriod = activePeriodIds.map((pid) => agentMap[pid] ?? []);
    const auditPerPeriod = activePeriodIds.map((pid) => auditMap[pid] ?? []);
    const aggregatedAgents: AgentMetric[] = aggregateAgentMetrics(agentPerPeriod)
      .filter((a) => !dashboardExcludedKeys.has(a.agentKey))
      .map((a) => (premiumOnboardingKeys.has(a.agentKey) ? { ...a, callEvaluationAverage: null } : a));
    const aggregatedAudits: AuditMetric[] = aggregateAuditMetrics(auditPerPeriod).filter(
      (a) => !dashboardExcludedKeys.has(a.agentKey)
    );

    return buildDashboardSnapshot({
      period: { ...referencePeriod, manualTotalCallCount: null, manualTotalChatMailCount: null, manualTotalTicketClosedCount: null },
      datasets: {
        agentMetrics: aggregatedAgents,
        auditMetrics: aggregatedAudits,
        questionPerformance: [],
        qtMetrics: []
      }
    });
  }, [agentMetricsBulkQuery.data, auditMetricsBulkQuery.data, activePeriodIds, referencePeriod, dashboardExcludedKeys, premiumOnboardingKeys]);

  const extras = useMemo(() => {
    const agents = snapshot?.datasets.agentMetrics ?? [];
    if (agents.length === 0) return null;
    return {
      evaluationCount: sum(agents.map((a) => a.evaluationCount)),
      localCloseRate: average(agents.map((a) => a.localCloseRate)),
      avgTalkDurationSeconds: average(agents.map((a) => a.avgTalkDurationSeconds)),
      missedCalls: sum(agents.map((a) => a.missedCalls))
    };
  }, [snapshot]);

  const isLoading = agentMetricsBulkQuery.isLoading || auditMetricsBulkQuery.isLoading;

  return { snapshot, extras, monthlyPeriodId, yearPeriods, isLoading };
}

/* ── Dönem etiketi ── */

function usePeriodLabel(yearPeriods: any[], periodRange: PeriodRangeValue, periodId: string | undefined) {
  return useMemo(() => {
    if (periodRange.viewMode === "aylik") {
      const p = yearPeriods.find((pp: any) => pp.id === periodId);
      return p ? formatPeriodMonth(p.month, { includeYear: true }) : "Dönem";
    }
    if (periodRange.viewMode === "ceyreklik") {
      return `${periodRange.year} ${QUARTER_SHORT[(periodRange.quarter ?? 1) - 1]}`;
    }
    return `${periodRange.year} (Yıllık)`;
  }, [periodRange, periodId, yearPeriods]);
}

/* ── Sayfa ── */

export function CsPeriodComparePage() {
  const auth = useAuth();

  const [periodRangeA, setPeriodRangeA] = useState<PeriodRangeValue>(makeDefaultPeriodRange(2));
  const [periodRangeB, setPeriodRangeB] = useState<PeriodRangeValue>(makeDefaultPeriodRange(1));

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const csPeriods = useMemo(
    () => [...(periodsQuery.data ?? [])].filter((p) => (p.department ?? "cs") === "cs").sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const dashboardExcludedKeys = useRepresentativeKeysExcludedFrom("dashboard");
  const premiumOnboardingKeys = useRepresentativeKeysWithBadge("premium_onboarding");

  const sideA = useCsPeriodSide(auth, csPeriods as any, periodRangeA, setPeriodRangeA, dashboardExcludedKeys, premiumOnboardingKeys);
  const sideB = useCsPeriodSide(auth, csPeriods as any, periodRangeB, setPeriodRangeB, dashboardExcludedKeys, premiumOnboardingKeys);

  const labelA = usePeriodLabel(sideA.yearPeriods, periodRangeA, sideA.monthlyPeriodId);
  const labelB = usePeriodLabel(sideB.yearPeriods, periodRangeB, sideB.monthlyPeriodId);

  const summaryA = sideA.snapshot?.summary;
  const summaryB = sideB.snapshot?.summary;
  const hasData = Boolean(summaryA || summaryB);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Dönem Karşılaştırma"
        actions={
          <Link
            to="/cs/csat"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-white/72 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white/90 dark:border-slate-600/50 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700/80"
          >
            <ArrowLeft size={14} />
            Geri
          </Link>
        }
      >
        {/* Dönem seçiciler */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/40 dark:bg-slate-800/30">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Sol</span>
            <PeriodRangeFilter onChange={setPeriodRangeA} periods={csPeriods} value={{ ...periodRangeA, monthPeriodId: sideA.monthlyPeriodId }} />
          </div>
          <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/40 dark:bg-slate-800/30">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Sağ</span>
            <PeriodRangeFilter onChange={setPeriodRangeB} periods={csPeriods} value={{ ...periodRangeB, monthPeriodId: sideB.monthlyPeriodId }} />
          </div>
        </div>

        {!hasData ? (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Seçilen dönemlerde veri bulunamadı.
          </p>
        ) : (
          <div className="space-y-6">
            {/* Özet kartları */}
            <div className="relative grid gap-6 lg:grid-cols-2">
              <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-px bg-slate-200 dark:bg-slate-700 lg:block" />
              <PeriodSummaryCard label={labelA} summary={summaryA} isLoading={sideA.isLoading} />
              <PeriodSummaryCard label={labelB} summary={summaryB} isLoading={sideB.isLoading} />
            </div>

            {/* Metrik karşılaştırma */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Detaylı Karşılaştırma</h3>

              <div className="space-y-1.5">
                <CompareMetricRow label="Audit Ortalaması" leftValue={summaryA?.auditAverage} rightValue={summaryB?.auditAverage} format={formatAuditScore} />
                <CompareMetricRow label="CSAT Ortalaması" leftValue={summaryA?.csatAverage} rightValue={summaryB?.csatAverage} format={(v) => formatNumber(v, 3)} />
                <CompareMetricRow label="Önceki Audit Doğruluk Oranı" leftValue={summaryA?.previousAuditAccuracyAverage} rightValue={summaryB?.previousAuditAccuracyAverage} format={formatPercent} />
                <CompareMetricRow label="Toplam Görüşme" leftValue={summaryA?.totalConversationCount} rightValue={summaryB?.totalConversationCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Değerlendirme" leftValue={sideA.extras?.evaluationCount} rightValue={sideB.extras?.evaluationCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Lokal Kapatma" leftValue={sideA.extras?.localCloseRate} rightValue={sideB.extras?.localCloseRate} format={formatPercent} />
                <CompareMetricRow label="Konuşma Süresi" leftValue={sideA.extras?.avgTalkDurationSeconds} rightValue={sideB.extras?.avgTalkDurationSeconds} format={formatSeconds} direction="lower_is_better" />
                <CompareMetricRow label="Kaçan Çağrı" leftValue={sideA.extras?.missedCalls} rightValue={sideB.extras?.missedCalls} format={(v) => formatNumber(v)} direction="lower_is_better" />
                <CompareMetricRow label="Temsilci Sayısı" leftValue={summaryA?.agentCount} rightValue={summaryB?.agentCount} format={(v) => formatNumber(v)} />
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ── Dönem özet kartı ── */

function PeriodSummaryCard(props: {
  label: string;
  summary: ReturnType<typeof buildDashboardSnapshot>["summary"] | undefined;
  isLoading: boolean;
}) {
  const { label, summary, isLoading } = props;

  if (!summary) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-[10px] border border-dashed border-slate-300 bg-slate-50/50 dark:border-slate-600 dark:bg-slate-800/30">
        <p className="text-sm text-slate-400 dark:text-slate-500">{isLoading ? "Yükleniyor..." : "Veri yok"}</p>
      </div>
    );
  }

  return (
    <div className="surface-default rounded-[10px] border border-white/75 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:shadow-none">
      <h3 className="font-display text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
        {label}
      </h3>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Audit Ortalaması</span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatAuditScore(summary.auditAverage)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">CSAT Ortalaması</span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatNumber(summary.csatAverage, 3)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Toplam Görüşme</span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatNumber(summary.totalConversationCount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Temsilci</span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{summary.agentCount}</span>
        </div>
      </div>
    </div>
  );
}
