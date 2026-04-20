import { selectAuditMetrics, selectDefaultReportPeriod } from "@kalitedb/shared";
import type { AuditMetric, SalesKpiAgent } from "@kalitedb/shared";
import { ExecutiveChartCard, SectionCard, StatCard } from "@kalitedb/ui";
import { useQuery } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { GitCompareArrows, Route } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatNumber, formatPercent, parseTalkDurationLabelToSeconds } from "../lib/format";
import { brand, chart, chartDark, chartTooltipLight, chartTooltipDark } from "../theme/colors";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import {
  aggregateAuditMetrics,
  aggregateMultiPeriodKpi,
  computeActivePeriodIds,
  derivePeriodRangeSelectors,
  getQuarterPeriodIds
} from "../lib/period-aggregation";
import { RepresentativeSelect } from "../components/representative-select";
import { BadgePill } from "../components/representative-detail-modal";
import { CareerPathModal } from "../components/career-path-modal";
import { useActiveRepresentativeKeys } from "../lib/use-active-representatives";

function formatOrNa(value: number | null | undefined, formatter: (value: number) => string) {
  return value === null || value === undefined ? "N/A" : formatter(value);
}

function formatTryCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR").format(value) + " TRY";
}

function formatHms(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Satış sayfasına özel ana grafik rengi — light: koyu lacivert, dark: açık slate */
const SALES_INK_LIGHT = "#1F2839";
const SALES_INK_DARK = "#94A3B8";

function formatShortMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  const fmt = new Intl.DateTimeFormat("tr-TR", { month: "short" });
  const label = fmt.format(new Date(Date.UTC(year, month - 1, 1))).replace(".", "");
  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1);
}


function computeSalesSuccessIndex(params: {
  auditScore: number | null | undefined;
  perfScore: number | null | undefined;
  conversionRate: number | null | undefined;
}) {
  const metrics: number[] = [];

  if (params.auditScore !== null && params.auditScore !== undefined) {
    metrics.push(params.auditScore);
  }

  if (params.perfScore !== null && params.perfScore !== undefined) {
    metrics.push(params.perfScore);
  }

  if (params.conversionRate !== null && params.conversionRate !== undefined) {
    metrics.push(params.conversionRate);
  }

  if (metrics.length === 0) {
    return null;
  }

  return metrics.reduce((sum, value) => sum + value, 0) / metrics.length;
}

function resolveSuccessState(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return {
      label: "Beklemede",
      accentClass: "text-slate-500 dark:text-slate-400",
    };
  }

  if (value >= 85) {
    return {
      label: "İyi",
      accentClass: "text-emerald-700 dark:text-emerald-400",
    };
  }

  if (value >= 70) {
    return {
      label: "İzlenmeli",
      accentClass: "text-sky-700 dark:text-sky-400",
    };
  }

  return {
    label: "Geliştirilmeli",
    accentClass: "text-rose-700 dark:text-rose-400",
  };
}

export function SalesRepresentativesPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const datasetTypes = ["agent-metrics", "audit-metrics"] as const;

  /* ── Grafik tema degiskenleri ── */
  const { isDark } = useDarkMode();
  const salesInk = isDark ? SALES_INK_DARK : SALES_INK_LIGHT;
  const axisFill = isDark ? "rgba(255,255,255,0.6)" : chart.axis;
  const gridStroke = isDark ? chartDark.grid : chart.grid;
  const tooltipStyle = isDark ? { ...chartTooltipDark } : { ...chartTooltipLight };
  const labelStroke = isDark ? "#1e293b" : "#ffffff";

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const salesPeriods = useMemo(
    () =>
      [...(periodsQuery.data ?? [])]
        .filter((p) => (p.department ?? "cs") === "sales")
        .sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const now = new Date();
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return {
      year,
      viewMode: "aylik",
      monthPeriodId: searchParams.get("periodId") ?? undefined,
      quarter
    };
  });

  const { yearPeriods } = useMemo(
    () => derivePeriodRangeSelectors(salesPeriods, periodRange.year),
    [salesPeriods, periodRange.year]
  );

  const defaultPeriod = useMemo(() => {
    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(
      now.getMonth() === 0 ? 12 : now.getMonth()
    ).padStart(2, "0")}`;
    return yearPeriods.find((p) => p.month === prevMonth) ?? selectDefaultReportPeriod(yearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearPeriods]);

  const periodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId)
    ? periodRange.monthPeriodId
    : defaultPeriod?.id;

  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) {
      setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
    }
  }, [defaultPeriod?.id, periodRange.monthPeriodId]);

  // Aylık modda URL'yi periodId ile senkronize tut (çeyreklik/yıllıkta URL'den kaldır)
  useEffect(() => {
    const current = searchParams.get("periodId");
    if (periodRange.viewMode === "aylik") {
      if (periodId && current !== periodId) {
        const params = new URLSearchParams(searchParams);
        params.set("periodId", periodId);
        setSearchParams(params, { replace: true });
      }
    } else if (current) {
      const params = new URLSearchParams(searchParams);
      params.delete("periodId");
      setSearchParams(params, { replace: true });
    }
  }, [periodRange.viewMode, periodId, searchParams, setSearchParams]);

  const activePeriodIds = useMemo(
    () =>
      computeActivePeriodIds(yearPeriods, {
        ...periodRange,
        monthPeriodId: periodId
      }),
    [periodRange, periodId, yearPeriods]
  );

  const activePeriodIdsKey = activePeriodIds.join(",");

  // Önceki dönem period ID'leri (çeyreklik: önceki çeyrek, yıllık: önceki yıl)
  const prevActivePeriodIds = useMemo(() => {
    if (periodRange.viewMode === "aylik") return []; // aylık karşılaştırma trendData'dan gelir
    if (periodRange.viewMode === "ceyreklik" && periodRange.quarter) {
      const prevQ = periodRange.quarter - 1;
      if (prevQ >= 1) return getQuarterPeriodIds(yearPeriods, prevQ);
      // Q1 ise önceki yılın Q4'ü — şimdilik atla
      return [];
    }
    // Yıllık: önceki yılın dönemleri
    const prevYear = String(Number(periodRange.year) - 1);
    return salesPeriods.filter((p) => p.month.startsWith(`${prevYear}-`)).map((p) => p.id);
  }, [periodRange, yearPeriods, salesPeriods]);

  const prevActivePeriodIdsKey = prevActivePeriodIds.join(",");

  // Çoklu period KPI: aylıkta tek fetch, çeyreklik/yıllıkta paralel + aggregate
  const kpiQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["sales-rep-multi-kpi", auth.token, activePeriodIdsKey],
    queryFn: async () => {
      const results = await Promise.all(
        activePeriodIds.map((pid) => api.getSalesKpiData(auth.token, pid))
      );
      if (results.length === 1) {
        return results[0];
      }
      return aggregateMultiPeriodKpi(results);
    },
    staleTime: 60 * 1000
  });

  // Çoklu period Audit: aylıkta tek dashboard, çeyreklik/yıllıkta bulk audit + aggregate
  const auditQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["sales-rep-multi-audit", auth.token, activePeriodIdsKey],
    queryFn: async (): Promise<AuditMetric[]> => {
      if (activePeriodIds.length === 1) {
        const dashboard = await api.getDashboard(auth.token, activePeriodIds[0]!, undefined, {
          datasetTypes: [...datasetTypes]
        });
        return selectAuditMetrics(dashboard.datasets);
      }
      const auditMap = await api.getAuditMetricsForPeriods(auth.token, activePeriodIds);
      const metricsPerPeriod = activePeriodIds.map((pid) => auditMap[pid] ?? []);
      return aggregateAuditMetrics(metricsPerPeriod);
    },
    staleTime: 60 * 1000
  });

  const auditMetrics: AuditMetric[] = auditQuery.data ?? [];
  const kpiAgents: SalesKpiAgent[] =
    kpiQuery.data && "agents" in kpiQuery.data ? kpiQuery.data.agents : [];

  // Önceki dönem verileri (çeyreklik/yıllık karşılaştırma için)
  const prevKpiQuery = useQuery({
    enabled: prevActivePeriodIds.length > 0,
    queryKey: ["sales-rep-prev-kpi", auth.token, prevActivePeriodIdsKey],
    queryFn: async () => {
      const results = await Promise.all(
        prevActivePeriodIds.map((pid) => api.getSalesKpiData(auth.token, pid))
      );
      if (results.length === 1) return results[0];
      return aggregateMultiPeriodKpi(results);
    },
    staleTime: 60 * 1000
  });

  const prevAuditQuery = useQuery({
    enabled: prevActivePeriodIds.length > 0,
    queryKey: ["sales-rep-prev-audit", auth.token, prevActivePeriodIdsKey],
    queryFn: async (): Promise<AuditMetric[]> => {
      const auditMap = await api.getAuditMetricsForPeriods(auth.token, prevActivePeriodIds);
      const metricsPerPeriod = prevActivePeriodIds.map((pid) => auditMap[pid] ?? []);
      return aggregateAuditMetrics(metricsPerPeriod);
    },
    staleTime: 60 * 1000
  });

  const { activeKeys } = useActiveRepresentativeKeys();

  const repsQuery = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const representatives = useMemo(() => {
    const options = new Map<string, string>();
    const excludedKeys = new Set<string>();
    // Önce kayıtlı temsilcilerden (dönemden bağımsız) — sadece satış
    (repsQuery.data ?? []).forEach((r) => {
      const dept = r.department ?? "cs";
      if (dept === "sales" || dept === "partner") {
        options.set(r.key, r.displayName);
      } else {
        excludedKeys.add(r.key);
      }
    });
    // Sonra dönem verisinden (ek isimler olabilir); CS olarak bilinenleri atla
    auditMetrics.forEach((record) => {
      if (excludedKeys.has(record.agentKey)) return;
      options.set(record.agentKey, record.agentName);
    });
    kpiAgents.forEach((record) => {
      if (!record.agentKey || excludedKeys.has(record.agentKey)) return;
      options.set(record.agentKey, record.agentName);
    });

    return Array.from(options.entries())
      .filter(([agentKey]) => !activeKeys || activeKeys.has(agentKey))
      .map(([agentKey, agentName]) => ({ agentKey, agentName }))
      .sort((left, right) => left.agentName.localeCompare(right.agentName, "tr"))
      .map((item, index) => ({
        ...item,
        portraitSrc: buildRepresentativeAvatar(item.agentName, index)
      }));
  }, [activeKeys, auditMetrics, kpiAgents, repsQuery.data]);

  const representativeRanking = useMemo(
    () =>
      representatives
        .map((item) => {
          const kpi = kpiAgents.find((record) => record.agentKey === item.agentKey) ?? null;
          return {
            agentKey: item.agentKey,
            salesAmount: kpi?.salesAmount ?? null
          };
        })
        .sort((left, right) => (right.salesAmount ?? -1) - (left.salesAmount ?? -1)),
    [kpiAgents, representatives]
  );

  const topPerformerKey = representativeRanking[0]?.salesAmount != null ? representativeRanking[0].agentKey : null;
  const rawId = searchParams.get("id");
  const legacyKey = searchParams.get("agentKey");
  const decodedKey = rawId ? (() => { try { return atob(rawId); } catch { return null; } })() : null;
  const selectedAgentKey = decodedKey ?? legacyKey ?? topPerformerKey ?? representatives[0]?.agentKey;
  const selectedRepresentative = representatives.find((item) => item.agentKey === selectedAgentKey) ?? representatives[0] ?? null;
  const selectedAudit = auditMetrics.find((record) => record.agentKey === selectedRepresentative?.agentKey) ?? null;
  const selectedKpi: SalesKpiAgent | null = kpiAgents.find((record) => record.agentKey === selectedRepresentative?.agentKey) ?? null;

  const selectedName = selectedRepresentative?.agentName ?? "N/A";
  const selectedRepData = (repsQuery.data ?? []).find((r) => r.key === selectedRepresentative?.agentKey);
  const selectedBadges = (selectedRepData as any)?.badges ?? [];
  const selectedTimeline = (selectedRepData as any)?.timeline ?? [];
  const selectedSuccessIndex = computeSalesSuccessIndex({
    auditScore: selectedAudit?.auditScore,
    perfScore: selectedKpi?.perfScore,
    conversionRate: selectedKpi?.conversionRate
  });
  const selectedState = resolveSuccessState(selectedSuccessIndex);

  const selectedRank =
    selectedRepresentative == null
      ? null
      : representativeRanking.findIndex((item) => item.agentKey === selectedRepresentative.agentKey) + 1 || null;

  /* ── Confetti: herhangi bir metrikte #1 olan temsilcide bir kereye mahsus patlar ── */
  const confettiFiredRef = useRef<Set<string>>(new Set());

  const fireConfetti = useCallback(() => {
    const end = Date.now() + 2500;
    const frame = () => {
      confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.6 } });
      confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.6 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);

  /* ── Metrik sıralamaları ve modal ── */
  type MetricDef = { key: string; label: string; getValue: (a: SalesKpiAgent) => number | null | undefined; format: (v: number) => string; tiebreaker?: (a: SalesKpiAgent) => number };
  const metricDefs: MetricDef[] = useMemo(() => [
    { key: "salesAmount", label: "Satış tutarı", getValue: (a) => a.salesAmount, format: formatTryCurrency },
    { key: "licenseCount", label: "Lisans adedi", getValue: (a) => a.licenseCount, format: (v) => formatNumber(v) },
    { key: "perfScore", label: "Perf. değerlendirme", getValue: (a) => a.perfScore, format: (v) => formatNumber(v, 1) },
    { key: "conversionRate", label: "Dönüşüm oranı", getValue: (a) => a.conversionRate, format: (v) => formatPercent(v), tiebreaker: (a) => a.licenseCount ?? 0 },
    { key: "callAttempts", label: "Arama girişimi", getValue: (a) => a.callAttempts, format: (v) => formatNumber(v) },
    { key: "talkDurationSeconds", label: "Konuşma süresi", getValue: (a) => a.talkDurationSeconds, format: formatHms },
    { key: "avgLicensePrice", label: "Ort. lisans fiyatı", getValue: (a) => a.avgLicensePrice, format: formatTryCurrency },
    { key: "scaleCount", label: "Scale 2+1", getValue: (a) => a.scaleCount, format: (v) => formatNumber(v) },
    { key: "scalePlusCount", label: "Scale+ 2+1", getValue: (a) => a.scalePlusCount, format: (v) => formatNumber(v) },
    { key: "scaleConversion", label: "Scale %", getValue: (a) => a.scaleConversion, format: (v) => formatPercent(v), tiebreaker: (a) => a.scaleCount ?? 0 },
    { key: "scalePlusConversion", label: "Scale+ %", getValue: (a) => a.scalePlusConversion, format: (v) => formatPercent(v), tiebreaker: (a) => a.scalePlusCount ?? 0 },
    { key: "totalConversion", label: "Toplam dönüşüm %", getValue: (a) => a.totalConversion, format: (v) => formatPercent(v), tiebreaker: (a) => (a.scaleCount ?? 0) + (a.scalePlusCount ?? 0) },
  ], []);

  const metricRankMap = useMemo(() => {
    const map: Record<string, { rank: number; total: number } | null> = {};
    if (!selectedRepresentative || kpiAgents.length < 2) return map;
    const key = selectedRepresentative.agentKey;
    const compare = (def: MetricDef, a: SalesKpiAgent, b: SalesKpiAgent) => {
      const diff = (def.getValue(b) as number) - (def.getValue(a) as number);
      if (diff !== 0 || !def.tiebreaker) return diff;
      return def.tiebreaker(b) - def.tiebreaker(a);
    };
    for (const def of metricDefs) {
      const valid = kpiAgents.filter((a) => def.getValue(a) != null);
      if (valid.length < 2) { map[def.key] = null; continue; }
      const me = valid.find((a) => a.agentKey === key);
      if (!me) { map[def.key] = null; continue; }
      const higherCount = valid.filter((a) => compare(def, a, me) < 0).length;
      map[def.key] = { rank: higherCount + 1, total: valid.length };
    }
    // Audit — tie-aware
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
  }, [selectedRepresentative, kpiAgents, auditMetrics, metricDefs]);

  const isTopInAnyMetric = useMemo(() => {
    if (!selectedRepresentative) return false;
    for (const k of Object.keys(metricRankMap)) {
      if (metricRankMap[k]?.rank === 1) return true;
    }
    return false;
  }, [selectedRepresentative, metricRankMap]);

  useEffect(() => {
    if (
      isTopInAnyMetric &&
      selectedRepresentative &&
      !confettiFiredRef.current.has(selectedRepresentative.agentKey)
    ) {
      confettiFiredRef.current.add(selectedRepresentative.agentKey);
      fireConfetti();
    }
  }, [isTopInAnyMetric, selectedRepresentative, fireConfetti]);

  const topMetricLabels = useMemo(() => {
    const labels: string[] = [];
    for (const def of metricDefs) {
      if (metricRankMap[def.key]?.rank === 1) labels.push(def.label);
    }
    if (metricRankMap["auditScore"]?.rank === 1) labels.push("Audit skoru");
    return labels;
  }, [metricDefs, metricRankMap]);

  const [rankingModalMetric, setRankingModalMetric] = useState<string | null>(null);
  const [showCareerModal, setShowCareerModal] = useState(false);

  const rankingModalData = useMemo(() => {
    if (!rankingModalMetric) return null;
    if (rankingModalMetric === "auditScore") {
      const valid = auditMetrics.filter((a) => a.auditScore != null);
      return {
        label: "Audit skoru",
        rows: [...valid]
          .sort((a, b) => (b.auditScore ?? 0) - (a.auditScore ?? 0))
          .map((a, i) => ({ rank: i + 1, agentKey: a.agentKey, name: a.agentName, value: formatNumber(a.auditScore!, 1) }))
      };
    }
    const def = metricDefs.find((d) => d.key === rankingModalMetric);
    if (!def) return null;
    const valid = kpiAgents.filter((a) => def.getValue(a) != null);
    return {
      label: def.label,
      rows: [...valid]
        .sort((a, b) => {
          const diff = (def.getValue(b) as number) - (def.getValue(a) as number);
          if (diff !== 0 || !def.tiebreaker) return diff;
          return def.tiebreaker(b) - def.tiebreaker(a);
        })
        .map((a, i) => ({ rank: i + 1, agentKey: a.agentKey, name: a.agentName, value: def.format(def.getValue(a) as number) }))
    };
  }, [rankingModalMetric, kpiAgents, auditMetrics, metricDefs]);

  /* ── Takım ortalamaları ── */
  const teamAverages = useMemo(() => {
    const avg = (values: (number | null | undefined)[]) => {
      const valid = values.filter((v): v is number => v != null);
      return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
    };
    return {
      salesAmount: avg(kpiAgents.map((a) => a.salesAmount)),
      licenseCount: avg(kpiAgents.map((a) => a.licenseCount)),
      perfScore: avg(kpiAgents.map((a) => a.perfScore)),
      conversionRate: avg(kpiAgents.map((a) => a.conversionRate)),
      callAttempts: avg(kpiAgents.map((a) => a.callAttempts)),
      talkDurationSeconds: avg(kpiAgents.map((a) => a.talkDurationSeconds)),
      avgLicensePrice: avg(kpiAgents.map((a) => a.avgLicensePrice)),
      scaleCount: avg(kpiAgents.map((a) => a.scaleCount)),
      scalePlusCount: avg(kpiAgents.map((a) => a.scalePlusCount)),
      scaleConversion: avg(kpiAgents.map((a) => a.scaleConversion)),
      scalePlusConversion: avg(kpiAgents.map((a) => a.scalePlusConversion)),
      totalConversion: avg(kpiAgents.map((a) => a.totalConversion)),
      auditScore: avg(auditMetrics.map((a) => a.auditScore)),
    } as Record<string, number | null>;
  }, [kpiAgents, auditMetrics]);

  /* ── Grafik 1: Aylik Satis Trendi — coklu donem verisi ── */
  const last6Periods = useMemo(
    () =>
      [...salesPeriods]
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-6),
    [salesPeriods]
  );

  const trendQuery = useQuery({
    enabled: last6Periods.length > 0 && Boolean(selectedAgentKey),
    queryKey: ["sales-rep-trend", auth.token, selectedAgentKey, last6Periods.map((p) => p.id).join(","), periodId],
    queryFn: async () => {
      const results = await Promise.all(
        last6Periods.map(async (period) => {
          const data = await api.getSalesKpiData(auth.token, period.id);
          const agent = data?.agents.find((a) => a.agentKey === selectedAgentKey);
          return {
            label: formatShortMonth(period.month),
            fullLabel: period.title ?? period.month,
            salesAmount: agent?.salesAmount ?? null,
            licenseCount: agent?.licenseCount ?? null,
            conversionRate: agent?.conversionRate ?? null,
            talkDurationSeconds: agent?.talkDurationSeconds ?? null,
            callAttempts: agent?.callAttempts ?? null,
            perfScore: agent?.perfScore ?? null,
            avgLicensePrice: agent?.avgLicensePrice ?? null,
            scaleCount: agent?.scaleCount ?? null,
            scalePlusCount: agent?.scalePlusCount ?? null,
            scaleConversion: agent?.scaleConversion ?? null,
            scalePlusConversion: agent?.scalePlusConversion ?? null,
            totalConversion: agent?.totalConversion ?? null,
            isCurrent: period.id === periodId
          };
        })
      );
      return results;
    },
    staleTime: 5 * 60_000
  });

  const auditTrendQuery = useQuery({
    enabled: last6Periods.length > 0 && Boolean(selectedAgentKey),
    queryKey: ["sales-rep-audit-trend", auth.token, selectedAgentKey, last6Periods.map((p) => p.id).join(","), periodId],
    queryFn: async () => {
      const map = await api.getAuditMetricsForPeriods(auth.token, last6Periods.map((p) => p.id));
      return last6Periods.map((period) => {
        const audits = map[period.id] ?? [];
        const agentAudit = audits.find((a) => a.agentKey === selectedAgentKey);
        return {
          label: formatShortMonth(period.month),
          fullLabel: period.title ?? period.month,
          auditScore: agentAudit?.auditScore ?? null,
          isCurrent: period.id === periodId
        };
      });
    },
    staleTime: 5 * 60_000
  });

  const trendData = trendQuery.data ?? [];
  const auditTrendData = auditTrendQuery.data ?? [];

  /* ── Önceki dönem verisi (aylık: trendData, çeyreklik/yıllık: prevKpiQuery) ── */
  const prevPeriodValues = useMemo(() => {
    if (periodRange.viewMode === "aylik") {
      const currentIdx = trendData.findIndex((p) => p.isCurrent);
      const prev = currentIdx > 0 ? trendData[currentIdx - 1] : null;
      const prevAudit = (() => {
        const idx = auditTrendData.findIndex((p) => p.isCurrent);
        return idx > 0 ? auditTrendData[idx - 1] : null;
      })();
      return {
        salesAmount: prev?.salesAmount ?? null,
        licenseCount: prev?.licenseCount ?? null,
        perfScore: prev?.perfScore ?? null,
        conversionRate: prev?.conversionRate ?? null,
        callAttempts: prev?.callAttempts ?? null,
        talkDurationSeconds: prev?.talkDurationSeconds ?? null,
        scaleCount: prev?.scaleCount ?? null,
        scalePlusCount: prev?.scalePlusCount ?? null,
        scaleConversion: prev?.scaleConversion ?? null,
        scalePlusConversion: prev?.scalePlusConversion ?? null,
        totalConversion: prev?.totalConversion ?? null,
        avgLicensePrice: prev?.avgLicensePrice ?? null,
        auditScore: prevAudit?.auditScore ?? null,
      } as Record<string, number | null>;
    }

    // Çeyreklik / Yıllık: önceki dönem query'sinden al
    if (!selectedRepresentative) return {} as Record<string, number | null>;
    const prevAgents: SalesKpiAgent[] = prevKpiQuery.data && "agents" in prevKpiQuery.data ? prevKpiQuery.data.agents : [];
    const prevAgent = prevAgents.find((a) => a.agentKey === selectedRepresentative.agentKey);
    const prevAudits: AuditMetric[] = prevAuditQuery.data ?? [];
    const prevAudit = prevAudits.find((a) => a.agentKey === selectedRepresentative.agentKey);
    return {
      salesAmount: prevAgent?.salesAmount ?? null,
      licenseCount: prevAgent?.licenseCount ?? null,
      perfScore: prevAgent?.perfScore ?? null,
      conversionRate: prevAgent?.conversionRate ?? null,
      callAttempts: prevAgent?.callAttempts ?? null,
      talkDurationSeconds: prevAgent?.talkDurationSeconds ?? null,
      scaleCount: prevAgent?.scaleCount ?? null,
      scalePlusCount: prevAgent?.scalePlusCount ?? null,
      scaleConversion: prevAgent?.scaleConversion ?? null,
      scalePlusConversion: prevAgent?.scalePlusConversion ?? null,
      totalConversion: prevAgent?.totalConversion ?? null,
      avgLicensePrice: prevAgent?.avgLicensePrice ?? null,
      auditScore: prevAudit?.auditScore ?? null,
    } as Record<string, number | null>;
  }, [periodRange.viewMode, trendData, auditTrendData, selectedRepresentative, prevKpiQuery.data, prevAuditQuery.data]);

  /* ── KPI Radar ── */
  const radarData = useMemo(() => {
    if (!selectedKpi) return [];
    const targets = kpiQuery.data?.targets;

    // Tüm metrikler gerçek hedefe karşı normalleştirilir. Hedef yoksa ya da 0
    // ise o metrik radar'a 0 olarak düşer (sahte fallback yok).
    const norm = (actual: number | null | undefined, target: number | null | undefined) => {
      if (actual == null || target == null || target <= 0) return 0;
      return Math.min(100, (actual / target) * 100);
    };

    // salesAmount takım toplamıdır. Radar kişi başı hedefi kullanır:
    // perPersonSalesTarget varsa onu al, yoksa takım toplamını agent sayısına böl.
    const perPersonSalesTarget =
      targets?.perPersonSalesTarget ??
      (targets?.salesAmount != null ? targets.salesAmount / Math.max(kpiAgents.length, 1) : null);

    // Eski kayıtlarda talkDurationTargetSeconds olmayabilir — label'dan fallback hesapla.
    const talkTargetSeconds =
      targets?.talkDurationTargetSeconds ?? parseTalkDurationLabelToSeconds(targets?.talkDurationLabel ?? "");

    return [
      {
        metric: "Performans",
        value: norm(selectedKpi.perfScore, targets?.perfScore),
        rawValue: formatOrNa(selectedKpi.perfScore, (v) => formatNumber(v, 1))
      },
      {
        metric: "Satış",
        value: norm(selectedKpi.salesAmount, perPersonSalesTarget),
        rawValue: formatTryCurrency(selectedKpi.salesAmount)
      },
      {
        metric: "Lisans",
        value: norm(selectedKpi.licenseCount, targets?.licenseCount),
        rawValue: formatNumber(selectedKpi.licenseCount)
      },
      {
        metric: "Dönüşüm",
        value: norm(selectedKpi.conversionRate, targets?.conversionRate),
        rawValue: formatPercent(selectedKpi.conversionRate)
      },
      {
        metric: "Arama",
        value: norm(selectedKpi.callAttempts, targets?.callAttempts),
        rawValue: formatNumber(selectedKpi.callAttempts)
      },
      {
        metric: "Konuşma",
        value: norm(selectedKpi.talkDurationSeconds, talkTargetSeconds),
        rawValue: formatHms(selectedKpi.talkDurationSeconds)
      }
    ];
  }, [selectedKpi, kpiQuery.data?.targets, kpiAgents.length]);

  const handleRepresentativeChange = (agentKey: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("id", btoa(agentKey));
    next.delete("agentKey");
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Satış temsilcisi raporu"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodRangeFilter
              onChange={setPeriodRange}
              periods={salesPeriods}
              value={{ ...periodRange, monthPeriodId: periodId }}
            />
            <RepresentativeSelect
              options={representatives.map((item) => ({ key: item.agentKey, label: item.agentName }))}
              value={selectedRepresentative?.agentKey ?? ""}
              onChange={handleRepresentativeChange}
            />
            <Link
              to={`/sales/compare${selectedRepresentative ? `?a=${selectedRepresentative.agentKey}` : ""}`}
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
                <div className="w-44 shrink-0 self-stretch overflow-hidden rounded-[10px] border border-slate-200 dark:border-slate-600/40">
                  <img
                    alt={selectedName}
                    className="h-full w-full object-cover"
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

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                      {([
                        { metricKey: "perfScore", label: "Perf. Değ.", value: formatOrNa(selectedKpi?.perfScore, (v) => formatNumber(v, 1)), raw: selectedKpi?.perfScore, fmt: (v: number) => formatNumber(v, 1) },
                        { metricKey: "salesAmount", label: "Satış Tutarı", value: formatOrNa(selectedKpi?.salesAmount, formatTryCurrency), raw: selectedKpi?.salesAmount, fmt: formatTryCurrency },
                        { metricKey: "licenseCount", label: "Lisans", value: formatOrNa(selectedKpi?.licenseCount, (v) => formatNumber(v)), raw: selectedKpi?.licenseCount, fmt: (v: number) => formatNumber(v) },
                        { metricKey: "talkDurationSeconds", label: "Konuşma", value: formatOrNa(selectedKpi?.talkDurationSeconds, formatHms), raw: selectedKpi?.talkDurationSeconds, fmt: formatHms },
                        { metricKey: "conversionRate", label: "Dönüşüm", value: formatOrNa(selectedKpi?.conversionRate, (v) => formatPercent(v)), raw: selectedKpi?.conversionRate, fmt: (v: number) => formatPercent(v) },
                        { metricKey: "scaleCount", label: "Scale 2+1", value: formatOrNa(selectedKpi?.scaleCount, (v) => formatNumber(v)), raw: selectedKpi?.scaleCount, fmt: (v: number) => formatNumber(v) },
                        { metricKey: "scalePlusCount", label: "Scale+ 2+1", value: formatOrNa(selectedKpi?.scalePlusCount, (v) => formatNumber(v)), raw: selectedKpi?.scalePlusCount, fmt: (v: number) => formatNumber(v) },
                        { metricKey: "totalConversion", label: "Toplam %", value: formatOrNa(selectedKpi?.totalConversion, (v) => formatPercent(v)), raw: selectedKpi?.totalConversion, fmt: (v: number) => formatPercent(v) },
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

            <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Performans değerlendirme"
                tone="neutral"
                value={formatOrNa(selectedKpi?.perfScore, (v) => formatNumber(v, 1))}
              />
              <StatCard
                label="Satış tutarı"
                tone="neutral"
                value={formatOrNa(selectedKpi?.salesAmount, formatTryCurrency)}
              />
              <StatCard
                label="Lisans adeti"
                tone="neutral"
                value={formatOrNa(selectedKpi?.licenseCount, (v) => formatNumber(v))}
              />
              <StatCard
                label="Dönüşüm oranı"
                tone="neutral"
                value={formatOrNa(selectedKpi?.conversionRate, (v) => formatPercent(v))}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard title="KPI detayları">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Ortalama lisans fiyatı</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedKpi?.avgLicensePrice, formatTryCurrency)}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Arama girişimi</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedKpi?.callAttempts, (v) => formatNumber(v))}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Konuşma süresi</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedKpi?.talkDurationSeconds, formatHms)}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Dönüşüm oranı</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedKpi?.conversionRate, (v) => formatPercent(v))}
                    </p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="2+1 Dönüşüm">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Scale 2+1</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedKpi?.scaleCount, (v) => formatNumber(v))}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Scale %</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedKpi?.scaleConversion, (v) => formatPercent(v))}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Scale Plus 2+1</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedKpi?.scalePlusCount, (v) => formatNumber(v))}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Scale Plus %</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {formatOrNa(selectedKpi?.scalePlusConversion, (v) => formatPercent(v))}
                    </p>
                  </div>
                </div>
              </SectionCard>

            </div>

            {/* ── Kisisel Grafikler ── */}
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Satis Tutari Trendi */}
              <ExecutiveChartCard title="Satış Tutarı Trendi">
                {trendData.some((p) => p.salesAmount !== null) ? (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={trendData} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: axisFill }} tickLine={false} tickFormatter={(v) => formatNumber(v)} width={65} />
                        <Tooltip contentStyle={{ ...tooltipStyle }} formatter={((v: number) => [formatTryCurrency(v), "Satış Tutarı"]) as any} labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullLabel ?? _} />
                        <Line type="monotone" dataKey="salesAmount" stroke={salesInk} strokeWidth={3} strokeLinecap="round" connectNulls={false} activeDot={{ r: 6, stroke: isDark ? "#1e293b" : "#ffffff", strokeWidth: 2 }} dot={(dotProps: any) => {
                          const pl = dotProps.payload;
                          if (dotProps.cx == null || dotProps.cy == null || pl.salesAmount === null) return <g key={dotProps.index} />;
                          return (
                            <g key={dotProps.index}>
                              <circle cx={dotProps.cx} cy={dotProps.cy} fill={pl.isCurrent ? salesInk : isDark ? "#1e293b" : "#ffffff"} r={pl.isCurrent ? 5 : 3.5} stroke={salesInk} strokeWidth={pl.isCurrent ? 3 : 2} />
                              <text fill={salesInk} fontSize={10} fontWeight={700} paintOrder="stroke" stroke={labelStroke} strokeWidth={4} textAnchor="middle" x={dotProps.cx} y={dotProps.cy - 14}>{formatNumber(pl.salesAmount)}</text>
                            </g>
                          );
                        }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {trendQuery.isFetching ? "Trend verisi yükleniyor\u2026" : "Trend verisi bulunamadı."}
                  </div>
                )}
              </ExecutiveChartCard>

              {/* Lisans Adedi Trendi */}
              <ExecutiveChartCard title="Lisans Adedi Trendi">
                {trendData.some((p) => p.licenseCount !== null) ? (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={trendData} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: axisFill }} tickLine={false} width={45} />
                        <Tooltip contentStyle={{ ...tooltipStyle }} formatter={((v: number) => [formatNumber(v), "Lisans Adedi"]) as any} labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullLabel ?? _} />
                        <Line type="monotone" dataKey="licenseCount" stroke={brand.accent} strokeWidth={3} strokeLinecap="round" connectNulls={false} activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }} dot={(dotProps: any) => {
                          const pl = dotProps.payload;
                          if (dotProps.cx == null || dotProps.cy == null || pl.licenseCount === null) return <g key={dotProps.index} />;
                          return (
                            <g key={dotProps.index}>
                              <circle cx={dotProps.cx} cy={dotProps.cy} fill={pl.isCurrent ? brand.accent : "#ffffff"} r={pl.isCurrent ? 5 : 3.5} stroke={brand.accent} strokeWidth={pl.isCurrent ? 3 : 2} />
                              <text fill={brand.accent} fontSize={10} fontWeight={700} paintOrder="stroke" stroke={labelStroke} strokeWidth={4} textAnchor="middle" x={dotProps.cx} y={dotProps.cy - 14}>{formatNumber(pl.licenseCount)}</text>
                            </g>
                          );
                        }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {trendQuery.isFetching ? "Trend verisi yükleniyor\u2026" : "Trend verisi bulunamadı."}
                  </div>
                )}
              </ExecutiveChartCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {/* Donusum Orani Trendi */}
              <ExecutiveChartCard title="Dönüşüm Oranı Trendi">
                {trendData.some((p) => p.conversionRate !== null) ? (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={trendData} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: axisFill }} tickLine={false} tickFormatter={(v) => `%${formatNumber(v)}`} width={50} />
                        <Tooltip contentStyle={{ ...tooltipStyle }} formatter={((v: number) => [formatPercent(v), "Dönüşüm Oranı"]) as any} labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullLabel ?? _} />
                        <Line type="monotone" dataKey="conversionRate" stroke={brand.emerald} strokeWidth={3} strokeLinecap="round" connectNulls={false} activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }} dot={(dotProps: any) => {
                          const pl = dotProps.payload;
                          if (dotProps.cx == null || dotProps.cy == null || pl.conversionRate === null) return <g key={dotProps.index} />;
                          return (
                            <g key={dotProps.index}>
                              <circle cx={dotProps.cx} cy={dotProps.cy} fill={pl.isCurrent ? brand.emerald : "#ffffff"} r={pl.isCurrent ? 5 : 3.5} stroke={brand.emerald} strokeWidth={pl.isCurrent ? 3 : 2} />
                              <text fill={brand.emerald} fontSize={10} fontWeight={700} paintOrder="stroke" stroke={labelStroke} strokeWidth={4} textAnchor="middle" x={dotProps.cx} y={dotProps.cy - 14}>{formatPercent(pl.conversionRate)}</text>
                            </g>
                          );
                        }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {trendQuery.isFetching ? "Trend verisi yükleniyor\u2026" : "Trend verisi bulunamadı."}
                  </div>
                )}
              </ExecutiveChartCard>

              {/* Konusma Suresi Trendi */}
              <ExecutiveChartCard title="Konuşma Süresi Trendi">
                {trendData.some((p) => p.talkDurationSeconds !== null) ? (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={trendData} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: axisFill }} tickLine={false} tickFormatter={(v) => formatHms(v)} width={55} />
                        <Tooltip contentStyle={{ ...tooltipStyle }} formatter={((v: number) => [formatHms(v), "Konuşma Süresi"]) as any} labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullLabel ?? _} />
                        <Line type="monotone" dataKey="talkDurationSeconds" stroke={brand.sky} strokeWidth={3} strokeLinecap="round" connectNulls={false} activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }} dot={(dotProps: any) => {
                          const pl = dotProps.payload;
                          if (dotProps.cx == null || dotProps.cy == null || pl.talkDurationSeconds === null) return <g key={dotProps.index} />;
                          return (
                            <g key={dotProps.index}>
                              <circle cx={dotProps.cx} cy={dotProps.cy} fill={pl.isCurrent ? brand.sky : "#ffffff"} r={pl.isCurrent ? 5 : 3.5} stroke={brand.sky} strokeWidth={pl.isCurrent ? 3 : 2} />
                              <text fill={brand.sky} fontSize={10} fontWeight={700} paintOrder="stroke" stroke={labelStroke} strokeWidth={4} textAnchor="middle" x={dotProps.cx} y={dotProps.cy - 14}>{formatHms(pl.talkDurationSeconds)}</text>
                            </g>
                          );
                        }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {trendQuery.isFetching ? "Trend verisi yükleniyor\u2026" : "Trend verisi bulunamadı."}
                  </div>
                )}
              </ExecutiveChartCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {/* Audit Skoru Trendi */}
              <ExecutiveChartCard title="Audit Skoru Trendi">
                {auditTrendData.some((p) => p.auditScore !== null) ? (
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={auditTrendData} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: axisFill }} tickLine={false} domain={[0, 100]} width={40} />
                        <Tooltip contentStyle={{ ...tooltipStyle }} formatter={((v: number) => [formatNumber(v, 1), "Audit Skoru"]) as any} labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullLabel ?? _} />
                        <Line type="monotone" dataKey="auditScore" stroke={brand.rose} strokeWidth={3} strokeLinecap="round" connectNulls={false} activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }} dot={(dotProps: any) => {
                          const pl = dotProps.payload;
                          if (dotProps.cx == null || dotProps.cy == null || pl.auditScore === null) return <g key={dotProps.index} />;
                          return (
                            <g key={dotProps.index}>
                              <circle cx={dotProps.cx} cy={dotProps.cy} fill={pl.isCurrent ? brand.rose : "#ffffff"} r={pl.isCurrent ? 5 : 3.5} stroke={brand.rose} strokeWidth={pl.isCurrent ? 3 : 2} />
                              <text fill={brand.rose} fontSize={10} fontWeight={700} paintOrder="stroke" stroke={labelStroke} strokeWidth={4} textAnchor="middle" x={dotProps.cx} y={dotProps.cy - 14}>{formatNumber(pl.auditScore, 1)}</text>
                            </g>
                          );
                        }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {auditTrendQuery.isFetching ? "Audit verisi yükleniyor\u2026" : "Audit verisi bulunamadı."}
                  </div>
                )}
              </ExecutiveChartCard>

              {/* KPI Radar */}
              {radarData.length > 0 ? (
                <ExecutiveChartCard title="KPI Radar">
                  <div className="h-80 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <RadarChart data={radarData} outerRadius="80%">
                        <PolarGrid stroke={gridStroke} />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: axisFill }} />
                        <Radar dataKey="value" stroke={salesInk} fill={salesInk} fillOpacity={0.25} strokeWidth={2} />
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

function buildRepresentativeAvatar(name: string, index: number) {
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

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 220">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
      </defs>
      <rect width="160" height="220" rx="20" fill="url(#bg)" />
      <circle cx="36" cy="38" r="24" fill="${palette.glow}" opacity="0.28" />
      <circle cx="126" cy="188" r="18" fill="white" opacity="0.14" />
      <text
        x="50%"
        y="48%"
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

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
