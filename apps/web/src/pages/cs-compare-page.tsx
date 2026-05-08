import { buildDashboardSnapshot, selectAuditMetrics, selectDefaultReportPeriod, type AgentMetric, type AuditMetric } from "@kalitedb/shared";
import { SectionCard } from "@kalitedb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";

import { useAuth } from "../lib/auth";
import { useDarkMode } from "../lib/use-dark-mode";
import { api } from "../lib/api";
import { brand, chartTooltipDark, chartTooltipLight } from "../theme/colors";
import {
  formatAuditScore,
  formatNumber,
  formatPercent,
  formatSeconds
} from "../lib/format";
import { aggregateAgentMetrics, aggregateAuditMetrics, computeActivePeriodIds, derivePeriodRangeSelectors } from "../lib/period-aggregation";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import { RepresentativeSelect } from "../components/representative-select";
import { BadgePill } from "../components/representative-detail-modal";
import { CompareMetricRow } from "../components/compare/compare-metric-row";
import { useActiveRepresentativeKeys } from "../lib/use-active-representatives";

/* ── Yardımcı fonksiyonlar ── */

function buildAvatar(name: string, index: number) {
  const photo = getRepresentativePhotoSrc(name);
  if (photo) return photo;

  const palettes = [
    { start: "#60a5fa", end: "#2563eb", glow: "#bfdbfe" },
    { start: "#38bdf8", end: "#0f766e", glow: "#a5f3fc" },
    { start: "#f59e0b", end: "#f97316", glow: "#fde68a" },
    { start: "#a78bfa", end: "#7c3aed", glow: "#ddd6fe" }
  ];
  const p = palettes[index % palettes.length]!;
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${p.start}"/><stop offset="100%" stop-color="${p.end}"/></linearGradient></defs><rect width="160" height="160" rx="36" fill="url(#bg)"/><circle cx="36" cy="38" r="24" fill="${p.glow}" opacity="0.28"/><circle cx="126" cy="128" r="18" fill="white" opacity="0.14"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="Inter,Arial,sans-serif" font-size="50" font-weight="700" letter-spacing="4">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function makeDefaultPeriodRange(): PeriodRangeValue {
  const now = new Date();
  const prevMonth = now.getMonth();
  const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
  const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
  return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
}

/** Tek bir taraf için dönem → veri çözümleme hook'u */
function useCsSideData(
  auth: { token: string | null },
  csPeriods: ReturnType<typeof derivePeriodRangeSelectors> extends { yearPeriods: infer T } ? T : never,
  periodRange: PeriodRangeValue,
  setPeriodRange: (fn: (prev: PeriodRangeValue) => PeriodRangeValue) => void
) {
  const datasetTypes = ["agent-metrics", "audit-metrics"] as const;

  const yearPeriods = useMemo(() => {
    const all = derivePeriodRangeSelectors(csPeriods as any, periodRange.year);
    return all.yearPeriods;
  }, [csPeriods, periodRange.year]);

  const now = new Date();
  const defaultPeriod = useMemo(() => {
    const prev = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
    return yearPeriods.find((p) => p.month === prev) ?? selectDefaultReportPeriod(yearPeriods);
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

  const periodId = activePeriodIds.length > 0 ? activePeriodIds[activePeriodIds.length - 1] : undefined;
  const activePeriodIdsKey = activePeriodIds.join(",");
  const needsAggregation = periodRange.viewMode !== "aylik" && activePeriodIds.length > 1;

  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, undefined, datasetTypes.join(",")],
    queryFn: () => api.getDashboard(auth.token, periodId, undefined, { datasetTypes: [...datasetTypes] }),
    staleTime: 60 * 1000
  });

  const agentMetricsBulkQuery = useQuery({
    enabled: needsAggregation,
    queryKey: ["cs-compare-agent-bulk", auth.token, activePeriodIdsKey],
    queryFn: () => api.getAgentMetricsForPeriods(auth.token, activePeriodIds),
    staleTime: 60 * 1000
  });
  const auditMetricsBulkQuery = useQuery({
    enabled: needsAggregation,
    queryKey: ["cs-compare-audit-bulk", auth.token, activePeriodIdsKey],
    queryFn: () => api.getAuditMetricsForPeriods(auth.token, activePeriodIds),
    staleTime: 60 * 1000
  });

  const baseSnapshot = dashboardQuery.data;
  const snapshot = useMemo(() => {
    if (!baseSnapshot) return undefined;
    if (!needsAggregation) return baseSnapshot;
    const agentMap = agentMetricsBulkQuery.data;
    const auditMap = auditMetricsBulkQuery.data;
    if (!agentMap || !auditMap) return baseSnapshot;
    const agentPerPeriod = activePeriodIds.map((pid) => agentMap[pid] ?? []);
    const auditPerPeriod = activePeriodIds.map((pid) => auditMap[pid] ?? []);
    const aggregatedAgents: AgentMetric[] = aggregateAgentMetrics(agentPerPeriod);
    const aggregatedAudits: AuditMetric[] = aggregateAuditMetrics(auditPerPeriod);
    const aggregatedPeriod = { ...baseSnapshot.period, manualTotalCallCount: null, manualTotalChatMailCount: null, manualTotalTicketClosedCount: null };
    return buildDashboardSnapshot({
      period: aggregatedPeriod,
      datasets: {
        agentMetrics: aggregatedAgents,
        auditMetrics: aggregatedAudits,
        questionPerformance: baseSnapshot.datasets.questionPerformance,
        qtMetrics: baseSnapshot.datasets.qtMetrics
      },
      thresholds: baseSnapshot.thresholds
    });
  }, [baseSnapshot, needsAggregation, activePeriodIds, agentMetricsBulkQuery.data, auditMetricsBulkQuery.data]);

  const auditMetrics = useMemo(() => selectAuditMetrics(snapshot?.datasets ?? { agentMetrics: [], auditMetrics: [] }), [snapshot]);

  return { snapshot, auditMetrics, monthlyPeriodId, yearPeriods };
}

/* ── Sayfa ── */

export function CsComparePage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDark } = useDarkMode();
  const tooltipStyle = isDark ? { ...chartTooltipDark } : { ...chartTooltipLight };

  /* Dönem filtreleri — her taraf bağımsız */
  const [periodRangeA, setPeriodRangeA] = useState<PeriodRangeValue>(makeDefaultPeriodRange);
  const [periodRangeB, setPeriodRangeB] = useState<PeriodRangeValue>(makeDefaultPeriodRange);

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const csPeriods = useMemo(
    () => [...(periodsQuery.data ?? [])].filter((p) => (p.department ?? "cs") === "cs").sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const sideA = useCsSideData(auth, csPeriods as any, periodRangeA, setPeriodRangeA);
  const sideB = useCsSideData(auth, csPeriods as any, periodRangeB, setPeriodRangeB);

  /* Temsilci listesi — kayıtlı temsilcilerden (dönemden bağımsız) */
  const { activeKeys } = useActiveRepresentativeKeys();

  const repsQuery = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const representatives = useMemo(() => {
    const nonSalesReps = (repsQuery.data ?? []).filter((r) => !(r.badges ?? []).includes("satis"));
    const nonSalesKeys = new Set(nonSalesReps.map((r) => r.key));
    const options = new Map<string, string>();
    nonSalesReps.forEach((r) => options.set(r.key, r.displayName));
    // Her iki snapshot'tan ek isimler
    (sideA.snapshot?.datasets.agentMetrics ?? []).forEach((record) => { if (nonSalesKeys.has(record.agentKey)) options.set(record.agentKey, record.agentName); });
    sideA.auditMetrics.forEach((record) => { if (nonSalesKeys.has(record.agentKey)) options.set(record.agentKey, record.agentName); });
    (sideB.snapshot?.datasets.agentMetrics ?? []).forEach((record) => { if (nonSalesKeys.has(record.agentKey)) options.set(record.agentKey, record.agentName); });
    sideB.auditMetrics.forEach((record) => { if (nonSalesKeys.has(record.agentKey)) options.set(record.agentKey, record.agentName); });

    return Array.from(options.entries())
      .filter(([k]) => !activeKeys || activeKeys.has(k))
      .map(([agentKey, agentName]) => ({ agentKey, agentName }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"))
      .map((item, index) => ({ ...item, avatarSrc: buildAvatar(item.agentName, index) }));
  }, [activeKeys, repsQuery.data, sideA.snapshot, sideA.auditMetrics, sideB.snapshot, sideB.auditMetrics]);

  /* Seçim */
  const keyA = searchParams.get("a") ?? "";
  const keyB = searchParams.get("b") ?? "";

  const setKey = (side: "a" | "b", key: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(side, key);
    setSearchParams(next);
  };

  const repA = representatives.find((r) => r.agentKey === keyA) ?? null;
  const repB = representatives.find((r) => r.agentKey === keyB) ?? null;

  // Sol taraf → sideA verisi, sağ taraf → sideB verisi
  const agentA = sideA.snapshot?.datasets.agentMetrics.find((m) => m.agentKey === keyA) ?? null;
  const agentB = sideB.snapshot?.datasets.agentMetrics.find((m) => m.agentKey === keyB) ?? null;
  const auditA = sideA.auditMetrics.find((m) => m.agentKey === keyA) ?? null;
  const auditB = sideB.auditMetrics.find((m) => m.agentKey === keyB) ?? null;

  const repDataA = (repsQuery.data ?? []).find((r) => r.key === keyA);
  const repDataB = (repsQuery.data ?? []).find((r) => r.key === keyB);

  /* Radar verisi — kalite metrikleri threshold hedefiyle, hacim metrikleri relatif maks ile normalize */
  const radarData = useMemo(() => {
    if (!agentA && !agentB && !auditA && !auditB) return [];

    const thresholds = sideA.snapshot?.thresholds ?? sideB.snapshot?.thresholds;
    const csatTarget = thresholds?.callEvaluationAverage?.green ?? 4.85;
    const auditTarget = thresholds?.auditScore?.green ?? 77;
    const localCloseTarget = thresholds?.localCloseRate?.green ?? 92;
    const talkTarget = thresholds?.avgTalkDurationSeconds?.green ?? 300;

    const norm = (actual: number | null | undefined, target: number) => {
      if (actual == null || target <= 0) return 0;
      return Math.min(100, (actual / target) * 100);
    };
    // Lower is better: target/actual oranı
    const normInverse = (actual: number | null | undefined, target: number) => {
      if (actual == null || actual <= 0) return 0;
      return Math.min(100, (target / actual) * 100);
    };
    // Hacim metrikleri için iki taraf arasında relatif max
    const normRelative = (actual: number | null | undefined, peerMax: number) => {
      if (actual == null || peerMax <= 0) return 0;
      return Math.min(100, (actual / peerMax) * 100);
    };

    const conversationMax = Math.max(agentA?.totalConversationCount ?? 0, agentB?.totalConversationCount ?? 0);
    const evaluationMax = Math.max(agentA?.evaluationCount ?? 0, agentB?.evaluationCount ?? 0);

    const metrics = [
      { metric: "CSAT", a: norm(agentA?.callEvaluationAverage, csatTarget), b: norm(agentB?.callEvaluationAverage, csatTarget) },
      { metric: "Audit", a: norm(auditA?.auditScore, auditTarget), b: norm(auditB?.auditScore, auditTarget) },
      { metric: "Lokal Kapatma", a: norm(agentA?.localCloseRate, localCloseTarget), b: norm(agentB?.localCloseRate, localCloseTarget) },
      { metric: "Konuşma Süresi", a: normInverse(agentA?.avgTalkDurationSeconds, talkTarget), b: normInverse(agentB?.avgTalkDurationSeconds, talkTarget) },
      { metric: "Görüşme", a: normRelative(agentA?.totalConversationCount, conversationMax), b: normRelative(agentB?.totalConversationCount, conversationMax) },
      { metric: "Değerlendirme", a: normRelative(agentA?.evaluationCount, evaluationMax), b: normRelative(agentB?.evaluationCount, evaluationMax) }
    ];

    return metrics.map((m) => ({ metric: m.metric, left: m.a, right: m.b }));
  }, [agentA, agentB, auditA, auditB, sideA.snapshot?.thresholds, sideB.snapshot?.thresholds]);

  const nameA = repA?.agentName ?? "Sol";
  const nameB = repB?.agentName ?? "Sağ";

  const selectOptions = representatives.map((r) => ({ key: r.agentKey, label: r.agentName }));

  return (
    <div className="space-y-6">
      <SectionCard
        title="CS Temsilci Karşılaştırma"
        actions={
          <Link
            to="/cs/representatives"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-white/72 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white/90 dark:border-slate-600/50 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700/80"
          >
            <ArrowLeft size={14} />
            Geri
          </Link>
        }
      >
        {/* Seçiciler: her tarafta temsilci + dönem */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/40 dark:bg-slate-800/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Sol</span>
              <RepresentativeSelect options={selectOptions} value={keyA} onChange={(k) => setKey("a", k)} placeholder="Temsilci seçin" />
            </div>
            <PeriodRangeFilter onChange={setPeriodRangeA} periods={csPeriods} value={{ ...periodRangeA, monthPeriodId: sideA.monthlyPeriodId }} />
          </div>
          <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/40 dark:bg-slate-800/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Sağ</span>
              <RepresentativeSelect options={selectOptions} value={keyB} onChange={(k) => setKey("b", k)} placeholder="Temsilci seçin" />
            </div>
            <PeriodRangeFilter onChange={setPeriodRangeB} periods={csPeriods} value={{ ...periodRangeB, monthPeriodId: sideB.monthlyPeriodId }} />
          </div>
        </div>

        {!repA && !repB ? (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Karşılaştırmak istediğiniz iki temsilciyi seçin.
          </p>
        ) : (
          <div className="space-y-6">
            {/* Profil kartları */}
            <div className="relative grid gap-6 lg:grid-cols-2">
              <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-px bg-slate-200 dark:bg-slate-700 lg:block" />
              <RepCard name={repA?.agentName} avatarSrc={repA?.avatarSrc} badges={(repDataA as any)?.badges ?? []} />
              <RepCard name={repB?.agentName} avatarSrc={repB?.avatarSrc} badges={(repDataB as any)?.badges ?? []} />
            </div>

            {/* Radar chart */}
            {radarData.length > 0 && repA && repB && (
              <SectionCard title="Radar Karşılaştırma">
                <div className="mx-auto h-72 max-w-md">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"} />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{ fontSize: 11, fill: isDark ? "rgba(255,255,255,0.6)" : "#64748b" }}
                      />
                      <Radar
                        name={nameA}
                        dataKey="left"
                        stroke={brand.primary}
                        fill={brand.primary}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                      <Radar
                        name={nameB}
                        dataKey="right"
                        stroke={brand.accent}
                        fill={brand.accent}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                      <Tooltip
                        contentStyle={{
                          ...tooltipStyle,
                          borderRadius: "8px",
                          border: "none",
                          fontSize: "12px"
                        }}
                        formatter={(value) => `${Math.round(Number(value))}%`}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex items-center justify-center gap-6 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: brand.primary }} />
                    {nameA}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: brand.accent }} />
                    {nameB}
                  </span>
                </div>
              </SectionCard>
            )}

            {/* Metrik karşılaştırma */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Performans Karşılaştırması</h3>

              <div className="space-y-1.5">
                <CompareMetricRow label="CSAT" leftValue={agentA?.callEvaluationAverage} rightValue={agentB?.callEvaluationAverage} format={(v) => formatNumber(v, 3)} />
                <CompareMetricRow label="Audit" leftValue={auditA?.auditScore} rightValue={auditB?.auditScore} format={formatAuditScore} />
                <CompareMetricRow label="Görüşme" leftValue={agentA?.totalConversationCount} rightValue={agentB?.totalConversationCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Lokal Kapatma" leftValue={agentA?.localCloseRate} rightValue={agentB?.localCloseRate} format={formatPercent} />
                <CompareMetricRow label="Konuşma Süresi" leftValue={agentA?.avgTalkDurationSeconds} rightValue={agentB?.avgTalkDurationSeconds} format={formatSeconds} direction="lower_is_better" />
                <CompareMetricRow label="Değerlendirme" leftValue={agentA?.evaluationCount} rightValue={agentB?.evaluationCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Çağrı" leftValue={agentA?.totalCallCount} rightValue={agentB?.totalCallCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Chat / E-posta" leftValue={agentA?.totalChatMailCount} rightValue={agentB?.totalChatMailCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Ticket" leftValue={agentA?.totalTicketClosedCount} rightValue={agentB?.totalTicketClosedCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Kaçan Çağrı" leftValue={agentA?.missedCalls} rightValue={agentB?.missedCalls} format={(v) => formatNumber(v)} direction="lower_is_better" />
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ── Temsilci profil kartı ── */

function RepCard(props: {
  name: string | undefined;
  avatarSrc: string | undefined;
  badges: string[];
}) {
  const { name, avatarSrc, badges } = props;

  if (!name) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-[10px] border border-dashed border-slate-300 bg-slate-50/50 dark:border-slate-600 dark:bg-slate-800/30">
        <p className="text-sm text-slate-400 dark:text-slate-500">Temsilci seçilmedi</p>
      </div>
    );
  }

  return (
    <div className="surface-default rounded-[10px] border border-white/75 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:shadow-none">
      <div className="flex items-center gap-4">
        <img
          alt={name}
          className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover dark:border-slate-600/40"
          src={avatarSrc}
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display truncate text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
            {name}
          </h3>
          {badges.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {badges.map((b: string) => <BadgePill key={b} badgeKey={b} small />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
