import { ChampionSpotlightCard, InsightTile, Leaderboard, PageHeader, StatCard, SurfaceCard } from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { average, resolveThresholdTone, selectAuditMetrics, selectDefaultReportPeriod } from "@kalitedb/shared";
import type { AuditMetric } from "@kalitedb/shared";
import { ShieldCheck, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { TrendLineCard, buildYearTrendPoints } from "../components/year-trend-card";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import {
  aggregateAuditMetrics,
  computeActivePeriodIds,
  derivePeriodRangeSelectors,
  getQuarterPeriodIds
} from "../lib/period-aggregation";
import { DataTable } from "../components/data-table";
import {
  AuditTableBadge,
  MonthlyTable,
  buildAgentAvatar,
  isAuditSummaryRow,
  type MonthlyAgentRow
} from "../components/audit-shared";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatAuditScore, formatNumber } from "../lib/format";
import { chart } from "../theme/colors";

type AuditAgentRow = {
  id: string;
  agentKey: string;
  agentName: string;
  listIndex: number;
  auditScoreDisplay: number | null;
};

const columnHelper = createColumnHelper<AuditAgentRow>();

export function SalesAuditPage() {
  const auth = useAuth();
  const now = new Date();
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  });

  const selectedYear = periodRange.year;

  /* ── Dönemler ── */
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

  /* ── Seçili dönem ── */
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

  /* ── Seçili dönem için tam dashboard ─��� */
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, undefined],
    queryFn: () => api.getDashboard(auth.token, periodId, undefined),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });
  const snapshot = dashboardQuery.data;

  const auditThreshold = snapshot?.thresholds.auditScore;
  const currentAudits = useMemo(() => (snapshot ? selectAuditMetrics(snapshot.datasets) : []), [snapshot]);

  /* ── Toplu audit history (yıl boyu, çoklu dönem toplulaştırması için) ── */
  const yearPeriodIds = useMemo(() => yearPeriods.map((p) => p.id), [yearPeriods]);
  const auditHistoryBulkQuery = useQuery({
    enabled: yearPeriodIds.length > 0,
    queryKey: ["audit-history-bulk", auth.token, yearPeriodIds],
    queryFn: () => api.getAuditMetricsForPeriods(auth.token, yearPeriodIds),
    staleTime: 5 * 60 * 1000
  });
  const auditHistoryMap = auditHistoryBulkQuery.data;

  /* ── ViewMode'a göre aktif dönem ID'leri ── */
  const activePeriodIds = useMemo(
    () =>
      computeActivePeriodIds(yearPeriods, {
        ...periodRange,
        monthPeriodId: periodId
      }),
    [yearPeriods, periodRange, periodId]
  );

  /* ── ViewMode'a göre toplulaştırılmış audit metrikleri ──
   * aylık  → seçili dönemin audit'leri (tek dönem)
   * çeyreklik → seçili çeyreğin 3 ayının audit puanı ortalamaları (agent bazında)
   * yıllık → yılın tüm ayları için audit puanı ortalamaları (agent bazında)
   */
  const aggregatedAudits = useMemo<AuditMetric[]>(() => {
    // Aylık modda mevcut dashboard snapshot yeterli
    if (periodRange.viewMode === "aylik") {
      return currentAudits.filter((a) => !isAuditSummaryRow(a.agentName));
    }
    // Çoklu dönemde bulk audit history gerekir
    if (!auditHistoryMap || activePeriodIds.length === 0) return [];
    const metricsPerPeriod = activePeriodIds.map((pid) =>
      (auditHistoryMap[pid] ?? []).filter((m) => !isAuditSummaryRow(m.agentName))
    );
    return aggregateAuditMetrics(metricsPerPeriod);
  }, [periodRange.viewMode, currentAudits, auditHistoryMap, activePeriodIds]);

  /* ── Detay tablo satırları (viewMode-aware) ── */
  const agents = useMemo<AuditAgentRow[]>(() => {
    if (aggregatedAudits.length === 0) return [];
    const sorted = [...aggregatedAudits].sort((a, b) => {
      const as_ = a.auditScore;
      const bs_ = b.auditScore;
      if (as_ === null && bs_ === null) return a.agentName.localeCompare(b.agentName, "tr");
      if (as_ === null) return 1;
      if (bs_ === null) return -1;
      if (bs_ !== as_) return bs_ - as_;
      return a.agentName.localeCompare(b.agentName, "tr");
    });
    return sorted.map((a, i) => ({
      id: a.id,
      agentKey: a.agentKey,
      agentName: a.agentName,
      listIndex: i + 1,
      auditScoreDisplay: a.auditScore
    }));
  }, [aggregatedAudits]);

  /* ── Takım audit ortalaması (viewMode-aware) ── */
  const teamAuditAverage = useMemo(
    () => average(aggregatedAudits.map((a) => a.auditScore)),
    [aggregatedAudits]
  );

  const evaluatedAgentCount = useMemo(
    () => aggregatedAudits.filter((a) => a.auditScore !== null).length,
    [aggregatedAudits]
  );

  /* ── Şampiyon & en düşük (viewMode-aware) ── */
  const auditLeaders = useMemo(() => {
    const scored = aggregatedAudits.filter(
      (a): a is typeof a & { auditScore: number } => a.auditScore !== null
    );
    if (scored.length === 0) return [];
    const topScore = Math.max(...scored.map((a) => a.auditScore));
    return scored
      .filter((a) => a.auditScore === topScore)
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"))
      .map((a, i) => ({ name: a.agentName, imageAlt: a.agentName, imageSrc: buildAgentAvatar(a.agentName, i) }));
  }, [aggregatedAudits]);
  const auditLeaderNames = auditLeaders.map((l) => l.name).join(", ");

  const topAuditScore = useMemo(() => {
    const scored = aggregatedAudits
      .map((a) => a.auditScore)
      .filter((v): v is number => v !== null);
    return scored.length > 0 ? Math.max(...scored) : null;
  }, [aggregatedAudits]);

  const lowestAuditGroup = useMemo(() => {
    const scored = aggregatedAudits.filter(
      (a): a is typeof a & { auditScore: number } => a.auditScore !== null
    );
    if (scored.length === 0) return null;
    const lowestScore = Math.min(...scored.map((a) => a.auditScore));
    const leaders = scored
      .filter((a) => a.auditScore === lowestScore)
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));
    return { names: leaders.map((a) => a.agentName).join(", "), score: lowestScore };
  }, [aggregatedAudits]);

  /* ── Audit lider tablosu (viewMode-aware, top 5) ── */
  const auditLeaderboardItems = useMemo(() => {
    return aggregatedAudits
      .filter((a): a is typeof a & { auditScore: number } => a.auditScore !== null)
      .sort((a, b) => b.auditScore - a.auditScore || a.agentName.localeCompare(b.agentName, "tr"))
      .slice(0, 5)
      .map((a) => ({ id: a.id, label: a.agentName, value: formatAuditScore(a.auditScore) }));
  }, [aggregatedAudits]);

  /* ── Yıl trend grafiği ── */
  const auditHistory = useMemo(() => {
    if (!auditHistoryMap) return [];

    const points = yearPeriods.map((period) => {
      const audits = auditHistoryMap[period.id] ?? [];
      const auditAverage = average(audits.filter((a) => !isAuditSummaryRow(a.agentName)).map((a) => a.auditScore));
      return { periodId: period.id, period: period.month, title: period.title, audit: auditAverage, csat: null };
    });

    return buildYearTrendPoints({ year: selectedYear, currentPeriodId: periodId, points });
  }, [auditHistoryMap, yearPeriods, selectedYear, periodId]);

  /* ── Performans değişimi (viewMode-aware) ──
   * aylık  → önceki ay vs şimdiki ay
   * çeyreklik → önceki çeyrek ortalaması vs şimdiki çeyrek ortalaması
   * yıllık → karşılaştırma yok (tek dönem)
   */
  const previousPeriodIds = useMemo<string[]>(() => {
    if (periodRange.viewMode === "aylik") {
      if (!periodId) return [];
      const idx = yearPeriods.findIndex((p) => p.id === periodId);
      return idx > 0 ? [yearPeriods[idx - 1]!.id] : [];
    }
    if (periodRange.viewMode === "ceyreklik") {
      const prevQuarter = (periodRange.quarter ?? 1) - 1;
      if (prevQuarter < 1) return [];
      return getQuarterPeriodIds(yearPeriods, prevQuarter);
    }
    return [];
  }, [periodRange.viewMode, periodRange.quarter, periodId, yearPeriods]);

  const previousAggregatedAudits = useMemo<AuditMetric[] | null>(() => {
    if (previousPeriodIds.length === 0 || !auditHistoryMap) return null;
    const metricsPerPeriod = previousPeriodIds.map((pid) =>
      (auditHistoryMap[pid] ?? []).filter((m) => !isAuditSummaryRow(m.agentName))
    );
    return aggregateAuditMetrics(metricsPerPeriod);
  }, [previousPeriodIds, auditHistoryMap]);

  const performanceShiftTitlePrefix =
    periodRange.viewMode === "ceyreklik" ? "Çeyreklik" : "Aylık";

  const performanceShift = useMemo(() => {
    if (!previousAggregatedAudits) return null;

    const prevMap = new Map(
      previousAggregatedAudits
        .filter((a): a is typeof a & { auditScore: number } => a.auditScore !== null)
        .map((a) => [a.agentKey, a.auditScore])
    );

    const changes = aggregatedAudits
      .filter((a): a is typeof a & { auditScore: number } => a.auditScore !== null)
      .map((a) => {
        const prev = prevMap.get(a.agentKey);
        return prev !== undefined ? { label: a.agentName, delta: Number((a.auditScore - prev).toFixed(2)) } : null;
      })
      .filter((item): item is { label: string; delta: number } => item !== null);

    if (changes.length === 0) return null;

    const maxDelta = Math.max(...changes.map((c) => c.delta));
    if (maxDelta > 0) {
      const leaders = changes.filter((c) => c.delta === maxDelta).sort((a, b) => a.label.localeCompare(b.label, "tr"));
      return { title: "Yükselen performans", names: leaders.map((l) => l.label).join(", "), delta: maxDelta };
    }

    const minDelta = Math.min(...changes.map((c) => c.delta));
    if (minDelta < 0) {
      const leaders = changes.filter((c) => c.delta === minDelta).sort((a, b) => a.label.localeCompare(b.label, "tr"));
      return { title: "Düşen performans", names: leaders.map((l) => l.label).join(", "), delta: minDelta };
    }

    return {
      title: `${performanceShiftTitlePrefix} değişim`,
      names: changes.map((c) => c.label).sort((a, b) => a.localeCompare(b, "tr")).join(", "),
      delta: 0
    };
  }, [aggregatedAudits, previousAggregatedAudits, performanceShiftTitlePrefix]);

  /* ── Roleplay verileri (her ay için) ── */
  const roleplayQueries = useQueries({
    queries: yearPeriods.map((period) => ({
      queryKey: ["roleplay-metrics", auth.token, period.id],
      queryFn: () => api.getRoleplayMetrics(auth.token, period.id),
      staleTime: 5 * 60 * 1000
    }))
  });

  /* ── Aylık audit pivot (ortalama) ── */
  const auditMonthlyData = useMemo<MonthlyAgentRow[]>(() => {
    if (!auditHistoryMap) return [];

    const agentMap = new Map<string, string>();
    const agentMonths = new Map<string, (number | null)[]>();

    for (const period of yearPeriods) {
      const monthIdx = Number(period.month.split("-")[1]) - 1;
      const audits = auditHistoryMap[period.id] ?? [];
      for (const audit of audits) {
        if (isAuditSummaryRow(audit.agentName)) continue;
        agentMap.set(audit.agentKey, audit.agentName);
        if (!agentMonths.has(audit.agentKey)) agentMonths.set(audit.agentKey, Array(12).fill(null));
        agentMonths.get(audit.agentKey)![monthIdx] = audit.auditScore;
      }
    }

    return Array.from(agentMap.entries())
      .map(([key, name]) => ({ agentKey: key, agentName: name, months: agentMonths.get(key) ?? Array(12).fill(null) }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));
  }, [auditHistoryMap, yearPeriods]);

  /* ── Aylık role-play pivot (toplam) ── */
  const rolePlayData = useMemo<MonthlyAgentRow[]>(() => {
    const agentMap = new Map<string, string>();
    const agentMonths = new Map<string, (number | null)[]>();

    for (let i = 0; i < yearPeriods.length; i++) {
      const monthIdx = Number(yearPeriods[i]!.month.split("-")[1]) - 1;
      const data = roleplayQueries[i]?.data;
      if (!data) continue;
      for (const entry of data) {
        agentMap.set(entry.agentKey, entry.agentName);
        if (!agentMonths.has(entry.agentKey)) agentMonths.set(entry.agentKey, Array(12).fill(null));
        agentMonths.get(entry.agentKey)![monthIdx] = entry.rolePlayCount;
      }
    }

    return Array.from(agentMap.entries())
      .map(([key, name]) => ({ agentKey: key, agentName: name, months: agentMonths.get(key) ?? Array(12).fill(null) }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));
  }, [yearPeriods, roleplayQueries]);

  /* ── Aylık RevOPS pivot (toplam) ── */
  const revOpsData = useMemo<MonthlyAgentRow[]>(() => {
    const agentMap = new Map<string, string>();
    const agentMonths = new Map<string, (number | null)[]>();

    for (let i = 0; i < yearPeriods.length; i++) {
      const monthIdx = Number(yearPeriods[i]!.month.split("-")[1]) - 1;
      const data = roleplayQueries[i]?.data;
      if (!data) continue;
      for (const entry of data) {
        if (entry.revOpsCount === null || entry.revOpsCount === undefined) continue;
        agentMap.set(entry.agentKey, entry.agentName);
        if (!agentMonths.has(entry.agentKey)) agentMonths.set(entry.agentKey, Array(12).fill(null));
        agentMonths.get(entry.agentKey)![monthIdx] = entry.revOpsCount;
      }
    }

    return Array.from(agentMap.entries())
      .map(([key, name]) => ({ agentKey: key, agentName: name, months: agentMonths.get(key) ?? Array(12).fill(null) }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));
  }, [yearPeriods, roleplayQueries]);

  /* ── Seçili dönem için roleplay notları ── */
  const queryClient = useQueryClient();

  const roleplayNoteMap = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    if (!periodId) return map;
    const idx = yearPeriods.findIndex((p) => p.id === periodId);
    if (idx < 0) return map;
    const data = roleplayQueries[idx]?.data;
    if (!data) return map;
    for (const entry of data) {
      if (entry.note) {
        map.set(entry.agentKey, entry.note);
      }
    }
    return map;
  }, [periodId, yearPeriods, roleplayQueries]);

  const [noteModal, setNoteModal] = useState<{ agentKey: string; agentName: string; note: string } | null>(null);

  const saveNoteMutation = useMutation({
    mutationFn: async ({ agentKey, note }: { agentKey: string; note: string }) => {
      if (!periodId) return;
      const idx = yearPeriods.findIndex((p) => p.id === periodId);
      if (idx < 0) return;
      const currentData = roleplayQueries[idx]?.data ?? [];
      const entries = currentData.map((entry) => ({
        agentKey: entry.agentKey,
        agentName: entry.agentName,
        rolePlayCount: entry.rolePlayCount,
        revOpsCount: entry.revOpsCount ?? null,
        ...(entry.agentKey === agentKey
          ? (note.trim() ? { note: note.trim() } : {})
          : (entry.note ? { note: entry.note } : {}))
      }));
      await api.saveRoleplayMetrics(auth.token, periodId!, entries);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roleplay-metrics"] });
      setNoteModal(null);
    }
  });

  const isLoading = periodsQuery.isPending || dashboardQuery.isPending;

  const columns: ColumnDef<AuditAgentRow, any>[] = [
    columnHelper.accessor("listIndex", {
      header: "#",
      cell: (info) => <span className="font-medium text-slate-500 dark:text-slate-400">{info.getValue()}</span>
    }),
    columnHelper.accessor("agentName", { header: "Temsilci" }),
    columnHelper.accessor("auditScoreDisplay", {
      header: "Audit skoru",
      cell: (info) => <AuditTableBadge value={info.getValue()} />
    })
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Satış Audit"
        actions={
          <PeriodRangeFilter
            onChange={setPeriodRange}
            periods={salesPeriods}
            value={{ ...periodRange, monthPeriodId: periodId }}
          />
        }
      />

      {isLoading ? (
        <SurfaceCard title="Yükleniyor..." variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">Veriler yükleniyor...</p>
        </SurfaceCard>
      ) : !snapshot ? (
        <SurfaceCard title="Henüz veri yok" variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {selectedYear} yılı için satış departmanına ait dönem verisi bulunamadı.
          </p>
        </SurfaceCard>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <StatCard
              icon={<ShieldCheck size={18} />}
              label="Takım audit ortalaması"
              tone={auditThreshold ? resolveThresholdTone(teamAuditAverage, auditThreshold) : "neutral"}
              value={formatAuditScore(teamAuditAverage)}
            />
            <StatCard
              icon={<Users size={18} />}
              label="Değerlendirilen temsilci"
              tone="neutral"
              value={formatNumber(evaluatedAgentCount)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <ChampionSpotlightCard
              kicker={auditLeaders.length > 1 ? "Öne çıkan temsilciler" : "Öne çıkan temsilci"}
              metricLabel={auditLeaders.length > 1 ? "Lider temsilciler" : "Lider temsilci"}
              name={auditLeaderNames || "Takip ediliyor"}
              people={auditLeaders}
              score={formatAuditScore(topAuditScore)}
              showPodium={false}
              theme="ink"
              title="En yüksek audit skoru"
            />

            <div className="grid gap-4">
              <InsightTile
                description={performanceShift ? `${performanceShift.delta > 0 ? "+" : ""}${formatNumber(performanceShift.delta, 2)} puan` : undefined}
                icon={<TrendingUp size={16} />}
                title={performanceShift?.title ?? "Yükselen performans"}
                value={performanceShift?.names ?? "Henüz yok"}
              />
              <InsightTile
                description={formatAuditScore(lowestAuditGroup?.score)}
                icon={<TrendingDown size={16} />}
                title="En düşük audit"
                value={lowestAuditGroup?.names ?? "Henüz yok"}
              />

            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <TrendLineCard
              color={chart.barDefault}
              data={auditHistory}
              emptyMessage={
                auditHistoryBulkQuery.isPending
                  ? "Yıllık audit verisi yükleniyor..."
                  : auditHistoryBulkQuery.isError
                    ? "Audit verisi alınamadı."
                    : "Bu yıl için audit verisi bulunamadı."
              }
              metricKey="audit"
              title="Audit"
              valueFormatter={(value) => formatAuditScore(value)}
              yDomain={[0, 100]}
            />

            <Leaderboard
              items={auditLeaderboardItems}
              title="Audit lider tablosu"
            />
          </div>

          <SurfaceCard
            title="Detay tablo görünümü"
            variant="default"
            headerClassName="bg-emerald-800 border-emerald-700 dark:bg-emerald-900"
            titleClassName="text-white"
          >
            <DataTable
              columns={columns}
              data={agents}
              density="comfortable"
              emptyState="Seçilen dönemde gösterilecek audit kaydı bulunamadı."
            />
          </SurfaceCard>

          <MonthlyTable
            data={auditMonthlyData}
            summaryMode="average"
            title="Aylık Audit Skorları"
            valueFormatter={(v) => formatAuditScore(v)}
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <MonthlyTable
              data={rolePlayData}
              noteMap={roleplayNoteMap}
              onNoteClick={(agentKey, agentName, currentNote) =>
                setNoteModal({ agentKey, agentName, note: currentNote })
              }
              summaryMode="total"
              title="IS Role-Play Adet"
              emptyNote="Role-play verileri henüz girilmemiş. Yönetim panelinden giriş yapabilirsiniz."
              colorScale="count"
            />

            <MonthlyTable
              data={revOpsData}
              summaryMode="total"
              title="RevOPS"
              emptyNote="RevOPS verileri henüz girilmemiş. Yönetim panelinden giriş yapabilirsiniz."
              colorScale="count"
            />
          </div>
        </>
      )}

      {noteModal && (
        <RoleplayNoteModal
          agentName={noteModal.agentName}
          isSaving={saveNoteMutation.isPending}
          note={noteModal.note}
          onClose={() => setNoteModal(null)}
          onSave={(value) => saveNoteMutation.mutate({ agentKey: noteModal.agentKey, note: value })}
        />
      )}
    </div>
  );
}

/* ── Roleplay Not Modalı ── */

function RoleplayNoteModal(props: {
  agentName: string;
  note: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(props.note);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}>
      <div
        className="mx-4 w-full max-w-md rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-950 dark:text-slate-100">
            {props.agentName} &mdash; Role-Play Notu
          </h3>
          <button
            className="inline-flex size-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300"
            onClick={props.onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
        <textarea
          autoFocus
          className="mt-4 h-32 w-full resize-none rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 transition focus:border-primary/40 focus:outline-none"
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Temsilci hakkında not girin..."
          value={draft}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-[10px] border border-slate-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-slate-700"
            onClick={props.onClose}
            type="button"
          >
            Vazgeç
          </button>
          <button
            className="rounded-[10px] bg-[#2f6b7a] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(47,107,122,0.18)] transition hover:bg-[#285d6a] disabled:opacity-50"
            disabled={props.isSaving}
            onClick={() => props.onSave(draft)}
            type="button"
          >
            {props.isSaving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
