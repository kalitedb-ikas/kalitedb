import { buildDashboardSnapshot, resolveThresholdTone, selectAuditMetrics, selectDefaultReportPeriod, type AgentMetric, type AuditMetric } from "@kalitedb/shared";
import { ExecutiveChartCard, SectionCard, StatCard } from "@kalitedb/ui";
import { useQuery } from "@tanstack/react-query";
import { GitCompareArrows, Route } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { useAuth } from "../lib/auth";
import { useDarkMode } from "../lib/use-dark-mode";
import { api } from "../lib/api";
import { formatAuditScore, formatNumber, formatPercent, formatSeconds, formatPeriodMonth, getPreviousPeriod } from "../lib/format";
import { aggregateAgentMetrics, aggregateAuditMetrics, computeActivePeriodIds, derivePeriodRangeSelectors } from "../lib/period-aggregation";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";
import { brand, chart, chartDark, chartTooltipLight, chartTooltipDark } from "../theme/colors";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import { RepresentativeSelect } from "../components/representative-select";
import { BadgePill } from "../components/representative-detail-modal";
import { CareerPathModal } from "../components/career-path-modal";
import { useActiveRepresentativeKeys, useRepresentativeKeysWithBadge } from "../lib/use-active-representatives";

function formatOrNa(value: number | null | undefined, formatter: (value: number) => string) {
  return value === null || value === undefined ? "N/A" : formatter(value);
}

function formatShortMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  const fmt = new Intl.DateTimeFormat("tr-TR", { month: "short" });
  const label = fmt.format(new Date(Date.UTC(year, month - 1, 1))).replace(".", "");
  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1);
}

function formatHms(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function resolveCsatTone(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "neutral" as const;
  }

  if (value > 4.9) {
    return "green" as const;
  }

  if (value >= 4.8) {
    return "yellow" as const;
  }

  return "red" as const;
}

export function RepresentativesPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const now = new Date();
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  });
  const datasetTypes = ["agent-metrics", "audit-metrics"] as const;
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });
  const csPeriods = useMemo(() => [...(periodsQuery.data ?? [])].filter((p) => (p.department ?? "cs") === "cs").sort((a, b) => a.month.localeCompare(b.month)), [periodsQuery.data]);
  const { yearPeriods: csYearPeriods } = useMemo(() => derivePeriodRangeSelectors(csPeriods, periodRange.year), [csPeriods, periodRange.year]);
  const defaultPeriod = useMemo(() => {
    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
    return csYearPeriods.find((p) => p.month === prevMonth) ?? selectDefaultReportPeriod(csYearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csYearPeriods]);
  const monthlyPeriodId = csYearPeriods.some((p) => p.id === periodRange.monthPeriodId) ? periodRange.monthPeriodId : defaultPeriod?.id;
  useEffect(() => { if (!periodRange.monthPeriodId && defaultPeriod?.id) setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id })); }, [defaultPeriod?.id, periodRange.monthPeriodId]);
  const activePeriodIds = useMemo(() => computeActivePeriodIds(csYearPeriods, { ...periodRange, monthPeriodId: monthlyPeriodId }), [periodRange, monthlyPeriodId, csYearPeriods]);
  const periodId = activePeriodIds.length > 0 ? activePeriodIds[activePeriodIds.length - 1] : undefined;
  const compareToPeriodId = undefined;
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId, datasetTypes.join(",")],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId, { datasetTypes: [...datasetTypes] }),
    staleTime: 60 * 1000
  });

  const baseSnapshot = dashboardQuery.data;

  const activePeriodIdsKey = activePeriodIds.join(",");
  const needsAggregation = periodRange.viewMode !== "aylik" && activePeriodIds.length > 1;

  const agentMetricsBulkQuery = useQuery({
    enabled: needsAggregation,
    queryKey: ["cs-rep-agent-metrics-bulk", auth.token, activePeriodIdsKey],
    queryFn: () => api.getAgentMetricsForPeriods(auth.token, activePeriodIds),
    staleTime: 60 * 1000
  });
  const auditMetricsBulkQuery = useQuery({
    enabled: needsAggregation,
    queryKey: ["cs-rep-audit-metrics-bulk", auth.token, activePeriodIdsKey],
    queryFn: () => api.getAuditMetricsForPeriods(auth.token, activePeriodIds),
    staleTime: 60 * 1000
  });

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

  const auditMetrics = useMemo(
    () => selectAuditMetrics(snapshot?.datasets ?? { agentMetrics: [], auditMetrics: [] }),
    [snapshot]
  );

  const { activeKeys } = useActiveRepresentativeKeys();

  const repsQuery = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const representatives = useMemo(() => {
    const options = new Map<string, string>();
    // Önce kayıtlı temsilcilerden (dönemden bağımsız)
    (repsQuery.data ?? [])
      .filter((r) => (r.department ?? "cs") === "cs")
      .forEach((r) => options.set(r.key, r.displayName));
    // Sonra dönem verisinden (ek isimler olabilir)
    (snapshot?.datasets.agentMetrics ?? []).forEach((record) => options.set(record.agentKey, record.agentName));
    auditMetrics.forEach((record) => options.set(record.agentKey, record.agentName));

    return Array.from(options.entries())
      .filter(([agentKey]) => !activeKeys || activeKeys.has(agentKey))
      .map(([agentKey, agentName]) => ({ agentKey, agentName }))
      .sort((left, right) => left.agentName.localeCompare(right.agentName, "tr"))
      .map((item, index) => ({
        ...item,
        avatarSrc: buildRepresentativeAvatar(item.agentName, index, "square"),
        portraitSrc: buildRepresentativeAvatar(item.agentName, index, "landscape")
      }));
  }, [activeKeys, auditMetrics, repsQuery.data, snapshot]);

  const rawId = searchParams.get("id");
  const legacyKey = searchParams.get("agentKey");
  const decodedKey = rawId ? (() => { try { return atob(rawId); } catch { return null; } })() : null;
  const selectedAgentKey = decodedKey ?? legacyKey ?? representatives[0]?.agentKey;
  const selectedRepresentative = representatives.find((item) => item.agentKey === selectedAgentKey) ?? representatives[0] ?? null;
  const selectedAgent =
    snapshot?.datasets.agentMetrics.find((record) => record.agentKey === selectedRepresentative?.agentKey) ?? null;
  const selectedAudit = auditMetrics.find((record) => record.agentKey === selectedRepresentative?.agentKey) ?? null;

  const selectedName = selectedRepresentative?.agentName ?? "N/A";
  const selectedRepData = (repsQuery.data ?? []).find((r) => r.key === selectedRepresentative?.agentKey);
  const selectedBadges = (selectedRepData as any)?.badges ?? [];
  const selectedTimeline = (selectedRepData as any)?.timeline ?? [];
  const previousAuditAccuracyLabel = useMemo(() => {
    const previousPeriod = getPreviousPeriod(snapshot?.period.month);
    return previousPeriod ? `${formatPeriodMonth(previousPeriod, { includeYear: true })} audit doğruluk oranı` : "Önceki audit doğruluk oranı";
  }, [snapshot?.period.month]);

  /* ── Trend verisi (son 6 CS dönemi) ── */
  const last6Periods = useMemo(
    () => [...csPeriods].sort((a, b) => a.month.localeCompare(b.month)).slice(-6),
    [csPeriods]
  );
  const last6PeriodIds = useMemo(() => last6Periods.map((p) => p.id), [last6Periods]);
  const { isDark } = useDarkMode();

  const trendAgentQuery = useQuery({
    enabled: last6PeriodIds.length > 0 && Boolean(selectedAgentKey),
    queryKey: ["cs-rep-agent-trend", auth.token, last6PeriodIds.join(",")],
    queryFn: () => api.getAgentMetricsForPeriods(auth.token, last6PeriodIds),
    staleTime: 5 * 60_000
  });
  const trendAuditQuery = useQuery({
    enabled: last6PeriodIds.length > 0 && Boolean(selectedAgentKey),
    queryKey: ["cs-rep-audit-trend", auth.token, last6PeriodIds.join(",")],
    queryFn: () => api.getAuditMetricsForPeriods(auth.token, last6PeriodIds),
    staleTime: 5 * 60_000
  });

  const trendData = useMemo(() => {
    const agentMap = trendAgentQuery.data ?? {};
    const auditMap = trendAuditQuery.data ?? {};
    return last6Periods.map((period) => {
      const agentList = agentMap[period.id] ?? [];
      const auditList = auditMap[period.id] ?? [];
      const agent = agentList.find((a) => a.agentKey === selectedAgentKey);
      const audit = auditList.find((a) => a.agentKey === selectedAgentKey);
      return {
        label: formatShortMonth(period.month),
        fullLabel: period.title ?? period.month,
        csat: agent?.callEvaluationAverage ?? null,
        auditScore: audit?.auditScore ?? null,
        localCloseRate: agent?.localCloseRate ?? null,
        avgTalkDurationSeconds: agent?.avgTalkDurationSeconds ?? null,
        totalConversationCount: agent?.totalConversationCount ?? null,
        missedCalls: agent?.missedCalls ?? null,
        evaluationCount: agent?.evaluationCount ?? null,
        isCurrent: period.id === periodId
      };
    });
  }, [last6Periods, trendAgentQuery.data, trendAuditQuery.data, selectedAgentKey, periodId]);

  const trendIsFetching = trendAgentQuery.isFetching || trendAuditQuery.isFetching;

  const radarData = useMemo(() => {
    if (!selectedAgent && !selectedAudit) return [];
    const t = snapshot?.thresholds;
    const norm = (actual: number | null | undefined, green: number | null | undefined, direction: "higher" | "lower" = "higher") => {
      if (actual == null || green == null || green <= 0) return 0;
      if (direction === "lower") {
        if (actual <= 0) return 100;
        return Math.max(0, Math.min(100, (green / actual) * 100));
      }
      return Math.max(0, Math.min(100, (actual / green) * 100));
    };
    return [
      { metric: "Audit", value: norm(selectedAudit?.auditScore, t?.auditScore.green), rawValue: formatOrNa(selectedAudit?.auditScore, formatAuditScore) },
      { metric: "CSAT", value: norm(selectedAgent?.callEvaluationAverage, t?.callEvaluationAverage.green), rawValue: formatOrNa(selectedAgent?.callEvaluationAverage, (v) => formatNumber(v, 3)) },
      { metric: "Lokal Kapatma", value: norm(selectedAgent?.localCloseRate, t?.localCloseRate.green), rawValue: formatOrNa(selectedAgent?.localCloseRate, formatPercent) },
      { metric: "Görüşme", value: selectedAgent?.totalConversationCount ? 100 : 0, rawValue: formatOrNa(selectedAgent?.totalConversationCount, (v) => formatNumber(v)) },
      { metric: "Konuşma", value: norm(selectedAgent?.avgTalkDurationSeconds, t?.avgTalkDurationSeconds.green, "lower"), rawValue: formatOrNa(selectedAgent?.avgTalkDurationSeconds, formatSeconds) }
    ];
  }, [selectedAgent, selectedAudit, snapshot?.thresholds]);

  /* ── "En'ler" — temsilci bu metrikte 1. sıradaysa ── */
  const topMetricLabels = useMemo(() => {
    if (!selectedRepresentative) return [] as string[];
    const agents = snapshot?.datasets.agentMetrics ?? [];
    if (agents.length < 2) return [];
    const key = selectedRepresentative.agentKey;
    type Def = { label: string; getValue: (a: typeof agents[number]) => number | null | undefined; direction?: "higher" | "lower" };
    const defs: Def[] = [
      { label: "CSAT", getValue: (a) => a.callEvaluationAverage },
      { label: "Lokal kapatma", getValue: (a) => a.localCloseRate },
      { label: "Toplam görüşme", getValue: (a) => a.totalConversationCount },
      { label: "Çağrı", getValue: (a) => a.totalCallCount },
      { label: "Chat / e-posta", getValue: (a) => a.totalChatMailCount },
      { label: "Ticket", getValue: (a) => a.totalTicketClosedCount },
      { label: "Değerlendirme", getValue: (a) => a.evaluationCount },
      { label: "Konuşma süresi", getValue: (a) => a.avgTalkDurationSeconds, direction: "lower" },
      { label: "Kaçan çağrı", getValue: (a) => a.missedCalls, direction: "lower" }
    ];
    const labels: string[] = [];
    for (const def of defs) {
      const valid = agents.filter((a) => def.getValue(a) != null);
      if (valid.length < 2) continue;
      const me = valid.find((a) => a.agentKey === key);
      if (!me) continue;
      const myValue = def.getValue(me) as number;
      const hasBetter = valid.some((a) => {
        const v = def.getValue(a) as number;
        return def.direction === "lower" ? v < myValue : v > myValue;
      });
      if (!hasBetter) labels.push(def.label);
    }
    // Audit — tie-aware
    const validAudit = auditMetrics.filter((a) => a.auditScore != null);
    if (validAudit.length >= 2) {
      const me = validAudit.find((a) => a.agentKey === key);
      if (me) {
        const myScore = me.auditScore ?? 0;
        const hasBetter = validAudit.some((a) => (a.auditScore ?? 0) > myScore);
        if (!hasBetter) labels.push("Audit");
      }
    }
    return labels;
  }, [selectedRepresentative, snapshot?.datasets.agentMetrics, auditMetrics]);

  const [showCareerModal, setShowCareerModal] = useState(false);

  /* ── Metrik sıralamaları ve modal ── */
  const csAgents = useMemo(() => snapshot?.datasets.agentMetrics ?? [], [snapshot]);
  const [rankingModalMetric, setRankingModalMetric] = useState<string | null>(null);

  type CsAgent = (typeof csAgents)[number];
  type CsMetricDef = {
    key: string;
    label: string;
    getValue: (a: CsAgent) => number | null | undefined;
    format: (v: number) => string;
    direction?: "higher" | "lower";
  };
  const metricDefs: CsMetricDef[] = useMemo(() => [
    { key: "callEvaluationAverage", label: "CSAT", getValue: (a) => a.callEvaluationAverage, format: (v) => formatNumber(v, 3) },
    { key: "totalConversationCount", label: "Toplam görüşme", getValue: (a) => a.totalConversationCount, format: (v) => formatNumber(v) },
    { key: "localCloseRate", label: "Lokal kapatma", getValue: (a) => a.localCloseRate, format: (v) => formatPercent(v) },
    { key: "avgTalkDurationSeconds", label: "Konuşma süresi", getValue: (a) => a.avgTalkDurationSeconds, format: (v) => formatSeconds(v), direction: "lower" },
    { key: "evaluationCount", label: "Değerlendirme", getValue: (a) => a.evaluationCount, format: (v) => formatNumber(v) },
  ], []);

  const metricRankMap = useMemo(() => {
    const map: Record<string, { rank: number; total: number } | null> = {};
    if (!selectedRepresentative || csAgents.length < 2) return map;
    const key = selectedRepresentative.agentKey;
    for (const def of metricDefs) {
      const valid = csAgents.filter((a) => def.getValue(a) != null);
      if (valid.length < 2) { map[def.key] = null; continue; }
      const me = valid.find((a) => a.agentKey === key);
      if (!me) { map[def.key] = null; continue; }
      const myValue = def.getValue(me) as number;
      const higherCount = valid.filter((a) => {
        const v = def.getValue(a) as number;
        return def.direction === "lower" ? v < myValue : v > myValue;
      }).length;
      map[def.key] = { rank: higherCount + 1, total: valid.length };
    }
    const validAudit = auditMetrics.filter((a) => a.auditScore != null);
    if (validAudit.length >= 2) {
      const me = validAudit.find((a) => a.agentKey === selectedRepresentative.agentKey);
      if (me) {
        const myScore = me.auditScore ?? 0;
        const higherCount = validAudit.filter((a) => (a.auditScore ?? 0) > myScore).length;
        map["auditScore"] = { rank: higherCount + 1, total: validAudit.length };
      } else {
        map["auditScore"] = null;
      }
    }
    return map;
  }, [selectedRepresentative, csAgents, auditMetrics, metricDefs]);

  const rankingModalData = useMemo(() => {
    if (!rankingModalMetric) return null;
    const isPriorityName = (name: string | null | undefined) =>
      typeof name === "string" && name.toLocaleLowerCase("tr").includes("müberra");
    const priorityTiebreaker = (a: { agentName?: string | null }, b: { agentName?: string | null }) => {
      const ap = isPriorityName(a.agentName) ? 1 : 0;
      const bp = isPriorityName(b.agentName) ? 1 : 0;
      return bp - ap;
    };
    if (rankingModalMetric === "auditScore") {
      const valid = auditMetrics.filter((a) => a.auditScore != null);
      return {
        label: "Audit skoru",
        rows: [...valid]
          .sort((a, b) => {
            const diff = (b.auditScore ?? 0) - (a.auditScore ?? 0);
            return diff !== 0 ? diff : priorityTiebreaker(a, b);
          })
          .map((a, i) => ({ rank: i + 1, agentKey: a.agentKey, name: a.agentName, value: formatAuditScore(a.auditScore!) }))
      };
    }
    const def = metricDefs.find((d) => d.key === rankingModalMetric);
    if (!def) return null;
    const valid = csAgents.filter((a) => def.getValue(a) != null);
    return {
      label: def.label,
      rows: [...valid]
        .sort((a, b) => {
          const av = def.getValue(a) as number;
          const bv = def.getValue(b) as number;
          const diff = def.direction === "lower" ? av - bv : bv - av;
          return diff !== 0 ? diff : priorityTiebreaker(a, b);
        })
        .map((a, i) => ({ rank: i + 1, agentKey: a.agentKey, name: a.agentName, value: def.format(def.getValue(a) as number) }))
    };
  }, [rankingModalMetric, csAgents, auditMetrics, metricDefs]);

  const premiumOnboardingKeys = useRepresentativeKeysWithBadge("premium_onboarding");
  const teamAverages = useMemo(() => {
    const avg = (values: (number | null | undefined)[]) => {
      const valid = values.filter((v): v is number => v != null);
      return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
    };
    // CSAT ortalaması, CSAT sayfasıyla tutarlı olacak şekilde 'premium_onboarding' etiketli
    // temsilciler hariç hesaplanır; diğer metrikler tüm temsilcilerden ortalanır.
    const csatAgents = csAgents.filter((a) => !premiumOnboardingKeys.has(a.agentKey));
    return {
      callEvaluationAverage: avg(csatAgents.map((a) => a.callEvaluationAverage)),
      totalConversationCount: avg(csAgents.map((a) => a.totalConversationCount)),
      localCloseRate: avg(csAgents.map((a) => a.localCloseRate)),
      avgTalkDurationSeconds: avg(csAgents.map((a) => a.avgTalkDurationSeconds)),
      evaluationCount: avg(csAgents.map((a) => a.evaluationCount)),
      auditScore: avg(auditMetrics.map((a) => a.auditScore)),
    } as Record<string, number | null>;
  }, [csAgents, auditMetrics, premiumOnboardingKeys]);

  const prevPeriodValues = useMemo(() => {
    const currentIdx = trendData.findIndex((p) => p.isCurrent);
    const prev = currentIdx > 0 ? trendData[currentIdx - 1] : null;
    return {
      callEvaluationAverage: prev?.csat ?? null,
      totalConversationCount: prev?.totalConversationCount ?? null,
      localCloseRate: prev?.localCloseRate ?? null,
      avgTalkDurationSeconds: prev?.avgTalkDurationSeconds ?? null,
      evaluationCount: prev?.evaluationCount ?? null,
      auditScore: prev?.auditScore ?? null,
    } as Record<string, number | null>;
  }, [trendData]);

  /* ── Grafik stil değişkenleri ── */
  const gridStroke = isDark ? chartDark.grid : chart.grid;
  const axisFill = isDark ? chartDark.tick : chart.axis;
  const tooltipStyle = isDark ? chartTooltipDark : chartTooltipLight;
  const labelStroke = isDark ? "#0f172a" : "#ffffff";
  // Açık modda koyu metin zaten okunabilir — halo gereksiz "bold" görünüm yaratıyor.
  // Koyu modda marka rengi metin için ince koyu halo eklenir.
  const labelStrokeWidth = isDark ? 2 : 0;
  const labelFontWeight = isDark ? 600 : 500;
  const CS_INK_LIGHT = "#1F2839";
  const CS_INK_DARK = "#94A3B8";
  const csInk = isDark ? CS_INK_DARK : CS_INK_LIGHT;
  // Açık modda her çizginin kendi 700-serisi tonu — renkli ama okunabilir metin, halo gereksiz.
  const LIGHT_LABEL_FILL: Record<string, string> = {
    [brand.rose]: "#BE123C",
    [brand.emerald]: "#047857",
    [brand.accent]: "#6D28D9",
    [brand.sky]: "#0369A1",
    [CS_INK_LIGHT]: "#1F2839"
  };
  const labelFill = (lineColor: string) => (isDark ? lineColor : (LIGHT_LABEL_FILL[lineColor] ?? "#1F2839"));

  const handleRepresentativeChange = (agentKey: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("id", btoa(agentKey));
    next.delete("agentKey");
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Temsilci bazlı rapor"
        actions={
          <div className="flex items-center gap-2">
            <PeriodRangeFilter onChange={setPeriodRange} periods={csPeriods} value={{ ...periodRange, monthPeriodId: monthlyPeriodId }} />
            <RepresentativeSelect
              options={representatives.map((item) => ({ key: item.agentKey, label: item.agentName }))}
              value={selectedRepresentative?.agentKey ?? ""}
              onChange={handleRepresentativeChange}
            />
            <Link
              to={`/cs/compare${selectedRepresentative ? `?a=${selectedRepresentative.agentKey}` : ""}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-white/72 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white/90 dark:border-slate-600/50 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700/80"
            >
              <GitCompareArrows size={14} />
              <span className="hidden sm:inline">Karşılaştır</span>
            </Link>
          </div>
        }
      >
        {selectedRepresentative ? (
          <div className="space-y-6">
            <section className="surface-default rounded-[10px] border border-white/75 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:shadow-none">
              <div className="flex gap-5">
                <div className="w-40 shrink-0 overflow-hidden rounded-[10px] border border-slate-200 dark:border-slate-600/40">
                  <img
                    alt={selectedName}
                    className="aspect-[3/4] w-full object-cover"
                    src={selectedRepresentative.portraitSrc}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="space-y-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="font-display text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-100">{selectedName}</h2>
                        <button
                          type="button"
                          onClick={() => setShowCareerModal(true)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white dark:border-slate-600/50 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          <Route size={13} />
                          Kariyer yolu
                        </button>
                      </div>
                      {topMetricLabels.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {topMetricLabels.map((label) => (
                            <span key={label} className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200/60 dark:border-amber-700/40 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                              <span className="text-amber-500">&#9733;</span> {label} birincisi
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {selectedBadges.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {selectedBadges.map((b: string) => <BadgePill key={b} badgeKey={b} small />)}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      {([
                        { metricKey: "callEvaluationAverage", label: "CSAT", value: formatOrNa(selectedAgent?.callEvaluationAverage, (v) => formatNumber(v, 3)), raw: selectedAgent?.callEvaluationAverage, fmt: (v: number) => formatNumber(v, 3) },
                        { metricKey: "auditScore", label: "Audit", value: formatOrNa(selectedAudit?.auditScore, formatAuditScore), raw: selectedAudit?.auditScore, fmt: formatAuditScore },
                        { metricKey: "totalConversationCount", label: "Görüşme", value: formatOrNa(selectedAgent?.totalConversationCount, (v) => formatNumber(v)), raw: selectedAgent?.totalConversationCount, fmt: (v: number) => formatNumber(v) },
                        { metricKey: "localCloseRate", label: "Lokal kapatma", value: formatOrNa(selectedAgent?.localCloseRate, (v) => formatPercent(v)), raw: selectedAgent?.localCloseRate, fmt: (v: number) => formatPercent(v) },
                        { metricKey: "avgTalkDurationSeconds", label: "Konuşma süresi", value: formatOrNa(selectedAgent?.avgTalkDurationSeconds, (v) => formatSeconds(v)), raw: selectedAgent?.avgTalkDurationSeconds, fmt: (v: number) => formatSeconds(v) },
                        { metricKey: "evaluationCount", label: "Değerlendirme", value: formatOrNa(selectedAgent?.evaluationCount, (v) => formatNumber(v)), raw: selectedAgent?.evaluationCount, fmt: (v: number) => formatNumber(v) },
                      ] as const).map((card) => (
                        <RankedMetricCard
                          key={card.metricKey}
                          label={card.label}
                          value={card.value}
                          rank={metricRankMap[card.metricKey]}
                          currentValue={card.raw ?? null}
                          teamAvg={teamAverages[card.metricKey]}
                          prevValue={prevPeriodValues[card.metricKey]}
                          format={card.fmt}
                          onClick={() => setRankingModalMetric(card.metricKey)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Audit skoru"
                tone={
                  snapshot
                    ? resolveThresholdTone(selectedAudit?.auditScore ?? null, snapshot.thresholds.auditScore)
                    : "neutral"
                }
                value={formatOrNa(selectedAudit?.auditScore, formatAuditScore)}
              />
              <StatCard
                label={previousAuditAccuracyLabel}
                tone="yellow"
                value={formatOrNa(selectedAudit?.previousAuditAccuracy, (value) => formatPercent(value))}
              />
              <StatCard
                label="CSAT"
                tone={resolveCsatTone(selectedAgent?.callEvaluationAverage)}
                value={formatOrNa(selectedAgent?.callEvaluationAverage, (value) => formatNumber(value, 3))}
              />
              <StatCard
                label="Toplam görüşme adedi"
                tone="neutral"
                value={formatOrNa(selectedAgent?.totalConversationCount, (value) => formatNumber(value))}
              />
              <StatCard
                label="Lokal kapatma oranı"
                tone={
                  snapshot
                    ? resolveThresholdTone(selectedAgent?.localCloseRate ?? null, snapshot.thresholds.localCloseRate)
                    : "neutral"
                }
                value={formatOrNa(selectedAgent?.localCloseRate, (value) => formatPercent(value))}
              />
              <StatCard
                label="Ortalama konuşma süresi"
                tone={
                  snapshot
                    ? resolveThresholdTone(
                        selectedAgent?.avgTalkDurationSeconds ?? null,
                        snapshot.thresholds.avgTalkDurationSeconds
                      )
                    : "neutral"
                }
                value={formatOrNa(selectedAgent?.avgTalkDurationSeconds, (value) => formatSeconds(value))}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard title="Çağrı ve işlem detayları">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Toplam çağrı adedi</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedAgent?.totalCallCount, (value) => formatNumber(value))}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Toplam chat / e-posta adedi</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedAgent?.totalChatMailCount, (value) => formatNumber(value))}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Toplam ticket kapatma adedi</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedAgent?.totalTicketClosedCount, (value) => formatNumber(value))}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Kaçan çağrılar</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedAgent?.missedCalls, (value) => formatNumber(value))}
                    </p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Değerlendirme detayları">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Değerlendirme adedi</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedAgent?.evaluationCount, (value) => formatNumber(value))}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Temsilci</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{selectedName}</p>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* ── Kişisel trend grafikleri ── */}
            <div className="grid gap-4 xl:grid-cols-2">
              <ExecutiveChartCard title="Audit Skoru Trendi">
                {trendData.some((p) => p.auditScore !== null) ? (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={trendData} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: axisFill }} tickLine={false} width={40} />
                        <Tooltip contentStyle={{ ...tooltipStyle }} formatter={((v: number) => [formatNumber(v, 1), "Audit Skoru"]) as any} labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullLabel ?? _} />
                        <Line type="monotone" dataKey="auditScore" stroke={csInk} strokeWidth={3} strokeLinecap="round" connectNulls={false} activeDot={{ r: 6, stroke: isDark ? "#1e293b" : "#ffffff", strokeWidth: 2 }} dot={(dp: any) => {
                          const pl = dp.payload;
                          if (dp.cx == null || dp.cy == null || pl.auditScore === null) return <g key={dp.index} />;
                          return (
                            <g key={dp.index}>
                              <circle cx={dp.cx} cy={dp.cy} fill={pl.isCurrent ? csInk : isDark ? "#1e293b" : "#ffffff"} r={pl.isCurrent ? 5 : 3.5} stroke={csInk} strokeWidth={pl.isCurrent ? 3 : 2} />
                              <text fill={labelFill(csInk)} fontSize={11} fontWeight={labelFontWeight} paintOrder="stroke" stroke={labelStroke} strokeWidth={labelStrokeWidth} textAnchor="middle" x={dp.cx} y={dp.cy - 14}>{formatNumber(pl.auditScore, 1)}</text>
                            </g>
                          );
                        }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {trendIsFetching ? "Audit verisi yükleniyor…" : "Audit verisi bulunamadı."}
                  </div>
                )}
              </ExecutiveChartCard>

              <ExecutiveChartCard title="CSAT Trendi">
                {trendData.some((p) => p.csat !== null) ? (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={trendData} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: axisFill }} tickLine={false} width={40} tickFormatter={(v) => formatNumber(v, 1)} />
                        <Tooltip contentStyle={{ ...tooltipStyle }} formatter={((v: number) => [formatNumber(v, 3), "CSAT"]) as any} labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullLabel ?? _} />
                        <Line type="monotone" dataKey="csat" stroke={brand.accent} strokeWidth={3} strokeLinecap="round" connectNulls={false} activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }} dot={(dp: any) => {
                          const pl = dp.payload;
                          if (dp.cx == null || dp.cy == null || pl.csat === null) return <g key={dp.index} />;
                          return (
                            <g key={dp.index}>
                              <circle cx={dp.cx} cy={dp.cy} fill={pl.isCurrent ? brand.accent : "#ffffff"} r={pl.isCurrent ? 5 : 3.5} stroke={brand.accent} strokeWidth={pl.isCurrent ? 3 : 2} />
                              <text fill={labelFill(brand.accent)} fontSize={11} fontWeight={labelFontWeight} paintOrder="stroke" stroke={labelStroke} strokeWidth={labelStrokeWidth} textAnchor="middle" x={dp.cx} y={dp.cy - 14}>{formatNumber(pl.csat, 2)}</text>
                            </g>
                          );
                        }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {trendIsFetching ? "CSAT verisi yükleniyor…" : "CSAT verisi bulunamadı."}
                  </div>
                )}
              </ExecutiveChartCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ExecutiveChartCard title="Lokal Kapatma Trendi">
                {trendData.some((p) => p.localCloseRate !== null) ? (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={trendData} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: axisFill }} tickLine={false} tickFormatter={(v) => `%${formatNumber(v)}`} width={55} />
                        <Tooltip contentStyle={{ ...tooltipStyle }} formatter={((v: number) => [formatPercent(v), "Lokal Kapatma"]) as any} labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullLabel ?? _} />
                        <Line type="monotone" dataKey="localCloseRate" stroke={brand.emerald} strokeWidth={3} strokeLinecap="round" connectNulls={false} activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }} dot={(dp: any) => {
                          const pl = dp.payload;
                          if (dp.cx == null || dp.cy == null || pl.localCloseRate === null) return <g key={dp.index} />;
                          return (
                            <g key={dp.index}>
                              <circle cx={dp.cx} cy={dp.cy} fill={pl.isCurrent ? brand.emerald : "#ffffff"} r={pl.isCurrent ? 5 : 3.5} stroke={brand.emerald} strokeWidth={pl.isCurrent ? 3 : 2} />
                              <text fill={labelFill(brand.emerald)} fontSize={11} fontWeight={labelFontWeight} paintOrder="stroke" stroke={labelStroke} strokeWidth={labelStrokeWidth} textAnchor="middle" x={dp.cx} y={dp.cy - 14}>{formatPercent(pl.localCloseRate)}</text>
                            </g>
                          );
                        }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {trendIsFetching ? "Veri yükleniyor…" : "Lokal kapatma verisi bulunamadı."}
                  </div>
                )}
              </ExecutiveChartCard>

              <ExecutiveChartCard title="Ortalama Konuşma Süresi Trendi">
                {trendData.some((p) => p.avgTalkDurationSeconds !== null) ? (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={trendData} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: axisFill }} tickLine={false} tickFormatter={(v) => formatHms(v)} width={60} />
                        <Tooltip contentStyle={{ ...tooltipStyle }} formatter={((v: number) => [formatHms(v), "Konuşma Süresi"]) as any} labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullLabel ?? _} />
                        <Line type="monotone" dataKey="avgTalkDurationSeconds" stroke={brand.sky} strokeWidth={3} strokeLinecap="round" connectNulls={false} activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }} dot={(dp: any) => {
                          const pl = dp.payload;
                          if (dp.cx == null || dp.cy == null || pl.avgTalkDurationSeconds === null) return <g key={dp.index} />;
                          return (
                            <g key={dp.index}>
                              <circle cx={dp.cx} cy={dp.cy} fill={pl.isCurrent ? brand.sky : "#ffffff"} r={pl.isCurrent ? 5 : 3.5} stroke={brand.sky} strokeWidth={pl.isCurrent ? 3 : 2} />
                              <text fill={labelFill(brand.sky)} fontSize={11} fontWeight={labelFontWeight} paintOrder="stroke" stroke={labelStroke} strokeWidth={labelStrokeWidth} textAnchor="middle" x={dp.cx} y={dp.cy - 14}>{formatHms(pl.avgTalkDurationSeconds)}</text>
                            </g>
                          );
                        }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {trendIsFetching ? "Veri yükleniyor…" : "Konuşma süresi verisi bulunamadı."}
                  </div>
                )}
              </ExecutiveChartCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ExecutiveChartCard title="Toplam Görüşme Trendi">
                {trendData.some((p) => p.totalConversationCount !== null) ? (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={trendData} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: axisFill }} tickLine={false} tickFormatter={(v) => formatNumber(v)} width={55} />
                        <Tooltip contentStyle={{ ...tooltipStyle }} formatter={((v: number) => [formatNumber(v), "Toplam Görüşme"]) as any} labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullLabel ?? _} />
                        <Line type="monotone" dataKey="totalConversationCount" stroke={brand.rose} strokeWidth={3} strokeLinecap="round" connectNulls={false} activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }} dot={(dp: any) => {
                          const pl = dp.payload;
                          if (dp.cx == null || dp.cy == null || pl.totalConversationCount === null) return <g key={dp.index} />;
                          return (
                            <g key={dp.index}>
                              <circle cx={dp.cx} cy={dp.cy} fill={pl.isCurrent ? brand.rose : "#ffffff"} r={pl.isCurrent ? 5 : 3.5} stroke={brand.rose} strokeWidth={pl.isCurrent ? 3 : 2} />
                              <text fill={labelFill(brand.rose)} fontSize={11} fontWeight={labelFontWeight} paintOrder="stroke" stroke={labelStroke} strokeWidth={labelStrokeWidth} textAnchor="middle" x={dp.cx} y={dp.cy - 14}>{formatNumber(pl.totalConversationCount)}</text>
                            </g>
                          );
                        }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {trendIsFetching ? "Veri yükleniyor…" : "Görüşme verisi bulunamadı."}
                  </div>
                )}
              </ExecutiveChartCard>

              {radarData.length > 0 ? (
                <ExecutiveChartCard title="KPI Radar">
                  <div className="h-80 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <RadarChart data={radarData} outerRadius="80%">
                        <PolarGrid stroke={gridStroke} />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: axisFill }} />
                        <Radar dataKey="value" stroke={csInk} fill={csInk} fillOpacity={0.25} strokeWidth={2} />
                        <Tooltip contentStyle={{ ...tooltipStyle, borderRadius: 10 }} formatter={((value: number, _: string, entry: any) => { const item = entry.payload; return [`${item.rawValue} (${formatNumber(value, 0)}%)`, item.metric]; }) as any} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </ExecutiveChartCard>
              ) : null}
            </div>

          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">Seçilen dönemde gösterilecek temsilci verisi bulunamadı.</p>
        )}
      </SectionCard>

      {showCareerModal && selectedRepresentative && (
        <CareerPathModal
          events={selectedTimeline}
          repName={selectedName}
          onClose={() => setShowCareerModal(false)}
        />
      )}

      {rankingModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRankingModalMetric(null)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{rankingModalData.label} sıralaması</h3>
              <button className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300" onClick={() => setRankingModalMetric(null)} type="button">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <ul className="mt-4 max-h-80 space-y-1.5 overflow-y-auto">
              {rankingModalData.rows.map((row) => (
                <li
                  key={row.agentKey}
                  className={[
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                    row.agentKey === selectedRepresentative?.agentKey
                      ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40 font-semibold text-slate-900 dark:text-slate-100"
                      : "text-slate-700 dark:text-slate-300"
                  ].join(" ")}
                >
                  <span className={[
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    row.rank === 1 ? "bg-amber-400 text-white" : row.rank === 2 ? "bg-slate-300 dark:bg-slate-500 text-white" : row.rank === 3 ? "bg-amber-700 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                  ].join(" ")}>{row.rank}</span>
                  <span className="flex-1 truncate">{row.name}</span>
                  <span className="tabular-nums font-semibold">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function RankedMetricCard(props: {
  label: string;
  value: string;
  rank: { rank: number; total: number } | null | undefined;
  currentValue?: number | null | undefined;
  teamAvg?: number | null | undefined;
  prevValue?: number | null | undefined;
  format?: ((v: number) => string) | undefined;
  onClick: () => void;
}) {
  const r = props.rank;
  const cur = props.currentValue;
  const avg = props.teamAvg;
  const prev = props.prevValue;
  const fmt = props.format ?? ((v: number) => String(v));

  const avgDiff = cur != null && avg != null ? cur - avg : null;
  const prevDiff = cur != null && prev != null ? cur - prev : null;

  return (
    <button
      className="group relative rounded-[10px] border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-left transition hover:border-slate-300 hover:shadow-sm dark:border-slate-600/40 dark:bg-slate-800/60 dark:hover:border-slate-500/60"
      onClick={props.onClick}
      type="button"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{props.label}</p>
        {r ? (
          <span className={[
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none",
            r.rank === 1 ? "bg-amber-400 text-white" : r.rank === 2 ? "bg-slate-300 dark:bg-slate-500 text-white" : r.rank === 3 ? "bg-amber-700 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
          ].join(" ")}>#{r.rank}</span>
        ) : null}
      </div>
      <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">{props.value}</p>
      {(avgDiff != null || prevDiff != null) ? (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {avgDiff != null ? (
            <span className={["text-[10px] font-medium", avgDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"].join(" ")}>
              {avgDiff >= 0 ? "\u25B2" : "\u25BC"} Ort: {fmt(avg!)}
            </span>
          ) : null}
          {prevDiff != null ? (
            <span className={["text-[10px] font-medium", prevDiff > 0 ? "text-emerald-600 dark:text-emerald-400" : prevDiff < 0 ? "text-rose-500 dark:text-rose-400" : "text-slate-400"].join(" ")}>
              {prevDiff > 0 ? "\u25B2" : prevDiff < 0 ? "\u25BC" : "="} {prevDiff > 0 ? "+" : ""}{fmt(Math.abs(prevDiff))}
            </span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

function buildRepresentativeAvatar(name: string, index: number, variant: "square" | "landscape") {
  const repositoryPhoto = getRepresentativePhotoSrc(name);
  if (repositoryPhoto) {
    return repositoryPhoto;
  }

  const palettes: Array<{ start: string; end: string; glow: string }> = [
    { start: "#60a5fa", end: "#2563eb", glow: "#bfdbfe" },
    { start: "#38bdf8", end: "#0f766e", glow: "#a5f3fc" },
    { start: "#f59e0b", end: "#f97316", glow: "#fde68a" },
    { start: "#a78bfa", end: "#7c3aed", glow: "#ddd6fe" }
  ];
  const palette = palettes[index % palettes.length] ?? palettes[0] ?? { start: "#60a5fa", end: "#2563eb", glow: "#bfdbfe" };
  const initials = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (variant === "square") {
    const squareSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${palette.start}" />
            <stop offset="100%" stop-color="${palette.end}" />
          </linearGradient>
        </defs>
        <rect width="160" height="160" rx="36" fill="url(#bg)" />
        <circle cx="36" cy="38" r="24" fill="${palette.glow}" opacity="0.28" />
        <circle cx="126" cy="128" r="18" fill="white" opacity="0.14" />
        <text
          x="50%"
          y="54%"
          dominant-baseline="middle"
          text-anchor="middle"
          fill="white"
          font-family="Inter, Arial, sans-serif"
          font-size="50"
          font-weight="700"
          letter-spacing="4"
        >
          ${initials}
        </text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(squareSvg)}`;
  }

  const landscapeSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
      </defs>
      <rect width="480" height="360" rx="42" fill="url(#bg)" />
      <circle cx="88" cy="74" r="52" fill="${palette.glow}" opacity="0.25" />
      <circle cx="394" cy="286" r="44" fill="white" opacity="0.14" />
      <rect x="126" y="76" width="228" height="208" rx="34" fill="rgba(255,255,255,0.12)" />
      <circle cx="240" cy="150" r="50" fill="rgba(255,255,255,0.2)" />
      <rect x="168" y="212" width="144" height="26" rx="13" fill="rgba(255,255,255,0.18)" />
      <text
        x="240"
        y="162"
        dominant-baseline="middle"
        text-anchor="middle"
        fill="white"
        font-family="Inter, Arial, sans-serif"
        font-size="58"
        font-weight="700"
        letter-spacing="5"
      >
        ${initials}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(landscapeSvg)}`;
}
