import { SurfaceCard } from "@kalitedb/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Info, Minus, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { FancySelect } from "../components/fancy-select";
import { formatNumber, formatPercent, formatPeriodMonth, parseTalkDurationLabelToSeconds } from "../lib/format";
import {
  ADVISOR_LOOKBACK_MONTHS,
  KPI_METRIC_CONFIGS,
  buildPerRepMonthlySamples,
  computeFunnelRatios,
  computeKpiAdvice,
  deriveCoupledTargets,
  type KpiAdvice,
  type KpiMetricKey,
  type KpiMetricKind,
  type Verdict
} from "../lib/kpi-target-advisor";
import { useActiveRepresentativeKeys } from "../lib/use-active-representatives";

/* ── Formatters ── */

function formatCompactTry(value: number): string {
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)}M TRY`;
  if (value >= 1_000) return `${formatNumber(value / 1_000, 1)}K TRY`;
  return `${formatNumber(value, 0)} TRY`;
}

function formatCompactHours(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 10) return `${formatNumber(hours, 0)} sa`;
  return `${formatNumber(hours, 1)} sa`;
}

function formatByKind(value: number | null | undefined, kind: KpiMetricKind): string {
  if (value == null || !Number.isFinite(value)) return "-";
  switch (kind) {
    case "currency":
      return formatCompactTry(value);
    case "count":
      return formatNumber(value, value >= 10 ? 0 : 1);
    case "rate":
      return formatPercent(value, 1);
    case "seconds":
      return formatCompactHours(value);
    case "score":
      return formatNumber(value, 1);
  }
}

function toInputString(value: number | null | undefined, kind: KpiMetricKind): string {
  if (value == null || !Number.isFinite(value)) return "";
  switch (kind) {
    case "currency":
    case "count":
      return String(Math.round(value));
    case "rate":
    case "score":
      return String(Number(value.toFixed(2)));
    case "seconds":
      return String(Number((value / 3600).toFixed(2)));
  }
}

function parseInputToBase(raw: string, kind: KpiMetricKind): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  if (kind === "seconds") return n * 3600;
  return n;
}

function inputUnit(kind: KpiMetricKind): string {
  switch (kind) {
    case "currency":
      return "TRY";
    case "rate":
      return "%";
    case "seconds":
      return "saat";
    case "score":
    case "count":
      return "";
  }
}

/* ── Verdict styles ── */

const VERDICT_STYLES: Record<Verdict, { badge: string; label: string }> = {
  dusuk: {
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-300",
    label: "ARTIRILABİLİR"
  },
  uygun: {
    badge:
      "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
    label: "UYGUN"
  },
  yuksek: {
    badge:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300",
    label: "DÜŞÜRÜLEBİLİR"
  },
  zorlayici: {
    badge:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-300",
    label: "ZORLAYICI"
  },
  belirsiz: {
    badge:
      "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500",
    label: "BELİRSİZ"
  }
};

const COUPLED_METRICS: ReadonlySet<KpiMetricKey> = new Set<KpiMetricKey>([
  "licenseCount",
  "callAttempts",
  "talkDurationSeconds"
]);

type DraftState = Record<KpiMetricKey, string>;
type ModeState = Record<KpiMetricKey, "auto" | "manual">;

const INITIAL_MODES: ModeState = {
  salesAmount: "auto",
  licenseCount: "auto",
  conversionRate: "auto",
  callAttempts: "auto",
  talkDurationSeconds: "auto",
  perfScore: "auto"
};

/* ── Page ── */

export function SalesTargetCalibrationPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();

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

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!selectedPeriodId && salesPeriods.length > 0) {
      setSelectedPeriodId(salesPeriods[salesPeriods.length - 1]!.id);
    }
  }, [salesPeriods, selectedPeriodId]);

  const selectedPeriod = salesPeriods.find((p) => p.id === selectedPeriodId);

  const advisorPeriodIds = useMemo(() => {
    if (!selectedPeriod) return [];
    const cutoff = selectedPeriod.month;
    return salesPeriods
      .filter((p) => p.month < cutoff)
      .slice(-ADVISOR_LOOKBACK_MONTHS)
      .map((p) => p.id);
  }, [salesPeriods, selectedPeriod]);

  const advisorRawQuery = useQuery({
    enabled: advisorPeriodIds.length > 0,
    queryKey: ["sales-kpi-advisor-raw", auth.token, advisorPeriodIds.join(",")],
    queryFn: () =>
      Promise.all(
        advisorPeriodIds.map((pid) =>
          api.getSalesKpiData(auth.token, pid).then((data) => ({ periodId: pid, data }))
        )
      ),
    staleTime: 5 * 60 * 1000
  });

  const currentKpiQuery = useQuery({
    enabled: Boolean(selectedPeriodId),
    queryKey: ["sales-kpi", auth.token, selectedPeriodId],
    queryFn: () => api.getSalesKpiData(auth.token, selectedPeriodId!),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000
  });

  const repsQuery = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 10 * 60 * 1000
  });

  const { activeKeys } = useActiveRepresentativeKeys();

  const activeSalesKeys = useMemo(() => {
    const set = new Set<string>();
    for (const rep of repsQuery.data ?? []) {
      if (!(rep.badges ?? []).includes("satis")) continue;
      if (activeKeys && !activeKeys.has(rep.key)) continue;
      set.add(rep.key);
    }
    return set;
  }, [repsQuery.data, activeKeys]);

  const repCount = activeSalesKeys.size;

  const samples = useMemo(() => {
    return buildPerRepMonthlySamples(advisorRawQuery.data ?? [], activeSalesKeys);
  }, [advisorRawQuery.data, activeSalesKeys]);

  const currentTargets = currentKpiQuery.data?.targets ?? null;

  const perRepCurrentTargets: Record<KpiMetricKey, number | null> = useMemo(() => {
    if (!currentTargets) {
      return {
        salesAmount: null,
        licenseCount: null,
        conversionRate: null,
        callAttempts: null,
        talkDurationSeconds: null,
        perfScore: null
      };
    }
    const perRepSales =
      currentTargets.perPersonSalesTarget != null && currentTargets.perPersonSalesTarget > 0
        ? currentTargets.perPersonSalesTarget
        : repCount > 0 && currentTargets.salesAmount > 0
          ? currentTargets.salesAmount / repCount
          : null;
    const talkSeconds =
      currentTargets.talkDurationTargetSeconds ??
      parseTalkDurationLabelToSeconds(currentTargets.talkDurationLabel);
    return {
      salesAmount: perRepSales,
      licenseCount: currentTargets.licenseCount > 0 ? currentTargets.licenseCount : null,
      conversionRate: currentTargets.conversionRate > 0 ? currentTargets.conversionRate : null,
      callAttempts: currentTargets.callAttempts > 0 ? currentTargets.callAttempts : null,
      talkDurationSeconds: talkSeconds > 0 ? talkSeconds : null,
      perfScore: currentTargets.perfScore > 0 ? currentTargets.perfScore : null
    };
  }, [currentTargets, repCount]);

  const advices: KpiAdvice[] = useMemo(
    () => computeKpiAdvice(samples, currentTargets, repCount),
    [samples, currentTargets, repCount]
  );

  const funnelRatios = useMemo(() => computeFunnelRatios(samples), [samples]);

  const [draft, setDraft] = useState<DraftState>({
    salesAmount: "",
    licenseCount: "",
    conversionRate: "",
    callAttempts: "",
    talkDurationSeconds: "",
    perfScore: ""
  });
  const [modes, setModes] = useState<ModeState>(INITIAL_MODES);
  const [statusMessage, setStatusMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setDraft({
      salesAmount: toInputString(perRepCurrentTargets.salesAmount, "currency"),
      licenseCount: toInputString(perRepCurrentTargets.licenseCount, "count"),
      conversionRate: toInputString(perRepCurrentTargets.conversionRate, "rate"),
      callAttempts: toInputString(perRepCurrentTargets.callAttempts, "count"),
      talkDurationSeconds: toInputString(perRepCurrentTargets.talkDurationSeconds, "seconds"),
      perfScore: toInputString(perRepCurrentTargets.perfScore, "score")
    });
    setModes(INITIAL_MODES);
    setStatusMessage(null);
  }, [selectedPeriodId, perRepCurrentTargets.salesAmount, perRepCurrentTargets.licenseCount, perRepCurrentTargets.conversionRate, perRepCurrentTargets.callAttempts, perRepCurrentTargets.talkDurationSeconds, perRepCurrentTargets.perfScore]);

  const handleMetricInput = (metric: KpiMetricKey, raw: string) => {
    setStatusMessage(null);
    setDraft((prev) => ({ ...prev, [metric]: raw }));
    setModes((prev) => ({ ...prev, [metric]: "manual" }));

    if (metric === "salesAmount") {
      const config = KPI_METRIC_CONFIGS.find((c) => c.key === "salesAmount")!;
      const parsed = parseInputToBase(raw, config.kind);
      if (parsed == null || parsed <= 0) return;
      const coupled = deriveCoupledTargets(parsed, funnelRatios);
      setDraft((prev) => {
        const next = { ...prev };
        if (modes.licenseCount === "auto" && coupled.perRepLicense != null) {
          next.licenseCount = toInputString(coupled.perRepLicense, "count");
        }
        if (modes.callAttempts === "auto" && coupled.perRepCalls != null) {
          next.callAttempts = toInputString(coupled.perRepCalls, "count");
        }
        if (modes.talkDurationSeconds === "auto" && coupled.perRepTalkSeconds != null) {
          next.talkDurationSeconds = toInputString(coupled.perRepTalkSeconds, "seconds");
        }
        return next;
      });
    }
  };

  const handleResetMetric = (metric: KpiMetricKey) => {
    setStatusMessage(null);
    const config = KPI_METRIC_CONFIGS.find((c) => c.key === metric)!;
    setModes((prev) => ({ ...prev, [metric]: "auto" }));

    if (metric === "salesAmount") {
      setDraft((prev) => ({
        ...prev,
        salesAmount: toInputString(perRepCurrentTargets.salesAmount, "currency")
      }));
      return;
    }

    if (COUPLED_METRICS.has(metric)) {
      const salesBase = parseInputToBase(draft.salesAmount, "currency");
      if (salesBase != null && salesBase > 0) {
        const coupled = deriveCoupledTargets(salesBase, funnelRatios);
        if (metric === "licenseCount" && coupled.perRepLicense != null) {
          setDraft((prev) => ({ ...prev, licenseCount: toInputString(coupled.perRepLicense, "count") }));
          return;
        }
        if (metric === "callAttempts" && coupled.perRepCalls != null) {
          setDraft((prev) => ({ ...prev, callAttempts: toInputString(coupled.perRepCalls, "count") }));
          return;
        }
        if (metric === "talkDurationSeconds" && coupled.perRepTalkSeconds != null) {
          setDraft((prev) => ({
            ...prev,
            talkDurationSeconds: toInputString(coupled.perRepTalkSeconds, "seconds")
          }));
          return;
        }
      }
    }

    setDraft((prev) => ({ ...prev, [metric]: toInputString(perRepCurrentTargets[metric], config.kind) }));
  };

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.updateKpiTargets(auth.token, selectedPeriodId!, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales-kpi"] });
      void queryClient.invalidateQueries({ queryKey: ["sales-kpi-advisor-raw"] });
      setStatusMessage({ tone: "success", text: "Hedefler kaydedildi." });
    },
    onError: (err) => {
      setStatusMessage({ tone: "error", text: err instanceof Error ? err.message : "Kaydetme başarısız." });
    }
  });

  const handleSave = () => {
    if (!selectedPeriodId || !currentTargets) return;

    const perRepSales = parseInputToBase(draft.salesAmount, "currency");
    const perRepLicense = parseInputToBase(draft.licenseCount, "count");
    const perRepCalls = parseInputToBase(draft.callAttempts, "count");
    const perRepTalkSeconds = parseInputToBase(draft.talkDurationSeconds, "seconds");
    const conversionRate = parseInputToBase(draft.conversionRate, "rate");
    const perfScore = parseInputToBase(draft.perfScore, "score");

    if (perRepSales == null || perRepSales <= 0 || repCount <= 0) {
      setStatusMessage({
        tone: "error",
        text: "Satış hedefi ve aktif temsilci sayısı sıfırdan büyük olmalı."
      });
      return;
    }

    const talkSecondsSafe = perRepTalkSeconds != null && perRepTalkSeconds > 0 ? Math.round(perRepTalkSeconds) : currentTargets.talkDurationTargetSeconds ?? 0;
    const talkHoursDisplay = talkSecondsSafe > 0 ? Math.round(talkSecondsSafe / 3600) : 0;

    const payload: Record<string, unknown> = {
      perfScore: perfScore ?? currentTargets.perfScore,
      salesAmount: Math.round(perRepSales * repCount),
      perPersonSalesTarget: Math.round(perRepSales),
      licenseCount: perRepLicense != null && perRepLicense > 0 ? perRepLicense : currentTargets.licenseCount,
      avgLicensePrice: currentTargets.avgLicensePrice,
      callAttempts: perRepCalls != null && perRepCalls > 0 ? perRepCalls : currentTargets.callAttempts,
      conversionRate: conversionRate ?? currentTargets.conversionRate,
      talkDurationLabel: talkHoursDisplay > 0 ? `${talkHoursDisplay}'` : currentTargets.talkDurationLabel,
      talkDurationTargetSeconds: talkSecondsSafe > 0 ? talkSecondsSafe : currentTargets.talkDurationTargetSeconds
    };

    saveMutation.mutate(payload);
  };

  const loading = periodsQuery.isPending || (Boolean(selectedPeriodId) && currentKpiQuery.isPending);

  return (
    <div className="space-y-6">
      <SurfaceCard
        title="Hedef Kalibrasyonu"
        description="Son 3 ayın gerçekleşmesine göre per-rep hedef önerileri. Satış hedefi değiştirildiğinde lisans / arama / konuşma huniye göre otomatik güncellenir."
        actions={
          <Link
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            to="/sales/kpi"
          >
            <ArrowLeft size={14} />
            KPI sayfasına dön
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400" htmlFor="period-select">
            Hedefi düzenlenecek dönem
          </label>
          <FancySelect
            ariaLabel="Hedefi düzenlenecek dönem"
            onChange={(v) => setSelectedPeriodId(v)}
            options={salesPeriods.map((p) => ({
              value: p.id,
              label: `${formatPeriodMonth(p.month, { includeYear: true })}${p.title ? ` — ${p.title}` : ""}`
            }))}
            panelWidthClass="w-64"
            placeholder="Dönem seçin"
            value={selectedPeriodId ?? ""}
          />
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            {repCount} aktif satış temsilcisi · {samples.length} agent-ay örneklem (son {advisorPeriodIds.length} ay)
          </span>
        </div>
      </SurfaceCard>

      <MethodologyExplainer />

      {loading ? (
        <div className="rounded-[10px] border border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
          Yükleniyor…
        </div>
      ) : !currentTargets ? (
        <div className="rounded-[10px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300">
          Bu döneme ait KPI verisi yok. Hedefleri düzenlemek için önce dönemin KPI'ı oluşturulmalı (Satış → Admin).
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {advices.map((advice) => (
              <MetricCard
                advice={advice}
                current={perRepCurrentTargets[advice.metric]}
                draftValue={draft[advice.metric]}
                key={advice.metric}
                mode={modes[advice.metric]}
                onInput={(raw) => handleMetricInput(advice.metric, raw)}
                onReset={() => handleResetMetric(advice.metric)}
              />
            ))}
          </div>

          <FunnelInfo ratios={funnelRatios} />

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {statusMessage ? (
                <span className={statusMessage.tone === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {statusMessage.text}
                </span>
              ) : (
                <span>
                  Kaydet tuşu <code className="rounded bg-slate-100 px-1 text-[11px] dark:bg-slate-700">{selectedPeriod ? formatPeriodMonth(selectedPeriod.month, { includeYear: true }) : ""}</code> dönemine yazar. Satış hedefi takım toplamına otomatik çevrilir (× {repCount} temsilci).
                </span>
              )}
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-[10px] bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
              disabled={saveMutation.isPending}
              onClick={handleSave}
              type="button"
            >
              <Save size={14} />
              {saveMutation.isPending ? "Kaydediliyor…" : "Hedefleri Kaydet"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Metric card ── */

function MetricCard(props: {
  advice: KpiAdvice;
  current: number | null;
  draftValue: string;
  mode: "auto" | "manual";
  onInput: (raw: string) => void;
  onReset: () => void;
}) {
  const { advice, current, draftValue, mode, onInput, onReset } = props;
  const verdict = VERDICT_STYLES[advice.verdict];
  const config = KPI_METRIC_CONFIGS.find((c) => c.key === advice.metric)!;

  const draftValueNumber = parseInputToBase(draftValue, config.kind);
  const deltaPct =
    current != null && current > 0 && draftValueNumber != null
      ? ((draftValueNumber - current) / current) * 100
      : null;

  return (
    <div className="flex h-full flex-col gap-2.5 rounded-[10px] border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-slate-600/40 dark:bg-slate-800/50">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {config.label}
        </p>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${verdict.badge}`}
          title="Dağılım + mevcut hedef karşılaştırması"
        >
          <DirectionIcon direction={advice.direction} />
          {verdict.label}
        </span>
      </div>

      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <p>
          Mevcut:{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {formatByKind(current, config.kind)}
          </span>
        </p>
        <p>
          Öneri:{" "}
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
            {formatByKind(advice.recommendedLow, config.kind)} – {formatByKind(advice.recommendedHigh, config.kind)}
          </span>
        </p>
      </div>

      <Band
        current={current}
        p50={advice.p50}
        p75={advice.p75}
        p95={advice.p95}
      />

      <div className="flex items-center gap-1.5">
        <input
          className="w-full rounded-[8px] border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100"
          onChange={(e) => onInput(e.target.value)}
          value={draftValue}
          inputMode="decimal"
        />
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{inputUnit(config.kind)}</span>
        <button
          className="rounded-[8px] border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
          onClick={onReset}
          title={mode === "manual" ? "Otomatik moda dön" : "Mevcut değere sıfırla"}
          type="button"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            mode === "manual"
              ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700/50 dark:bg-sky-900/30 dark:text-sky-300"
              : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500"
          }`}
        >
          {mode === "manual" ? "MANUEL" : "OTOMATİK"}
        </span>
        {deltaPct != null && Math.abs(deltaPct) >= 0.5 ? (
          <span
            className={`font-semibold ${
              deltaPct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {deltaPct > 0 ? "+" : ""}
            {formatNumber(deltaPct, 0)}% mevcuttan
          </span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">{advice.sampleSize} örneklem</span>
        )}
      </div>
    </div>
  );
}

function DirectionIcon(props: { direction: KpiAdvice["direction"] }) {
  if (props.direction === "up") return <ArrowUp size={12} className="text-emerald-600 dark:text-emerald-400" />;
  if (props.direction === "down") return <ArrowDown size={12} className="text-amber-600 dark:text-amber-400" />;
  return <Minus size={12} className="text-slate-400 dark:text-slate-500" />;
}

function Band(props: { current: number | null; p50: number | null; p75: number | null; p95: number | null }) {
  const { current, p50, p75, p95 } = props;
  if (p50 == null || p75 == null) {
    return <div className="h-5 rounded-md bg-slate-100 dark:bg-slate-800/60" />;
  }
  const scaleMax = Math.max(p95 ?? p75, p75, current ?? 0) * 1.1 || 1;
  const pctOf = (v: number) => Math.max(0, Math.min(100, (v / scaleMax) * 100));
  const bandLeft = pctOf(p50);
  const bandRight = pctOf(p75);
  const bandWidth = Math.max(2, bandRight - bandLeft);
  const currentPct = current != null && current > 0 ? pctOf(current) : null;
  return (
    <div className="relative h-5 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800/60">
      <div
        className="absolute top-0 h-full bg-emerald-300/70 dark:bg-emerald-500/40"
        style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
      />
      {currentPct != null ? (
        <div
          className="absolute top-0 h-full w-[2px] bg-slate-900 dark:bg-slate-100"
          style={{ left: `calc(${currentPct}% - 1px)` }}
        />
      ) : null}
    </div>
  );
}

function MethodologyExplainer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[10px] border border-slate-200 bg-white/70 dark:border-slate-700 dark:bg-slate-800/40">
      <button
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Info size={14} className="text-emerald-600 dark:text-emerald-400" />
        <span>Hesaplama nasıl çalışıyor?</span>
        <span className="ml-auto text-[11px] font-normal text-slate-500 dark:text-slate-400">
          {open ? "Kapat" : "Aç — kullanılan yöntem ve formüller"}
        </span>
      </button>

      {open ? (
        <div className="space-y-5 border-t border-slate-200 px-6 py-5 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:text-slate-300">
          <section>
            <h3 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              1 · Veri kaynağı
            </h3>
            <p>
              Seçili dönemden <strong>önceki 3 tamamlanmış ayın</strong> satış KPI verisi okunur. Sadece
              <strong> "satış" etiketli aktif temsilcilerin</strong> gerçekleşmeleri kullanılır — CS/Kalite/Partner
              ekipleri dahil değildir.
            </p>
          </section>

          <section>
            <h3 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              2 · Dağılımın çıkarılması
            </h3>
            <p>
              Her metrik için <strong>temsilci × ay</strong> örneklemi toplanır (örn. 5 temsilci × 3 ay = 15
              örneklem). Bu örneklerden üç referans noktası hesaplanır:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
              <li>
                <strong>P50 (medyan)</strong> — tipik bir ay performansı. Ortalama değil medyan kullanılır;
                tek bir süperstar ayın dağılımı yukarı çekmesini engeller.
              </li>
              <li>
                <strong>P75</strong> — üst çeyreğin tabanı. Takımın %25'inin sürekli üstünde kaldığı seviye.
              </li>
              <li>
                <strong>P95</strong> — uç değerlerin yakın sınırı. Öneri tavanına güvenlik kapısı.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              3 · Önerilen aralık
            </h3>
            <p>
              Alt sınır <strong>P50</strong>, üst sınır <strong>P75 × 1.10</strong> (P75'in %10 üzerine streç),
              ancak P95'i asla aşmaz. Böylece "medyan tabanlı + gerçekçi streç" prensibi sağlanır. Kartlarda
              yeşil bant bu aralığı, siyah dikey çizgi ise mevcut hedefin konumunu gösterir.
            </p>
          </section>

          <section>
            <h3 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              4 · Verdict (rozet) mantığı
            </h3>
            <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
              <li>
                <strong>ARTIRILABİLİR</strong> — mevcut hedef, P50'nin %5 altında. Takım hedefi rutin olarak
                aşıyor; gevşek kalmış, yükseltilebilir.
              </li>
              <li>
                <strong>UYGUN</strong> — mevcut hedef, P50 ile P75 × 1.15 bandı içinde. İyi kalibre edilmiş.
              </li>
              <li>
                <strong>DÜŞÜRÜLEBİLİR</strong> — mevcut hedef P75'in %15 üzerinde ama ekip buna ulaşabiliyor.
                Hâlâ gerçekçi, ancak takım tipik olarak daha düşük kalıyor.
              </li>
              <li>
                <strong>ZORLAYICI</strong> — son 3 ayda <em>kimse</em> hedefi geçememiş. Erişilemez; revize
                edilmesi önerilir.
              </li>
              <li>
                <strong>BELİRSİZ</strong> — örneklem 6'dan az veya aktif temsilci sayısı 2'den az. Dağılım
                güvenilir değil; karar vermek için veri yetersiz.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              5 · Satış → diğer metrikler (huni)
            </h3>
            <p>
              Satış tutarı hedefi değiştirildiğinde <strong>lisans, arama, konuşma</strong> hedefleri son 3 ayın
              <strong> medyan huni oranlarıyla</strong> otomatik türetilir. Örneğin takımın son 3 ay medyanı
              "1M TRY satış ≈ 12 lisans" ise, satış 1.4M'den 1.6M'e çıktığında lisans hedefi 14'ten ≈ 19'a çekilir.
              Bir metriği elle düzenlersen o kart <strong>MANUEL</strong> olur ve satışa bağlı olmayı bırakır;
              reset tuşuyla otomatiğe döner.
            </p>
            <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
              Not: dönüşüm oranı ve performans skoru <em>oran</em> metriğidir — satış hacmine bağlı değildir,
              bağımsız kalır.
            </p>
          </section>

          <section>
            <h3 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              6 · Medyan gerçekleşme
            </h3>
            <p>
              Her temsilci-ay için <code className="rounded bg-slate-100 px-1 text-[12px] dark:bg-slate-700">gerçekleşen ÷ mevcut hedef</code>{" "}
              oranı alınır, örneklem medyanı hesaplanır. %100 = hedef tam karşılanıyor, %120 = hedef ortalama
              %20 aşılıyor. Hedefin ne kadar gerçekçi olduğunu tek sayıda özetler.
            </p>
          </section>

          <section>
            <h3 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              7 · Kaydetme
            </h3>
            <p>
              <strong>Hedefleri Kaydet</strong> butonu yalnız seçili dönemin targets objesini günceller.
              Per-rep satış hedefi takım toplamına çevrilir (× aktif satış temsilcisi sayısı). Bir sonraki
              KPI gerçekleşmesi bu yeni hedeflere göre değerlendirilecek — geçmiş dönemler etkilenmez.
            </p>
          </section>

          <div className="rounded-[8px] border border-emerald-200 bg-emerald-50/60 p-3 text-[12px] text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-200">
            <strong>Tasarım ilkesi:</strong> Bu panel veri-odaklı bir <em>öneri</em> sunar — son söz yönetimde.
            Rakamlar son 3 ayın gerçekleşmesini yansıtır; stratejik hedefler (yeni pazarlar, fiyat değişimi,
            büyüme kararı) bu istatistiksel tabanın dışında kalır ve yönetim tarafından üzerine eklenir.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FunnelInfo(props: { ratios: ReturnType<typeof computeFunnelRatios> }) {
  const { ratios } = props;

  const rows: Array<{ label: string; value: string }> = [];
  if (ratios.licensePerSales != null && ratios.licensePerSales > 0) {
    const trySalesPerLicense = 1 / ratios.licensePerSales;
    rows.push({
      label: "Lisans başına satış",
      value: `${formatCompactTry(trySalesPerLicense)} · yani ${formatNumber(ratios.licensePerSales * 1_000_000, 2)} lisans / 1M TRY`
    });
  }
  if (ratios.callsPerSales != null && ratios.callsPerSales > 0) {
    rows.push({
      label: "1M TRY satış için arama",
      value: `${formatNumber(ratios.callsPerSales * 1_000_000, 0)} çağrı`
    });
  }
  if (ratios.talkPerSales != null && ratios.talkPerSales > 0) {
    rows.push({
      label: "1M TRY satış için konuşma",
      value: `${formatNumber((ratios.talkPerSales * 1_000_000) / 3600, 1)} saat`
    });
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <Info size={12} />
        Huni oranları (son 3 ay medyanı)
      </div>
      <div className="grid gap-2 text-[11px] text-slate-600 dark:text-slate-400 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">{row.label}</p>
            <p className="font-semibold text-slate-800 dark:text-slate-200">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
