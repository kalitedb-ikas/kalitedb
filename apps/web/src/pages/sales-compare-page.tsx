import { selectAuditMetrics, selectDefaultReportPeriod } from "@kalitedb/shared";
import type { AuditMetric, SalesKpiAgent } from "@kalitedb/shared";
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
import { formatNumber, formatPercent, parseTalkDurationLabelToSeconds } from "../lib/format";
import { brand, chartTooltipLight, chartTooltipDark } from "../theme/colors";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import {
  aggregateAuditMetrics,
  aggregateMultiPeriodKpi,
  computeActivePeriodIds,
  derivePeriodRangeSelectors
} from "../lib/period-aggregation";
import { RepresentativeSelect } from "../components/representative-select";
import { BadgePill } from "../components/representative-detail-modal";
import { CompareMetricRow } from "../components/compare/compare-metric-row";
import { useActiveRepresentativeKeys } from "../lib/use-active-representatives";

/* ── Yardımcılar ── */

function formatTryCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR").format(value) + " TRY";
}

function formatHms(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function computeSalesSuccessIndex(params: {
  auditScore: number | null | undefined;
  perfScore: number | null | undefined;
  conversionRate: number | null | undefined;
}) {
  const metrics: number[] = [];
  if (params.auditScore != null) metrics.push(params.auditScore);
  if (params.perfScore != null) metrics.push(params.perfScore);
  if (params.conversionRate != null) metrics.push(params.conversionRate);
  return metrics.length === 0 ? null : metrics.reduce((s, v) => s + v, 0) / metrics.length;
}

function resolveSuccessState(value: number | null | undefined) {
  if (value == null) return { label: "Beklemede", cls: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-400" };
  if (value >= 85) return { label: "İyi", cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-400" };
  if (value >= 70) return { label: "İzlenmeli", cls: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700/40 dark:bg-sky-900/30 dark:text-sky-400" };
  return { label: "Geliştirilmeli", cls: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400" };
}

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

/** Tek bir taraf için dönem → satış verisi hook'u */
function useSalesSideData(
  auth: { token: string | null },
  salesPeriods: any[],
  periodRange: PeriodRangeValue,
  setPeriodRange: (fn: (prev: PeriodRangeValue) => PeriodRangeValue) => void
) {
  const datasetTypes = ["agent-metrics", "audit-metrics"] as const;

  const yearPeriods = useMemo(() => {
    const all = derivePeriodRangeSelectors(salesPeriods, periodRange.year);
    return all.yearPeriods;
  }, [salesPeriods, periodRange.year]);

  const now = new Date();
  const defaultPeriod = useMemo(() => {
    const prev = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
    return yearPeriods.find((p) => p.month === prev) ?? selectDefaultReportPeriod(yearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearPeriods]);

  const periodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId) ? periodRange.monthPeriodId : defaultPeriod?.id;

  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
  }, [defaultPeriod?.id, periodRange.monthPeriodId, setPeriodRange]);

  const activePeriodIds = useMemo(
    () => computeActivePeriodIds(yearPeriods, { ...periodRange, monthPeriodId: periodId }),
    [periodRange, periodId, yearPeriods]
  );

  const activePeriodIdsKey = activePeriodIds.join(",");

  const kpiQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["sales-rep-multi-kpi", auth.token, activePeriodIdsKey],
    queryFn: async () => {
      const results = await Promise.all(activePeriodIds.map((pid) => api.getSalesKpiData(auth.token, pid)));
      return results.length === 1 ? results[0] : aggregateMultiPeriodKpi(results);
    },
    staleTime: 60 * 1000
  });

  const auditQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["sales-rep-multi-audit", auth.token, activePeriodIdsKey],
    queryFn: async (): Promise<AuditMetric[]> => {
      if (activePeriodIds.length === 1) {
        const dashboard = await api.getDashboard(auth.token, activePeriodIds[0]!, undefined, { datasetTypes: [...datasetTypes] });
        return selectAuditMetrics(dashboard.datasets);
      }
      const auditMap = await api.getAuditMetricsForPeriods(auth.token, activePeriodIds);
      const metricsPerPeriod = activePeriodIds.map((pid) => auditMap[pid] ?? []);
      return aggregateAuditMetrics(metricsPerPeriod);
    },
    staleTime: 60 * 1000
  });

  const auditMetrics: AuditMetric[] = auditQuery.data ?? [];
  const kpiAgents: SalesKpiAgent[] = kpiQuery.data && "agents" in kpiQuery.data ? kpiQuery.data.agents : [];

  return { kpiQuery, kpiAgents, auditMetrics, periodId, yearPeriods };
}

/* ── Sayfa ── */

export function SalesComparePage() {
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

  const salesPeriods = useMemo(
    () => [...(periodsQuery.data ?? [])].filter((p) => (p.department ?? "cs") === "sales").sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const sideA = useSalesSideData(auth, salesPeriods, periodRangeA, setPeriodRangeA);
  const sideB = useSalesSideData(auth, salesPeriods, periodRangeB, setPeriodRangeB);

  /* Temsilci listesi */
  const { activeKeys } = useActiveRepresentativeKeys();

  const repsQuery = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const representatives = useMemo(() => {
    const options = new Map<string, string>();
    (repsQuery.data ?? []).filter((r) => (r.department ?? "cs") === "sales").forEach((r) => options.set(r.key, r.displayName));
    sideA.auditMetrics.forEach((record) => options.set(record.agentKey, record.agentName));
    sideA.kpiAgents.forEach((record) => { if (record.agentKey) options.set(record.agentKey, record.agentName); });
    sideB.auditMetrics.forEach((record) => options.set(record.agentKey, record.agentName));
    sideB.kpiAgents.forEach((record) => { if (record.agentKey) options.set(record.agentKey, record.agentName); });

    return Array.from(options.entries())
      .filter(([k]) => !activeKeys || activeKeys.has(k))
      .map(([agentKey, agentName]) => ({ agentKey, agentName }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"))
      .map((item, index) => ({ ...item, avatarSrc: buildAvatar(item.agentName, index) }));
  }, [activeKeys, repsQuery.data, sideA.auditMetrics, sideA.kpiAgents, sideB.auditMetrics, sideB.kpiAgents]);

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
  const kpiA = sideA.kpiAgents.find((m) => m.agentKey === keyA) ?? null;
  const kpiB = sideB.kpiAgents.find((m) => m.agentKey === keyB) ?? null;
  const auditA = sideA.auditMetrics.find((m) => m.agentKey === keyA) ?? null;
  const auditB = sideB.auditMetrics.find((m) => m.agentKey === keyB) ?? null;

  const repDataA = (repsQuery.data ?? []).find((r) => r.key === keyA);
  const repDataB = (repsQuery.data ?? []).find((r) => r.key === keyB);

  const successA = computeSalesSuccessIndex({ auditScore: auditA?.auditScore, perfScore: kpiA?.perfScore, conversionRate: kpiA?.conversionRate });
  const successB = computeSalesSuccessIndex({ auditScore: auditB?.auditScore, perfScore: kpiB?.perfScore, conversionRate: kpiB?.conversionRate });
  const stateA = resolveSuccessState(successA);
  const stateB = resolveSuccessState(successB);

  /* Radar verisi */
  const radarData = useMemo(() => {
    if (!kpiA && !kpiB) return [];
    // Radar target'ları sideA'dan al (referans olarak)
    const targets = sideA.kpiQuery.data?.targets;

    const norm = (actual: number | null | undefined, target: number | null | undefined) => {
      if (actual == null || target == null || target <= 0) return 0;
      return Math.min(100, (actual / target) * 100);
    };

    const agentCount = Math.max(sideA.kpiAgents.length, sideB.kpiAgents.length, 1);
    const perPersonSalesTarget =
      targets?.perPersonSalesTarget ??
      (targets?.salesAmount != null ? targets.salesAmount / agentCount : null);

    const talkTargetSeconds =
      targets?.talkDurationTargetSeconds ?? parseTalkDurationLabelToSeconds(targets?.talkDurationLabel ?? "");

    const nameLeft = repA?.agentName ?? "Sol";
    const nameRight = repB?.agentName ?? "Sağ";

    const metrics = [
      { metric: "Performans", a: kpiA?.perfScore, b: kpiB?.perfScore, target: targets?.perfScore },
      { metric: "Satış", a: kpiA?.salesAmount, b: kpiB?.salesAmount, target: perPersonSalesTarget },
      { metric: "Lisans", a: kpiA?.licenseCount, b: kpiB?.licenseCount, target: targets?.licenseCount },
      { metric: "Dönüşüm", a: kpiA?.conversionRate, b: kpiB?.conversionRate, target: targets?.conversionRate },
      { metric: "Arama", a: kpiA?.callAttempts, b: kpiB?.callAttempts, target: targets?.callAttempts },
      { metric: "Konuşma", a: kpiA?.talkDurationSeconds, b: kpiB?.talkDurationSeconds, target: talkTargetSeconds }
    ];

    return metrics.map((m) => ({
      metric: m.metric,
      [nameLeft]: norm(m.a, m.target),
      [nameRight]: norm(m.b, m.target)
    }));
  }, [kpiA, kpiB, sideA.kpiQuery.data?.targets, sideA.kpiAgents.length, sideB.kpiAgents.length, repA, repB]);

  const nameA = repA?.agentName ?? "Sol";
  const nameB = repB?.agentName ?? "Sağ";

  const selectOptions = representatives.map((r) => ({ key: r.agentKey, label: r.agentName }));

  return (
    <div className="space-y-6">
      <SectionCard
        title="Satış Temsilci Karşılaştırma"
        actions={
          <Link
            to="/sales/representatives"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-white/72 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white/90 dark:border-slate-600/50 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700/80"
          >
            <ArrowLeft size={14} />
            Geri
          </Link>
        }
      >
        {/* Seçiciler: her tarafta temsilci + dönem */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/40 dark:bg-slate-800/30">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Sol</span>
            <div className="flex flex-wrap items-center gap-2">
              <RepresentativeSelect options={selectOptions} value={keyA} onChange={(k) => setKey("a", k)} placeholder="Temsilci seçin" />
              <PeriodRangeFilter onChange={setPeriodRangeA} periods={salesPeriods} value={{ ...periodRangeA, monthPeriodId: sideA.periodId }} />
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/40 dark:bg-slate-800/30">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Sağ</span>
            <div className="flex flex-wrap items-center gap-2">
              <RepresentativeSelect options={selectOptions} value={keyB} onChange={(k) => setKey("b", k)} placeholder="Temsilci seçin" />
              <PeriodRangeFilter onChange={setPeriodRangeB} periods={salesPeriods} value={{ ...periodRangeB, monthPeriodId: sideB.periodId }} />
            </div>
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
              <SalesRepCard name={repA?.agentName} avatarSrc={repA?.avatarSrc} badges={(repDataA as any)?.badges ?? []} successIndex={successA} state={stateA} />
              <SalesRepCard name={repB?.agentName} avatarSrc={repB?.avatarSrc} badges={(repDataB as any)?.badges ?? []} successIndex={successB} state={stateB} />
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
                        dataKey={nameA}
                        stroke={brand.primary}
                        fill={brand.primary}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                      <Radar
                        name={nameB}
                        dataKey={nameB}
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
                <CompareMetricRow label="Başarı Endeksi" leftValue={successA} rightValue={successB} format={(v) => formatNumber(v, 1)} />
                <CompareMetricRow label="Perf. Değerlendirme" leftValue={kpiA?.perfScore} rightValue={kpiB?.perfScore} format={(v) => formatNumber(v, 1)} />
                <CompareMetricRow label="Satış Tutarı" leftValue={kpiA?.salesAmount} rightValue={kpiB?.salesAmount} format={formatTryCurrency} />
                <CompareMetricRow label="Lisans" leftValue={kpiA?.licenseCount} rightValue={kpiB?.licenseCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Ort. Lisans Fiyatı" leftValue={kpiA?.avgLicensePrice} rightValue={kpiB?.avgLicensePrice} format={formatTryCurrency} />
                <CompareMetricRow label="Dönüşüm" leftValue={kpiA?.conversionRate} rightValue={kpiB?.conversionRate} format={formatPercent} />
                <CompareMetricRow label="Arama Girişimi" leftValue={kpiA?.callAttempts} rightValue={kpiB?.callAttempts} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Konuşma Süresi" leftValue={kpiA?.talkDurationSeconds} rightValue={kpiB?.talkDurationSeconds} format={formatHms} />
                <CompareMetricRow label="Scale 2+1" leftValue={kpiA?.scaleCount} rightValue={kpiB?.scaleCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Scale+ 2+1" leftValue={kpiA?.scalePlusCount} rightValue={kpiB?.scalePlusCount} format={(v) => formatNumber(v)} />
                <CompareMetricRow label="Scale %" leftValue={kpiA?.scaleConversion} rightValue={kpiB?.scaleConversion} format={formatPercent} />
                <CompareMetricRow label="Scale+ %" leftValue={kpiA?.scalePlusConversion} rightValue={kpiB?.scalePlusConversion} format={formatPercent} />
                <CompareMetricRow label="Toplam Dönüşüm %" leftValue={kpiA?.totalConversion} rightValue={kpiB?.totalConversion} format={formatPercent} />
                <CompareMetricRow label="Audit" leftValue={auditA?.auditScore} rightValue={auditB?.auditScore} format={(v) => formatNumber(v, 1)} />
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ── Temsilci profil kartı ── */

function SalesRepCard(props: {
  name: string | undefined;
  avatarSrc: string | undefined;
  badges: string[];
  successIndex: number | null;
  state: { label: string; cls: string };
}) {
  const { name, avatarSrc, badges, successIndex, state } = props;

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
        <div className="shrink-0 text-right">
          <p className="text-xs text-slate-500 dark:text-slate-400">Başarı</p>
          <p className="text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
            {successIndex != null ? formatNumber(successIndex, 1) : "N/A"}
          </p>
          <span className={`mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${state.cls}`}>
            {state.label}
          </span>
        </div>
      </div>
    </div>
  );
}
