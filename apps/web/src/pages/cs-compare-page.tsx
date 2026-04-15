import { selectAuditMetrics, selectDefaultReportPeriod } from "@kalitedb/shared";
import { SectionCard } from "@kalitedb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import {
  formatAuditScore,
  formatNumber,
  formatPercent,
  formatSeconds
} from "../lib/format";
import { computeActivePeriodIds, derivePeriodRangeSelectors } from "../lib/period-aggregation";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import { RepresentativeSelect } from "../components/representative-select";
import { BadgePill } from "../components/representative-detail-modal";
import { CompareMetricRow } from "../components/compare/compare-metric-row";
import { useActiveRepresentativeKeys } from "../lib/use-active-representatives";

/* ── Yardımcı fonksiyonlar ── */

function computeSuccessIndex(params: {
  callEvaluationAverage: number | null | undefined;
  auditScore: number | null | undefined;
  localCloseRate: number | null | undefined;
}) {
  const metrics: number[] = [];
  if (params.callEvaluationAverage != null) metrics.push(Math.max(0, Math.min(100, params.callEvaluationAverage * 20)));
  if (params.auditScore != null) metrics.push(params.auditScore);
  if (params.localCloseRate != null) metrics.push(params.localCloseRate);
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

  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, undefined, datasetTypes.join(",")],
    queryFn: () => api.getDashboard(auth.token, periodId, undefined, { datasetTypes: [...datasetTypes] }),
    staleTime: 60 * 1000
  });

  const snapshot = dashboardQuery.data;
  const auditMetrics = useMemo(() => selectAuditMetrics(snapshot?.datasets ?? { agentMetrics: [], auditMetrics: [] }), [snapshot]);

  return { snapshot, auditMetrics, monthlyPeriodId, yearPeriods };
}

/* ── Sayfa ── */

export function CsComparePage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

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
    const options = new Map<string, string>();
    (repsQuery.data ?? []).filter((r) => (r.department ?? "cs") === "cs").forEach((r) => options.set(r.key, r.displayName));
    // Her iki snapshot'tan ek isimler
    (sideA.snapshot?.datasets.agentMetrics ?? []).forEach((record) => options.set(record.agentKey, record.agentName));
    sideA.auditMetrics.forEach((record) => options.set(record.agentKey, record.agentName));
    (sideB.snapshot?.datasets.agentMetrics ?? []).forEach((record) => options.set(record.agentKey, record.agentName));
    sideB.auditMetrics.forEach((record) => options.set(record.agentKey, record.agentName));

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

  const successA = computeSuccessIndex({ callEvaluationAverage: agentA?.callEvaluationAverage, auditScore: auditA?.auditScore, localCloseRate: agentA?.localCloseRate });
  const successB = computeSuccessIndex({ callEvaluationAverage: agentB?.callEvaluationAverage, auditScore: auditB?.auditScore, localCloseRate: agentB?.localCloseRate });
  const stateA = resolveSuccessState(successA);
  const stateB = resolveSuccessState(successB);

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
              <RepCard name={repA?.agentName} avatarSrc={repA?.avatarSrc} badges={(repDataA as any)?.badges ?? []} successIndex={successA} state={stateA} />
              <RepCard name={repB?.agentName} avatarSrc={repB?.avatarSrc} badges={(repDataB as any)?.badges ?? []} successIndex={successB} state={stateB} />
            </div>

            {/* Metrik karşılaştırma */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Performans Karşılaştırması</h3>

              <div className="space-y-1.5">
                <CompareMetricRow label="Başarı Endeksi" leftValue={successA} rightValue={successB} format={(v) => formatNumber(v, 1)} />
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
