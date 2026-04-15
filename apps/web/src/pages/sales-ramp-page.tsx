import { selectAuditMetrics, selectDefaultReportPeriod } from "@kalitedb/shared";
import type { AuditMetric, RampEntry, RampTargets, SalesKpiAgent } from "@kalitedb/shared";
import { PageHeader, SurfaceCard } from "@kalitedb/ui";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { firebaseDb } from "../lib/firebase";
import { formatNumber } from "../lib/format";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import {
  aggregateAuditMetrics,
  aggregateMultiPeriodKpi,
  aggregateRampEntries,
  computeActivePeriodIds,
  derivePeriodRangeSelectors
} from "../lib/period-aggregation";
import { computeAgentRamp, DEFAULT_RAMP_TARGETS, type RampScores, type RagStatus } from "../lib/ramp-scoring";

/* ── Formatters ── */

function formatTry(v: number) {
  return new Intl.NumberFormat("tr-TR").format(Math.round(v)) + " TRY";
}

function formatHours(seconds: number) {
  return formatNumber(seconds / 3600, 1) + " sa";
}

/* ── RAG Badge ── */

const RAG_STYLES: Record<RagStatus, string> = {
  green: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/40",
  yellow: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/40",
  red: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-700/40"
};
const RAG_LABELS: Record<RagStatus, string> = { green: "Yeşil", yellow: "Sarı", red: "Kırmızı" };

/* ── Sorting ── */

type SortKey = "agentName" | "activityScore" | "qualityScore" | "resultScore" | "rampIndex";

/* ── Sayfa ── */

export function SalesRampPage() {
  const auth = useAuth();
  const now = new Date();
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  });
  const [sortKey, setSortKey] = useState<SortKey>("rampIndex");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  /* ── Dönemler ── */
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const salesPeriods = useMemo(
    () => [...(periodsQuery.data ?? [])].filter((p) => (p.department ?? "cs") === "sales").sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const { yearPeriods } = useMemo(
    () => derivePeriodRangeSelectors(salesPeriods, periodRange.year),
    [salesPeriods, periodRange.year]
  );

  const defaultPeriod = useMemo(() => {
    const prev = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
    return yearPeriods.find((p) => p.month === prev) ?? selectDefaultReportPeriod(yearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearPeriods]);

  const periodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId) ? periodRange.monthPeriodId : defaultPeriod?.id;

  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
  }, [defaultPeriod?.id, periodRange.monthPeriodId]);

  const activePeriodIds = useMemo(
    () => computeActivePeriodIds(yearPeriods, { ...periodRange, monthPeriodId: periodId }),
    [periodRange, periodId, yearPeriods]
  );

  /* ── KPI verisi ── */
  const kpiQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["sales-ramp-kpi", auth.token, activePeriodIds.join(",")],
    queryFn: async () => {
      const results = await Promise.all(activePeriodIds.map((pid) => api.getSalesKpiData(auth.token, pid)));
      return results.length === 1 ? results[0] : aggregateMultiPeriodKpi(results);
    },
    staleTime: 60 * 1000
  });

  const agents: SalesKpiAgent[] = kpiQuery.data && "agents" in kpiQuery.data ? kpiQuery.data.agents : [];

  /* ── Audit verisi ── */
  const auditQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["sales-ramp-audit", auth.token, activePeriodIds.join(",")],
    queryFn: async (): Promise<AuditMetric[]> => {
      if (activePeriodIds.length === 1) {
        const dashboard = await api.getDashboard(auth.token, activePeriodIds[0]!, undefined, { datasetTypes: ["audit-metrics"] });
        return selectAuditMetrics(dashboard.datasets);
      }
      const auditMap = await api.getAuditMetricsForPeriods(auth.token, activePeriodIds);
      const metricsPerPeriod = activePeriodIds.map((pid) => auditMap[pid] ?? []);
      return aggregateAuditMetrics(metricsPerPeriod);
    },
    staleTime: 60 * 1000
  });

  const auditMetrics: AuditMetric[] = auditQuery.data ?? [];

  /* ── RAMP girişleri (Firestore) ── */
  const rampQuery = useQuery({
    enabled: activePeriodIds.length > 0 && Boolean(firebaseDb),
    queryKey: ["ramp-entries", activePeriodIds.join(",")],
    queryFn: async (): Promise<{ entries: RampEntry[]; targets: Omit<RampTargets, "updatedAt"> }> => {
      const allEntries: RampEntry[][] = [];
      let targets = { ...DEFAULT_RAMP_TARGETS };

      for (const pid of activePeriodIds) {
        const snap = await getDocs(collection(firebaseDb!, "reportPeriods", pid, "rampEntries"));
        const periodEntries: RampEntry[] = [];
        snap.forEach((d) => {
          if (d.id === "__targets__") {
            const t = d.data();
            targets = {
              touchesTarget: t.touchesTarget ?? DEFAULT_RAMP_TARGETS.touchesTarget,
              talkTimeTargetSeconds: t.talkTimeTargetSeconds ?? DEFAULT_RAMP_TARGETS.talkTimeTargetSeconds,
              wsaTarget: t.wsaTarget ?? DEFAULT_RAMP_TARGETS.wsaTarget,
              pipelineCoverage: t.pipelineCoverage ?? DEFAULT_RAMP_TARGETS.pipelineCoverage
            };
          } else {
            periodEntries.push({
              agentKey: d.id,
              pipeline: d.data().pipeline ?? 0,
              growAmount: d.data().growAmount ?? 0,
              scaleAmount: d.data().scaleAmount ?? 0,
              scalePlusAmount: d.data().scalePlusAmount ?? 0,
              updatedAt: d.data().updatedAt ?? ""
            });
          }
        });
        allEntries.push(periodEntries);
      }

      const entries = allEntries.length <= 1 ? (allEntries[0] ?? []) : aggregateRampEntries(allEntries);

      // Çeyreklik/yıllık hedefler ölçekle
      const periodCount = activePeriodIds.length;
      if (periodCount > 1) {
        targets = {
          ...targets,
          touchesTarget: targets.touchesTarget * periodCount,
          talkTimeTargetSeconds: targets.talkTimeTargetSeconds * periodCount,
          wsaTarget: targets.wsaTarget * periodCount
        };
      }

      return { entries, targets };
    },
    staleTime: 60 * 1000
  });

  const rampEntries = rampQuery.data?.entries ?? [];
  const rampTargets = rampQuery.data?.targets ?? DEFAULT_RAMP_TARGETS;

  /* ── Skorları hesapla ── */
  const scoredAgents = useMemo(() => {
    return agents.map((agent) => {
      const audit = auditMetrics.find((a) => a.agentKey === agent.agentKey);
      const ramp = rampEntries.find((r) => r.agentKey === agent.agentKey);

      const scores = computeAgentRamp(
        agent.callAttempts,
        agent.talkDurationSeconds,
        audit?.auditScore ?? null,
        ramp?.growAmount ?? 0,
        ramp?.scaleAmount ?? 0,
        ramp?.scalePlusAmount ?? 0,
        ramp?.pipeline ?? 0,
        rampTargets
      );

      return { agent, audit, ramp, scores };
    });
  }, [agents, auditMetrics, rampEntries, rampTargets]);

  /* ── Sıralama ── */
  const sortedAgents = useMemo(() => {
    return [...scoredAgents].sort((a, b) => {
      const va = sortKey === "agentName" ? a.agent.agentName : a.scores[sortKey];
      const vb = sortKey === "agentName" ? b.agent.agentName : b.scores[sortKey];
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [scoredAgents, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  /* ── Ortalamalar ── */
  const averages = useMemo(() => {
    if (scoredAgents.length === 0) return null;
    const n = scoredAgents.length;
    const sum = (fn: (s: RampScores) => number) => scoredAgents.reduce((acc, a) => acc + fn(a.scores), 0) / n;
    return { activity: sum((s) => s.activityScore), quality: sum((s) => s.qualityScore), result: sum((s) => s.resultScore), index: sum((s) => s.rampIndex) };
  }, [scoredAgents]);

  const isLoading = periodsQuery.isPending || kpiQuery.isPending;
  const hasData = agents.length > 0;

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  const thCls = "px-4 py-3 text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap cursor-pointer select-none hover:bg-indigo-700 dark:hover:bg-indigo-800 transition-colors";
  const tdCls = "px-4 py-3 text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap text-center";

  return (
    <div className="space-y-6">
      <PageHeader
        title="RAMP Endeksi"
        actions={
          <PeriodRangeFilter
            onChange={setPeriodRange}
            periods={salesPeriods}
            value={{ ...periodRange, monthPeriodId: periodId }}
          />
        }
      />

      {/* Hedef özeti */}
      <div className="grid gap-4 sm:grid-cols-4">
        <SurfaceCard variant="default">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Dokunma Hedefi</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{formatNumber(rampTargets.touchesTarget)}</p>
        </SurfaceCard>
        <SurfaceCard variant="default">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Konuşma Hedefi</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{formatHours(rampTargets.talkTimeTargetSeconds)}</p>
        </SurfaceCard>
        <SurfaceCard variant="default">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">WSA Hedefi</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{formatTry(rampTargets.wsaTarget)}</p>
        </SurfaceCard>
        <SurfaceCard variant="default">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Pipeline Katsayısı</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{rampTargets.pipelineCoverage}×</p>
        </SurfaceCard>
      </div>

      {isLoading ? (
        <SurfaceCard variant="default"><p className="text-sm text-slate-500">Veriler yükleniyor...</p></SurfaceCard>
      ) : !hasData ? (
        <SurfaceCard variant="default"><p className="text-sm text-slate-500">Seçilen dönemde KPI verisi bulunamadı.</p></SurfaceCard>
      ) : (
        <SurfaceCard variant="default">
          <div className="-m-5 overflow-x-auto sm:-m-6">
            <table className="min-w-full">
              <thead>
                <tr className="bg-indigo-800 dark:bg-indigo-900">
                  <th className={`${thCls} text-left`} onClick={() => toggleSort("agentName")}>Temsilci{sortArrow("agentName")}</th>
                  <th className={`${thCls} text-center`} onClick={() => toggleSort("activityScore")}>Aktivite{sortArrow("activityScore")}</th>
                  <th className={`${thCls} text-center`} onClick={() => toggleSort("qualityScore")}>Kalite{sortArrow("qualityScore")}</th>
                  <th className={`${thCls} text-center`} onClick={() => toggleSort("resultScore")}>Sonuç{sortArrow("resultScore")}</th>
                  <th className={`${thCls} text-center`} onClick={() => toggleSort("rampIndex")}>RAMP İndeks{sortArrow("rampIndex")}</th>
                  <th className={`${thCls} text-center`}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map(({ agent, scores }, idx) => (
                  <>
                    <tr
                      key={agent.agentKey}
                      className={[
                        "border-b border-slate-200/70 transition-colors cursor-pointer hover:bg-slate-50/80 dark:border-slate-700/50 dark:hover:bg-slate-700/30",
                        idx % 2 === 0 ? "bg-white dark:bg-slate-800/30" : "bg-slate-50/50 dark:bg-slate-800/50"
                      ].join(" ")}
                      onClick={() => setExpandedAgent(expandedAgent === agent.agentKey ? null : agent.agentKey)}
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        <span className="mr-1.5 inline-block w-4 text-slate-400">
                          {expandedAgent === agent.agentKey ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        {agent.agentName}
                      </td>
                      <td className={tdCls}>{formatNumber(scores.activityScore, 1)}</td>
                      <td className={tdCls}>{formatNumber(scores.qualityScore, 1)}</td>
                      <td className={tdCls}>{formatNumber(scores.resultScore, 1)}</td>
                      <td className={`${tdCls} font-bold`}>{formatNumber(scores.rampIndex, 1)}</td>
                      <td className={tdCls}>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${RAG_STYLES[scores.ragStatus]}`}>
                          {RAG_LABELS[scores.ragStatus]}
                        </span>
                      </td>
                    </tr>
                    {expandedAgent === agent.agentKey && (
                      <tr key={`${agent.agentKey}-detail`} className="border-b border-slate-200/70 dark:border-slate-700/50">
                        <td colSpan={6} className="bg-slate-50/80 dark:bg-slate-800/60 px-6 py-4">
                          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
                            <DetailItem label="Touch" value={formatNumber(agent.callAttempts)} sub={`Skor: ${formatNumber(scores.touchesScore, 1)}`} />
                            <DetailItem label="Konuşma" value={formatHours(agent.talkDurationSeconds)} sub={`Skor: ${formatNumber(scores.talkTimeScore, 1)}`} />
                            <DetailItem label="Audit" value={scores.qualityScore > 0 ? formatNumber(scores.qualityScore, 1) : "Veri yok"} />
                            <DetailItem label="WSA" value={formatTry(scores.wsa)} sub={`Hedef: ${formatTry(rampTargets.wsaTarget)}`} />
                            <DetailItem label="WSA Skoru" value={formatNumber(scores.resultComponent, 1)} />
                            <DetailItem label="Pipeline" value={formatTry(scores.rampIndex > 0 ? (rampEntries.find((r) => r.agentKey === agent.agentKey)?.pipeline ?? 0) : 0)} sub={`Beklenen: ${formatTry(scores.desiredPipe)}`} />
                            <DetailItem label="Pipeline Health" value={formatNumber(scores.pipelineHealth, 1)} />
                            <DetailItem label="Aktivite (%35)" value={formatNumber(scores.activityScore, 1)} />
                            <DetailItem label="Kalite (%25)" value={formatNumber(scores.qualityScore, 1)} />
                            <DetailItem label="Sonuç (%40)" value={formatNumber(scores.resultScore, 1)} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}

                {/* Ortalama */}
                {averages && (
                  <tr className="border-t-2 border-indigo-600 bg-indigo-800 dark:border-indigo-700 dark:bg-indigo-900">
                    <td className="px-4 py-3 text-sm font-bold text-white whitespace-nowrap">ORTALAMA</td>
                    <td className="px-4 py-3 text-sm font-bold text-indigo-200 whitespace-nowrap text-center">{formatNumber(averages.activity, 1)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-indigo-200 whitespace-nowrap text-center">{formatNumber(averages.quality, 1)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-indigo-200 whitespace-nowrap text-center">{formatNumber(averages.result, 1)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-indigo-200 whitespace-nowrap text-center">{formatNumber(averages.index, 1)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-indigo-200 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${RAG_STYLES[averages.index >= 77 ? "green" : averages.index >= 60 ? "yellow" : "red"]}`}>
                        {RAG_LABELS[averages.index >= 77 ? "green" : averages.index >= 60 ? "yellow" : "red"]}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}

/* ── Detay satırı öğesi ── */

function DetailItem(props: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{props.label}</p>
      <p className="font-semibold text-slate-900 dark:text-slate-100">{props.value}</p>
      {props.sub && <p className="text-xs text-slate-400 dark:text-slate-500">{props.sub}</p>}
    </div>
  );
}
