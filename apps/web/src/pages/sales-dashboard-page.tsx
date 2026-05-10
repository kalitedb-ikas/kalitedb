import {
  ChampionSpotlightCard,
  ExecutiveChartCard,
  InsightTile,
  Leaderboard,
  PageHeader,
  StatCard,
  SurfaceCard
} from "@kalitedb/ui";
import { selectDefaultReportPeriod } from "@kalitedb/shared";
import type { SalesKpiAgent, LicenseSummary, ReportPeriod } from "@kalitedb/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Award,
  Target,
  TrendingDown,
  TrendingUp
} from "lucide-react";

import { useAuth } from "../lib/auth";
import { useDarkMode } from "../lib/use-dark-mode";
import { api } from "../lib/api";
import { formatNumber, formatPeriodMonth } from "../lib/format";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";
import { brand, chart, chartDark, chartTooltipLight, chartTooltipDark } from "../theme/colors";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import {
  QUARTER_SHORT,
  aggregateMultiPeriodKpi,
  computeActivePeriodIds,
  derivePeriodRangeSelectors
} from "../lib/period-aggregation";

/** Satış sayfasına özel ana grafik rengi — light: koyu lacivert, dark: açık slate */
const SALES_INK_LIGHT = "#1F2839";
const SALES_INK_DARK = "#94A3B8";

/* ── Yardimci fonksiyonlar ── */

function formatCurrency(value: number | null): string {
  if (value === null) return "-";
  return formatNumber(value) + " TRY";
}

function formatShortMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  const fmt = new Intl.DateTimeFormat("tr-TR", { month: "short" });
  const label = fmt.format(new Date(Date.UTC(year, month - 1, 1))).replace(".", "");
  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1);
}

function computeDashboardSummary(agents: SalesKpiAgent[]) {
  const count = agents.length;
  if (count === 0) {
    return {
      totalSalesAmount: 0,
      totalLicenseCount: 0,
      totalCallAttempts: 0,
      totalScaleCount: 0,
      totalScalePlusCount: 0,
      avgConversionRate: 0,
      avgLicensePrice: 0,
      topByAmount: null as SalesKpiAgent | null,
      topByLicense: null as SalesKpiAgent | null,
      bottom3: [] as SalesKpiAgent[]
    };
  }

  const totalSalesAmount = agents.reduce((s, a) => s + a.salesAmount, 0);
  const totalLicenseCount = agents.reduce((s, a) => s + a.licenseCount, 0);
  const totalCallAttempts = agents.reduce((s, a) => s + a.callAttempts, 0);
  const totalScaleCount = agents.reduce((s, a) => s + (a.scaleCount ?? 0), 0);
  const totalScalePlusCount = agents.reduce((s, a) => s + (a.scalePlusCount ?? 0), 0);
  const avgConversionRate = agents.reduce((s, a) => s + a.conversionRate, 0) / count;
  const avgLicensePrice = agents.reduce((s, a) => s + a.avgLicensePrice, 0) / count;

  const sortedByAmount = [...agents].sort((a, b) => b.salesAmount - a.salesAmount);
  const sortedByLicense = [...agents].sort((a, b) => b.licenseCount - a.licenseCount);

  return {
    totalSalesAmount,
    totalLicenseCount,
    totalCallAttempts,
    totalScaleCount,
    totalScalePlusCount,
    avgConversionRate,
    avgLicensePrice,
    topByAmount: sortedByAmount[0] ?? null,
    topByLicense: sortedByLicense[0] ?? null,
    bottom3: sortedByAmount.slice(-3).reverse()
  };
}

function truncateName(name: string, max = 10): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

const DONUT_KEYS = [
  { key: "scaleCount", label: "Scale" },
  { key: "scalePlusCount", label: "Scale Plus" },
  { key: "preCount", label: "Pre" }
] as const;

type DonutSubItem = { name: string; value: number };
type DonutSlice = {
  name: string;
  value: number;
  color: string;
  /** Lejandda ana satırın altında girintili gösterilen alt-kalemler (donut dilimine etkimez). */
  subItems?: DonutSubItem[];
};

function computeLicenseDonut(
  licenseSummary: LicenseSummary | undefined,
  agents: SalesKpiAgent[],
  salesInk: string
): DonutSlice[] {
  const donutColors = [salesInk, brand.accent, brand.sky];
  const lsTotal = licenseSummary
    ? licenseSummary.preCount + licenseSummary.scaleCount + licenseSummary.scalePlusCount
    : 0;

  if (licenseSummary && lsTotal > 0) {
    return DONUT_KEYS.map((item, i) => {
      const slice: DonutSlice = {
        name: item.label,
        value: licenseSummary[item.key],
        color: donutColors[i] ?? salesInk
      };
      if (item.key === "scaleCount") {
        slice.subItems = [{ name: "2+1", value: licenseSummary.scale2Plus1Count }];
      } else if (item.key === "scalePlusCount") {
        slice.subItems = [{ name: "2+1", value: licenseSummary.scalePlus2Plus1Count }];
      }
      return slice;
    }).filter((d) => d.value > 0);
  }

  const totalScale = agents.reduce((s, a) => s + (a.scaleCount ?? 0), 0);
  const totalScalePlus = agents.reduce((s, a) => s + (a.scalePlusCount ?? 0), 0);
  const totalLicense = agents.reduce((s, a) => s + a.licenseCount, 0);

  if (totalScale > 0 || totalScalePlus > 0) {
    const otherCount = totalLicense - totalScale - totalScalePlus;
    return [
      { name: "Scale", value: totalScale, color: salesInk },
      { name: "Scale Plus", value: totalScalePlus, color: brand.accent },
      ...(otherCount > 0 ? [{ name: "Diğer", value: otherCount, color: brand.sky }] : [])
    ].filter((d) => d.value > 0);
  }

  return [];
}

type DeltaInfo = {
  /** null = oran hesaplanamaz (eski 0 ve yeni 0). */
  pct: number | null;
  direction: "up" | "down" | "flat";
  /** Eski 0 iken yeni > 0 olduğu özel durumda yüzde yerine "yeni" rakamı göstermek için. */
  fromZero: boolean;
};

function computeDelta(current: number, base: number): DeltaInfo {
  if (base === 0 && current === 0) return { pct: null, direction: "flat", fromZero: false };
  if (base === 0) return { pct: null, direction: "up", fromZero: true };
  const pct = ((current - base) / base) * 100;
  const direction: DeltaInfo["direction"] = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
  return { pct, direction, fromZero: false };
}

function formatDelta(info: DeltaInfo): string {
  if (info.fromZero) return "yeni";
  if (info.pct === null) return "—";
  const arrow = info.direction === "up" ? "▲" : info.direction === "down" ? "▼" : "■";
  const sign = info.pct > 0 ? "+" : "";
  return `${arrow} ${sign}${formatNumber(info.pct, 1)}%`;
}

function describeDonutPeriod(value: PeriodRangeValue, periods: ReportPeriod[]): string {
  if (value.viewMode === "yillik") return value.year;
  if (value.viewMode === "ceyreklik") {
    return `${value.year} ${QUARTER_SHORT[(value.quarter ?? 1) - 1]}`;
  }
  const period = periods.find((p) => p.id === value.monthPeriodId);
  if (period) return formatPeriodMonth(period.month, { includeYear: true });
  return value.year;
}

/* ── Ana Component ── */

export function SalesDashboardPage() {
  const auth = useAuth();
  const { isDark } = useDarkMode();
  const now = new Date();

  // Dark mode'da chart renkleri
  const salesInk = isDark ? SALES_INK_DARK : SALES_INK_LIGHT;
  const axisFill = isDark ? "rgba(255,255,255,0.72)" : "#334155";
  const axisMutedFill = isDark ? "rgba(255,255,255,0.6)" : "#475569";
  const gridStroke = isDark ? chartDark.grid : chart.grid;
  const gridMutedStroke = isDark ? chartDark.grid : chart.gridMuted;
  const tooltipStyle = isDark ? { ...chartTooltipDark } : { ...chartTooltipLight };
  const labelStroke = isDark ? "#1e293b" : "#ffffff";

  /* ── State ── */
  // Ocak'daysak onceki ay Aralik, yil onceki yil olmali
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth(); // 0-indexed
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  });

  const selectedYear = periodRange.year;
  const viewMode = periodRange.viewMode;
  const selectedQuarter = periodRange.quarter ?? 1;

  /* ── Donemler ── */
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

  const { yearPeriods } = useMemo(
    () => derivePeriodRangeSelectors(salesPeriods, selectedYear),
    [salesPeriods, selectedYear]
  );

  /* ── Secili donem ID'leri (gorunum moduna gore) ── */
  // Varsayilan olarak bir onceki ayi sec (raporlama icin)
  const defaultPeriod = useMemo(() => {
    const prevMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;
    const prev = yearPeriods.find((p) => p.month === prevMonth);
    return prev ?? selectDefaultReportPeriod(yearPeriods);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearPeriods]);
  const monthlyPeriodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId)
    ? periodRange.monthPeriodId
    : defaultPeriod?.id;

  // Varsayilan aktif ay setlenmemisse monthPeriodId'yi set et (ilk yuklemede)
  useEffect(() => {
    if (!periodRange.monthPeriodId && defaultPeriod?.id) {
      setPeriodRange((prev) => ({ ...prev, monthPeriodId: defaultPeriod.id }));
    }
  }, [defaultPeriod?.id, periodRange.monthPeriodId]);

  const activePeriodIds = useMemo(
    () =>
      computeActivePeriodIds(yearPeriods, {
        ...periodRange,
        monthPeriodId: monthlyPeriodId
      }),
    [periodRange, monthlyPeriodId, yearPeriods]
  );

  /* ── KPI verisi ── */
  const kpiQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["sales-dashboard-kpi", auth.token, activePeriodIds.join(",")],
    queryFn: async () => {
      if (activePeriodIds.length === 1) {
        return api.getSalesKpiData(auth.token, activePeriodIds[0]!);
      }
      const results = await Promise.all(
        activePeriodIds.map((pid) => api.getSalesKpiData(auth.token, pid))
      );
      return aggregateMultiPeriodKpi(results);
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const kpiData = kpiQuery.data;
  const agents: SalesKpiAgent[] = kpiData && "agents" in kpiData ? (kpiData as any).agents ?? [] : [];
  const targets = kpiData && "targets" in kpiData ? (kpiData as any).targets ?? null : null;

  const summary = useMemo(() => computeDashboardSummary(agents), [agents]);

  /* ── Yillik trend verisi ── */
  const yearlyTrendQuery = useQuery({
    enabled: yearPeriods.length > 0,
    queryKey: ["sales-dashboard-trend", auth.token, selectedYear, yearPeriods.map((p) => p.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        yearPeriods.map(async (period) => {
          const data = await api.getSalesKpiData(auth.token, period.id);
          if (!data || data.agents.length === 0) return { period: period.month, periodId: period.id, salesAmount: null, licenseCount: null };
          const total = data.agents.reduce((s, a) => s + a.salesAmount, 0);
          const totalLicense = data.agents.reduce((s, a) => s + a.licenseCount, 0);
          // Gercek veri yoksa null don (cizgi 0'a dusmesin)
          return { period: period.month, periodId: period.id, salesAmount: total || null, licenseCount: totalLicense || null };
        })
      );

      // 12 aylik grid olustur
      return Array.from({ length: 12 }, (_, i) => {
        const month = String(i + 1).padStart(2, "0");
        const period = `${selectedYear}-${month}`;
        const point = results.find((r) => r.period === period);
        return {
          label: formatShortMonth(period),
          fullLabel: formatPeriodMonth(period, { includeYear: true }),
          salesAmount: point?.salesAmount ?? null,
          licenseCount: point?.licenseCount ?? null,
          isCurrent: point?.periodId === monthlyPeriodId
        };
      });
    },
    staleTime: 5 * 60 * 1000
  });

  const yearlyTrend = yearlyTrendQuery.data ?? [];

  /* ── Turetilmis veri: Arama verimliligi ── */
  const callEfficiency = useMemo(() => {
    return agents
      .filter((a) => a.callAttempts > 0)
      .map((a) => ({
        name: a.agentName,
        efficiency: Math.round(a.salesAmount / a.callAttempts),
        salesAmount: a.salesAmount,
        callAttempts: a.callAttempts
      }))
      .sort((a, b) => b.efficiency - a.efficiency);
  }, [agents]);

  /* ── Turetilmis veri: Scale vs Scale+ ── */
  const scaleComparison = useMemo(() => {
    return [...agents]
      .sort((a, b) => ((b.scaleCount ?? 0) + (b.scalePlusCount ?? 0)) - ((a.scaleCount ?? 0) + (a.scalePlusCount ?? 0)))
      .map((a) => ({
        name: a.agentName,
        scale: a.scaleCount ?? 0,
        scalePlus: a.scalePlusCount ?? 0
      }));
  }, [agents]);

  /* ── Lisans Dağılımı: bağımsız iki grafik için ayrı period state'leri ── */
  // Sol grafik: bu yılı (default 2026) yıllık olarak gösterir
  const [donut1Period, setDonut1Period] = useState<PeriodRangeValue>(() => ({
    year: String(now.getFullYear()),
    viewMode: "yillik",
    monthPeriodId: undefined,
    quarter: undefined
  }));
  // Sağ grafik: kullanıcının kıyaslamak için seçeceği dönem (default ay bazlı, önceki ay)
  const [donut2Period, setDonut2Period] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  });

  const donut1YearPeriods = useMemo(
    () => derivePeriodRangeSelectors(salesPeriods, donut1Period.year).yearPeriods,
    [salesPeriods, donut1Period.year]
  );
  const donut2YearPeriods = useMemo(
    () => derivePeriodRangeSelectors(salesPeriods, donut2Period.year).yearPeriods,
    [salesPeriods, donut2Period.year]
  );

  // Aylık modda monthPeriodId tutarlı kalsın diye normalize et (yıl/dönem değişince düşmesin)
  const donut1MonthlyPeriodId = donut1YearPeriods.some((p) => p.id === donut1Period.monthPeriodId)
    ? donut1Period.monthPeriodId
    : donut1YearPeriods[donut1YearPeriods.length - 1]?.id;
  const donut2MonthlyPeriodId = donut2YearPeriods.some((p) => p.id === donut2Period.monthPeriodId)
    ? donut2Period.monthPeriodId
    : donut2YearPeriods[donut2YearPeriods.length - 1]?.id;

  useEffect(() => {
    if (!donut1Period.monthPeriodId && donut1MonthlyPeriodId) {
      setDonut1Period((prev) => ({ ...prev, monthPeriodId: donut1MonthlyPeriodId }));
    }
  }, [donut1MonthlyPeriodId, donut1Period.monthPeriodId]);

  useEffect(() => {
    if (!donut2Period.monthPeriodId && donut2MonthlyPeriodId) {
      setDonut2Period((prev) => ({ ...prev, monthPeriodId: donut2MonthlyPeriodId }));
    }
  }, [donut2MonthlyPeriodId, donut2Period.monthPeriodId]);

  const donut1ActivePeriodIds = useMemo(
    () =>
      computeActivePeriodIds(donut1YearPeriods, {
        ...donut1Period,
        monthPeriodId: donut1MonthlyPeriodId
      }),
    [donut1Period, donut1MonthlyPeriodId, donut1YearPeriods]
  );
  const donut2ActivePeriodIds = useMemo(
    () =>
      computeActivePeriodIds(donut2YearPeriods, {
        ...donut2Period,
        monthPeriodId: donut2MonthlyPeriodId
      }),
    [donut2Period, donut2MonthlyPeriodId, donut2YearPeriods]
  );

  const donut1KpiQuery = useQuery({
    enabled: donut1ActivePeriodIds.length > 0,
    queryKey: ["sales-dashboard-donut1", auth.token, donut1ActivePeriodIds.join(",")],
    queryFn: async () => {
      if (donut1ActivePeriodIds.length === 1) {
        return api.getSalesKpiData(auth.token, donut1ActivePeriodIds[0]!);
      }
      const results = await Promise.all(
        donut1ActivePeriodIds.map((pid) => api.getSalesKpiData(auth.token, pid))
      );
      return aggregateMultiPeriodKpi(results);
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const donut2KpiQuery = useQuery({
    enabled: donut2ActivePeriodIds.length > 0,
    queryKey: ["sales-dashboard-donut2", auth.token, donut2ActivePeriodIds.join(",")],
    queryFn: async () => {
      if (donut2ActivePeriodIds.length === 1) {
        return api.getSalesKpiData(auth.token, donut2ActivePeriodIds[0]!);
      }
      const results = await Promise.all(
        donut2ActivePeriodIds.map((pid) => api.getSalesKpiData(auth.token, pid))
      );
      return aggregateMultiPeriodKpi(results);
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const donut1Data = useMemo(() => {
    const data = donut1KpiQuery.data;
    const ls = data && "licenseSummary" in data ? (data as any).licenseSummary as LicenseSummary | undefined : undefined;
    const ag = data && "agents" in data ? (data as any).agents as SalesKpiAgent[] : [];
    return computeLicenseDonut(ls, ag, salesInk);
  }, [donut1KpiQuery.data, salesInk]);
  const donut2Data = useMemo(() => {
    const data = donut2KpiQuery.data;
    const ls = data && "licenseSummary" in data ? (data as any).licenseSummary as LicenseSummary | undefined : undefined;
    const ag = data && "agents" in data ? (data as any).agents as SalesKpiAgent[] : [];
    return computeLicenseDonut(ls, ag, salesInk);
  }, [donut2KpiQuery.data, salesInk]);

  const donut1Total = donut1Data.reduce((s, d) => s + d.value, 0);
  const donut2Total = donut2Data.reduce((s, d) => s + d.value, 0);

  const donut1PeriodLabel = useMemo(
    () => describeDonutPeriod({ ...donut1Period, monthPeriodId: donut1MonthlyPeriodId }, donut1YearPeriods),
    [donut1Period, donut1MonthlyPeriodId, donut1YearPeriods]
  );
  const donut2PeriodLabel = useMemo(
    () => describeDonutPeriod({ ...donut2Period, monthPeriodId: donut2MonthlyPeriodId }, donut2YearPeriods),
    [donut2Period, donut2MonthlyPeriodId, donut2YearPeriods]
  );

  /* ── Hedef yuzdeleri ── */
  const targetPercent = useMemo(() => {
    if (!targets || summary.totalSalesAmount === 0 || targets.salesAmount === 0) return 0;
    return (summary.totalSalesAmount / targets.salesAmount) * 100;
  }, [summary.totalSalesAmount, targets]);

  /* ── Durum kontrol ── */
  const isLoading = periodsQuery.isPending || kpiQuery.isPending;
  const hasData = agents.length > 0;

  /* ── Aktif gorunum etiketi ── */
  const viewLabel = useMemo(() => {
    if (viewMode === "aylik") {
      const p = yearPeriods.find((p) => p.id === monthlyPeriodId);
      return p ? formatPeriodMonth(p.month) : "";
    }
    if (viewMode === "ceyreklik") return `${selectedYear} ${QUARTER_SHORT[selectedQuarter - 1]}`;
    return selectedYear;
  }, [viewMode, yearPeriods, monthlyPeriodId, selectedYear, selectedQuarter]);

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title="Satış Genel Bakış"
        subtitle={viewLabel}
        actions={
          <PeriodRangeFilter
            onChange={setPeriodRange}
            periods={salesPeriods}
            value={{ ...periodRange, monthPeriodId: monthlyPeriodId }}
          />
        }
      />

      {isLoading ? (
        <SurfaceCard title="Yükleniyor..." variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">Veriler yükleniyor...</p>
        </SurfaceCard>
      ) : !hasData ? (
        <SurfaceCard title="Henüz veri yok" variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Seçilen dönem için satış verisi bulunamadı. Yönetim panelinden KPI verisi yükleyerek başlayabilirsiniz.
          </p>
        </SurfaceCard>
      ) : (
        <>
          {/* ── Bolum H: Hedef Ilerleme Paneli ── */}
          {targets ? (
            <SurfaceCard variant="dark">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-white/60">Ekip Hedef İlerleme</p>
                  <p className="mt-1 font-display text-3xl font-bold tracking-tight text-white">
                    {formatCurrency(summary.totalSalesAmount)}
                  </p>
                  <p className="mt-1 text-sm text-white/60">Hedef: {formatCurrency(targets.salesAmount)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={[
                      "font-display text-4xl font-bold tracking-tight",
                      targetPercent >= 100 ? "text-emerald-400" : targetPercent >= 70 ? "text-amber-400" : "text-rose-400"
                    ].join(" ")}>
                      %{formatNumber(targetPercent, 1)}
                    </p>
                    <p className="text-xs text-white/50">hedefe ulaşma</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={[
                    "h-full rounded-full transition-all duration-700",
                    targetPercent >= 100 ? "bg-emerald-400" : targetPercent >= 70 ? "bg-amber-400" : "bg-rose-400"
                  ].join(" ")}
                  style={{ width: `${Math.min(targetPercent, 100)}%` }}
                />
              </div>
            </SurfaceCard>
          ) : null}

          {/* ── Bolum A: Ozet Kartlari ── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <StatCard
              icon={<Target size={18} />}
              label="Toplam Satış Tutarı"
              value={formatCurrency(summary.totalSalesAmount)}
              tone={targets ? (targetPercent >= 100 ? "green" : targetPercent >= 70 ? "yellow" : "red") : "neutral"}
              hint={targets ? `Hedef: ${formatCurrency(targets.salesAmount)}` : undefined}
              badge={targets ? `%${formatNumber(targetPercent, 0)}` : undefined}
              badgeTone={targets ? (targetPercent >= 100 ? "green" : targetPercent >= 70 ? "yellow" : "red") : undefined}
            />
            <StatCard
              icon={<Award size={18} />}
              label="Toplam Lisans Adedi"
              value={formatNumber(summary.totalLicenseCount)}
              hint={targets ? `Kişi başı hedef: ${formatNumber(targets.licenseCount)}` : `${agents.length} temsilci`}
            />
            <StatCard
              icon={<TrendingUp size={18} />}
              label="Ort. Dönüşüm Oranı"
              value={`%${formatNumber(summary.avgConversionRate, 2)}`}
              tone={targets ? (summary.avgConversionRate >= targets.conversionRate ? "green" : "yellow") : "neutral"}
              hint={targets ? `Hedef: %${formatNumber(targets.conversionRate, 2)}` : undefined}
            />
          </div>

          {/* ── Bolum B: Sampiyon Spotlight ── */}
          <div className="grid gap-4 xl:grid-cols-2">
            {summary.topByAmount ? (
              <ChampionSpotlightCard
                kicker={viewMode === "ceyreklik" ? `Q${selectedQuarter} Yıldızı` : viewMode === "yillik" ? `${selectedYear} Yıldızı` : "Ayın Yıldızı"}
                title="En Çok Satış (Tutar)"
                name={summary.topByAmount.agentName}
                imageSrc={getRepresentativePhotoSrc(summary.topByAmount.agentName) ?? undefined}
                score={formatCurrency(summary.topByAmount.salesAmount)}
                metricLabel="Satış Tutarı"
                theme="ink"
                achievement={`${formatNumber(summary.topByAmount.licenseCount)} lisans satışı ile toplam satışın %${formatNumber((summary.topByAmount.salesAmount / summary.totalSalesAmount) * 100, 1)}'${summary.topByAmount.salesAmount / summary.totalSalesAmount >= 0.1 ? "i" : "u"}`}
                showPodium={false}
              />
            ) : null}
            {summary.topByLicense ? (
              <ChampionSpotlightCard
                kicker="Lisans Şampiyonu"
                title="En Çok Satış (Adet)"
                name={summary.topByLicense.agentName}
                imageSrc={getRepresentativePhotoSrc(summary.topByLicense.agentName) ?? undefined}
                score={formatNumber(summary.topByLicense.licenseCount)}
                metricLabel="Lisans Adedi"
                theme="violet"
                achievement={`${formatCurrency(summary.topByLicense.salesAmount)} tutarında satış gerçekleştirdi`}
                showPodium={false}
              />
            ) : null}
          </div>

          {/* ── Bolum C: Lisans Dagilimi (iki bagimsiz grafik, ayri filtreler) ── */}
          <div className="grid gap-4 xl:grid-cols-2">
            <LicenseDonutCard
              data={donut1Data}
              total={donut1Total}
              isLoading={donut1KpiQuery.isPending}
              periodLabel={donut1PeriodLabel}
              tooltipStyle={tooltipStyle}
              filter={
                <PeriodRangeFilter
                  onChange={setDonut1Period}
                  periods={salesPeriods}
                  value={{ ...donut1Period, monthPeriodId: donut1MonthlyPeriodId }}
                />
              }
            />
            <LicenseDonutCard
              data={donut2Data}
              total={donut2Total}
              isLoading={donut2KpiQuery.isPending}
              periodLabel={donut2PeriodLabel}
              tooltipStyle={tooltipStyle}
              compareTo={{ data: donut1Data, total: donut1Total, periodLabel: donut1PeriodLabel }}
              filter={
                <PeriodRangeFilter
                  onChange={setDonut2Period}
                  periods={salesPeriods}
                  value={{ ...donut2Period, monthPeriodId: donut2MonthlyPeriodId }}
                />
              }
            />
          </div>

          {/* ── Bolum D: Temsilci Bar Chart ── */}
          <div className="grid gap-4">
            <ExecutiveChartCard title="Temsilci Satış Karşılaştırması" description="Temsilci bazlı satış tutarları">
              <div className="overflow-x-auto">
                <div className="h-80" style={{ minWidth: Math.max(400, agents.length * 56) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...agents].sort((a, b) => b.salesAmount - a.salesAmount)} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridMutedStroke} vertical={false} />
                      <XAxis
                        dataKey="agentName"
                        tickFormatter={(v: string) => truncateName(v, 16)}
                        tick={{ fontSize: 12, fontWeight: 500, fill: axisMutedFill }}
                        tickLine={false}
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis tick={{ fontSize: 11, fill: axisMutedFill }} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                      <Tooltip
                        contentStyle={{ ...tooltipStyle, borderRadius: 10 }}
                        formatter={(value: number | undefined) => [formatCurrency(value ?? 0), "Satış Tutarı"]}
                      />
                      <Bar dataKey="salesAmount" radius={[6, 6, 0, 0]}>
                        {[...agents].sort((a, b) => b.salesAmount - a.salesAmount).map((agent) => (
                          <Cell
                            key={agent.agentKey}
                            fill={targets && agent.salesAmount >= targets.salesAmount ? brand.emerald : salesInk}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </ExecutiveChartCard>
          </div>

          {/* ── Bolum E: Yillik Trend ── */}
          <ExecutiveChartCard title="Yıllık Trend">
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Satis Tutari Trendi */}
              <div className="min-w-0 rounded-[10px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] dark:border-slate-600/40 dark:bg-slate-800 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">Satış Tutarı</h3>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400">
                    Aylık görünüm
                  </span>
                </div>
                {yearlyTrend.some((p) => p.salesAmount !== null) ? (
                  <div className="mt-4 h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={yearlyTrend} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: axisFill }} tickLine={false} tickFormatter={(v) => formatNumber(v)} width={65} />
                        <Tooltip
                          contentStyle={{ ...tooltipStyle }}
                          formatter={(value: number | undefined) => [formatCurrency(value ?? 0), "Satış Tutarı"]}
                          labelFormatter={(_, payload) => {
                            const point = payload?.[0]?.payload as typeof yearlyTrend[0] | undefined;
                            return point?.fullLabel ?? _;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="salesAmount"
                          stroke={salesInk}
                          strokeWidth={3}
                          strokeLinecap="round"
                          connectNulls={false}
                          activeDot={{ r: 6, stroke: isDark ? "#1e293b" : "#ffffff", strokeWidth: 2 }}
                          dot={(dotProps: any) => {
                            const payload = dotProps.payload;
                            if (dotProps.cx == null || dotProps.cy == null || payload.salesAmount === null) return <g key={dotProps.index} />;
                            const index = typeof dotProps.index === "number" ? dotProps.index : 0;
                            // Ilk noktada etiketi saga kaydir, son noktada sola
                            const anchor = index === 0 ? "start" : "middle";
                            return (
                              <g key={dotProps.index}>
                                <circle
                                  cx={dotProps.cx}
                                  cy={dotProps.cy}
                                  fill={payload.isCurrent ? salesInk : isDark ? "#1e293b" : "#ffffff"}
                                  r={payload.isCurrent ? 5 : 3.5}
                                  stroke={salesInk}
                                  strokeWidth={payload.isCurrent ? 3 : 2}
                                />
                                <text
                                  fill={salesInk}
                                  fontSize={10}
                                  fontWeight={700}
                                  paintOrder="stroke"
                                  stroke={labelStroke}
                                  strokeWidth={4}
                                  textAnchor={anchor}
                                  x={dotProps.cx}
                                  y={dotProps.cy - 14}
                                >
                                  {formatNumber(payload.salesAmount)}
                                </text>
                              </g>
                            );
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="mt-4 flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {yearlyTrendQuery.isPending ? "Yıllık satış verisi yükleniyor..." : "Bu yıl için satış verisi bulunamadı."}
                  </div>
                )}
              </div>

              {/* Lisans Adedi Trendi */}
              <div className="min-w-0 rounded-[10px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] dark:border-slate-600/40 dark:bg-slate-800 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">Lisans Adedi</h3>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400">
                    Aylık görünüm
                  </span>
                </div>
                {yearlyTrend.some((p) => p.licenseCount !== null) ? (
                  <div className="mt-4 h-72 min-w-0">
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <LineChart data={yearlyTrend} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisFill }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: axisFill }} tickLine={false} width={45} />
                        <Tooltip
                          contentStyle={{ ...tooltipStyle }}
                          formatter={(value: number | undefined) => [formatNumber(value ?? 0), "Lisans Adedi"]}
                          labelFormatter={(_, payload) => {
                            const point = payload?.[0]?.payload as typeof yearlyTrend[0] | undefined;
                            return point?.fullLabel ?? _;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="licenseCount"
                          stroke={brand.accent}
                          strokeWidth={3}
                          strokeLinecap="round"
                          connectNulls={false}
                          activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }}
                          dot={(dotProps: any) => {
                            const payload = dotProps.payload;
                            if (dotProps.cx == null || dotProps.cy == null || payload.licenseCount === null) return <g key={dotProps.index} />;
                            const index = typeof dotProps.index === "number" ? dotProps.index : 0;
                            const anchor = index === 0 ? "start" : "middle";
                            return (
                              <g key={dotProps.index}>
                                <circle
                                  cx={dotProps.cx}
                                  cy={dotProps.cy}
                                  fill={payload.isCurrent ? brand.accent : "#ffffff"}
                                  r={payload.isCurrent ? 5 : 3.5}
                                  stroke={brand.accent}
                                  strokeWidth={payload.isCurrent ? 3 : 2}
                                />
                                <text
                                  fill={brand.accent}
                                  fontSize={10}
                                  fontWeight={700}
                                  paintOrder="stroke"
                                  stroke={labelStroke}
                                  strokeWidth={4}
                                  textAnchor={anchor}
                                  x={dotProps.cx}
                                  y={dotProps.cy - 14}
                                >
                                  {formatNumber(payload.licenseCount)}
                                </text>
                              </g>
                            );
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="mt-4 flex h-72 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
                    {yearlyTrendQuery.isPending ? "Yıllık lisans verisi yükleniyor..." : "Bu yıl için lisans verisi bulunamadı."}
                  </div>
                )}
              </div>
            </div>
          </ExecutiveChartCard>

          {/* ── Bolum F: Lider Tablolari ── */}
          <div className="grid gap-6 xl:grid-cols-2">
            <Leaderboard
              title="Satış Lider Tablosu"
              items={[...agents]
                .sort((a, b) => b.salesAmount - a.salesAmount)
                .slice(0, 5)
                .map((agent) => ({
                  id: agent.agentKey,
                  label: agent.agentName,
                  imageSrc: getRepresentativePhotoSrc(agent.agentName) ?? undefined,
                  value: formatCurrency(agent.salesAmount),
                  subtitle: `${formatNumber(agent.licenseCount)} lisans`
                }))}
            />
            <Leaderboard
              title="Lisans Lider Tablosu"
              items={[...agents]
                .sort((a, b) => b.licenseCount - a.licenseCount)
                .slice(0, 5)
                .map((agent) => ({
                  id: agent.agentKey,
                  label: agent.agentName,
                  imageSrc: getRepresentativePhotoSrc(agent.agentName) ?? undefined,
                  value: formatNumber(agent.licenseCount),
                  subtitle: formatCurrency(agent.salesAmount)
                }))}
            />
          </div>

          {/* ── Bolum G: En Dusuk Performanslar ── */}
          {summary.bottom3.length > 0 ? (
            <ExecutiveChartCard title="Dikkat Gerektiren Performanslar" description="En düşük satış tutarına sahip temsilciler">
              <div className="grid gap-4 lg:grid-cols-3">
                {summary.bottom3.map((agent) => (
                  <InsightTile
                    key={agent.agentKey}
                    icon={<TrendingDown size={18} />}
                    imageSrc={getRepresentativePhotoSrc(agent.agentName) ?? undefined}
                    title="Düşük Performans"
                    value={agent.agentName}
                    description={`${formatCurrency(agent.salesAmount)} satış, ${formatNumber(agent.licenseCount)} lisans, %${formatNumber(agent.conversionRate, 2)} dönüşüm`}
                  />
                ))}
              </div>
            </ExecutiveChartCard>
          ) : null}

          {/* ── Bolum I: Arama Verimliligi ── */}
          {callEfficiency.length > 0 ? (
            <ExecutiveChartCard title="Arama Verimliliği" description="Arama başına satış tutarı (TRY/arama)">
              <div className="overflow-x-auto">
                <div style={{ height: Math.max(300, callEfficiency.length * 44), minWidth: 480 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={callEfficiency} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridMutedStroke} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: axisMutedFill }} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tickFormatter={(v: string) => truncateName(v, 16)}
                        tick={{ fontSize: 12, fontWeight: 500, fill: axisFill }}
                        tickLine={false}
                        width={120}
                      />
                    <Tooltip
                      contentStyle={{ ...tooltipStyle, borderRadius: 10 }}
                      formatter={((value: number, _: string, entry: any) => {
                        const item = entry.payload;
                        return [`${formatNumber(value)} TRY/arama (${formatCurrency(item.salesAmount)} / ${formatNumber(item.callAttempts)} arama)`, "Verimlilik"];
                      }) as any}
                    />
                    <Bar dataKey="efficiency" radius={[0, 6, 6, 0]}>
                      {callEfficiency.map((item, i) => (
                        <Cell key={item.name} fill={i === 0 ? brand.emerald : i < 3 ? salesInk : chart.barAlternate} />
                      ))}
                      <LabelList
                        dataKey="efficiency"
                        position="right"
                        formatter={(v: any) => `${formatNumber(Number(v))} TRY`}
                        style={{ fontSize: 11, fontWeight: 600, fill: isDark ? "rgba(255,255,255,0.8)" : chart.axis }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </ExecutiveChartCard>
          ) : null}

          {/* ── Bolum J: Scale vs Scale+ ── */}
          {scaleComparison.some((a) => a.scale > 0 || a.scalePlus > 0) ? (
            <ExecutiveChartCard title="Scale vs Scale+ Dağılımı" description="Temsilci bazlı ürün dağılımı">
              <div className="overflow-x-auto">
                <div className="h-80" style={{ minWidth: Math.max(400, scaleComparison.length * 56) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scaleComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridMutedStroke} vertical={false} />
                      <XAxis
                        dataKey="name"
                        tickFormatter={(v: string) => truncateName(v, 16)}
                        tick={{ fontSize: 12, fontWeight: 500, fill: axisMutedFill }}
                        tickLine={false}
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis tick={{ fontSize: 11, fill: axisMutedFill }} tickLine={false} />
                      <Tooltip
                        contentStyle={{ ...tooltipStyle, borderRadius: 10 }}
                        formatter={((value: number, name: string) => [formatNumber(value), name === "scale" ? "Scale" : "Scale Plus"]) as any}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value: string) => (value === "scale" ? "Scale" : "Scale Plus")}
                      />
                      <Bar dataKey="scale" stackId="a" fill={salesInk} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="scalePlus" stackId="a" fill={brand.accent} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </ExecutiveChartCard>
          ) : null}
        </>
      )}
    </div>
  );
}

function deltaToneClass(direction: DeltaInfo["direction"], fromZero: boolean): string {
  if (fromZero) return "text-emerald-600 dark:text-emerald-400";
  if (direction === "up") return "text-emerald-600 dark:text-emerald-400";
  if (direction === "down") return "text-rose-600 dark:text-rose-400";
  return "text-slate-500 dark:text-slate-400";
}

/* ── Lisans Dağılımı kartı: filtre + donut chart ── */
function LicenseDonutCard(props: {
  data: DonutSlice[];
  total: number;
  isLoading: boolean;
  periodLabel: string;
  tooltipStyle: Record<string, unknown>;
  filter: ReactNode;
  /** Sağ donut için baz dönem; verilirse her segmentin ve toplamın delta'sı gösterilir. */
  compareTo?: { data: DonutSlice[]; total: number; periodLabel: string } | undefined;
}) {
  const { data, total, isLoading, periodLabel, tooltipStyle, filter, compareTo } = props;

  const description = total > 0 ? `${periodLabel} • Toplam: ${formatNumber(total)} lisans` : periodLabel;

  // Baz dönemdeki segment kayıtlarını segment adına göre indeksle (delta için)
  const baseSliceByName = compareTo
    ? new Map(compareTo.data.map((d) => [d.name, d]))
    : null;

  return (
    <ExecutiveChartCard title="Lisans Dağılımı" description={description} actions={filter}>
      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400">
          {isLoading ? "Yükleniyor..." : "Bu dönem için lisans verisi bulunamadı."}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-64 w-64 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={100}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ ...tooltipStyle, borderRadius: 10 }}
                  formatter={((value: number, name: string) => [`${formatNumber(value)} adet (%${formatNumber((value / total) * 100, 1)})`, name]) as any}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid gap-2">
            {data.map((item) => {
              const baseSlice = baseSliceByName?.get(item.name);
              const delta = baseSliceByName ? computeDelta(item.value, baseSlice?.value ?? 0) : null;
              const baseSubByName = baseSlice?.subItems
                ? new Map(baseSlice.subItems.map((s) => [s.name, s.value]))
                : null;
              return (
                <div key={item.name} className="grid gap-1">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{item.name}</span>
                    <span className="ml-auto text-sm font-semibold text-slate-900 dark:text-slate-100">{formatNumber(item.value)}</span>
                    {delta ? (
                      <span className={`min-w-[70px] text-right text-xs font-semibold tabular-nums ${deltaToneClass(delta.direction, delta.fromZero)}`}>
                        {formatDelta(delta)}
                      </span>
                    ) : null}
                  </div>
                  {item.subItems?.map((sub) => {
                    const subDelta = baseSliceByName
                      ? computeDelta(sub.value, baseSubByName?.get(sub.name) ?? 0)
                      : null;
                    return (
                      <div key={sub.name} className="ml-5 flex items-center gap-2.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">└ {sub.name}</span>
                        <span className="ml-auto text-xs font-medium text-slate-700 dark:text-slate-300">{formatNumber(sub.value)}</span>
                        {subDelta ? (
                          <span className={`min-w-[70px] text-right text-xs font-semibold tabular-nums ${deltaToneClass(subDelta.direction, subDelta.fromZero)}`}>
                            {formatDelta(subDelta)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ExecutiveChartCard>
  );
}
