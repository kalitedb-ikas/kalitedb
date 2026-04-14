import { PageHeader, SurfaceCard } from "@kalitedb/ui";
import { selectAuditMetrics, selectDefaultReportPeriod } from "@kalitedb/shared";
import type { AuditMetric, SalesKpiAgent } from "@kalitedb/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { firebaseDb } from "../lib/firebase";
import { formatNumber, formatPeriodMonth } from "../lib/format";
import { PeriodRangeFilter, type PeriodRangeValue } from "../components/period-range-filter";
import {
  QUARTER_SHORT,
  aggregateAuditMetrics,
  aggregateMultiPeriodKpi,
  computeActivePeriodIds,
  derivePeriodRangeSelectors
} from "../lib/period-aggregation";

/* ── Formatters ── */

function formatCurrency(value: number | null): string {
  if (value === null) return "-";
  return formatNumber(value) + " TRY";
}

function formatHMS(totalSeconds: number | null): string {
  if (totalSeconds === null) return "-";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ── Score calculation (Java portunu) ── */

const WEIGHTS = {
  satisTutari: 0.425,
  satisAdedi: 0.10,
  audit: 0.10,
  acv: 0.05,
  hubspot: 0.10,
  outbound: 0.05,
  dokunulan: 0.05,
  konusma: 0.05,
  twoplus: 0.025,
  premOn: 0.05,
  domain: 0.025,
} as const;

function safeDiv(val: number, max: number): number {
  return max === 0 ? 0 : val / max;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

type SuccessRow = {
  agentKey: string;
  agentName: string;
  salesAmount: number;
  licenseCount: number;
  auditScore: number | null;
  callAttempts: number;
  talkDurationSeconds: number;
  avgSalesAmount: number;
  hubspot: number;
  outbound: number;
  total21: number;
  twoplusRatio: number;
  premOn: number;
  domain: number;
  score: number;
};

function computeScores(rows: SuccessRow[]): void {
  const max = (fn: (r: SuccessRow) => number) => rows.reduce((m, r) => Math.max(m, fn(r)), 0);

  const maxSatis = max((r) => r.salesAmount);
  const maxAdedi = max((r) => r.licenseCount);
  const maxAudit = max((r) => r.auditScore ?? 0);
  const maxDokunulan = max((r) => r.callAttempts);
  const maxKonusma = max((r) => r.talkDurationSeconds);
  const maxAcv = max((r) => r.avgSalesAmount);
  const maxOutbound = max((r) => r.outbound);
  const maxPremOn = max((r) => r.premOn);
  const maxDomain = max((r) => r.domain);

  for (const r of rows) {
    const satisTutariNorm = safeDiv(r.salesAmount, maxSatis);
    const satisAdediNorm = safeDiv(r.licenseCount, maxAdedi);
    const auditNorm = safeDiv(r.auditScore ?? 0, maxAudit);
    const dokunulanNorm = safeDiv(r.callAttempts, maxDokunulan);
    const konusmaNorm = safeDiv(r.talkDurationSeconds, maxKonusma);
    const acvNorm = safeDiv(r.avgSalesAmount, maxAcv);
    const outboundNorm = safeDiv(r.outbound, maxOutbound);
    const premOnNorm = safeDiv(r.premOn, maxPremOn);
    const domainNorm = safeDiv(r.domain, maxDomain);

    // Mutlak normalize
    const hubspotNorm = clamp(r.hubspot / 5.0, 0, 1);
    const twoplusNorm = clamp(r.twoplusRatio, 0, 1);

    r.score =
      satisTutariNorm * WEIGHTS.satisTutari +
      satisAdediNorm * WEIGHTS.satisAdedi +
      auditNorm * WEIGHTS.audit +
      acvNorm * WEIGHTS.acv +
      hubspotNorm * WEIGHTS.hubspot +
      dokunulanNorm * WEIGHTS.dokunulan +
      konusmaNorm * WEIGHTS.konusma +
      outboundNorm * WEIGHTS.outbound +
      twoplusNorm * WEIGHTS.twoplus +
      premOnNorm * WEIGHTS.premOn +
      domainNorm * WEIGHTS.domain;
  }
}

/* ── Manuel veri tipi ── */

type ManualEntry = {
  hubspot: number;
  outbound: number;
  premOn: number;
  domain: number;
};

/* ── Sorting ── */

type SortKey =
  | "agentName" | "salesAmount" | "licenseCount" | "auditScore"
  | "callAttempts" | "talkDurationFormatted" | "talkDurationSeconds"
  | "avgSalesAmount" | "hubspot" | "outbound" | "total21" | "premOn" | "domain" | "score";

type SortDir = "asc" | "desc";

function getSortValue(row: SuccessRow, key: SortKey): number | string {
  switch (key) {
    case "agentName": return row.agentName;
    case "salesAmount": return row.salesAmount;
    case "licenseCount": return row.licenseCount;
    case "auditScore": return row.auditScore ?? -Infinity;
    case "callAttempts": return row.callAttempts;
    case "talkDurationFormatted": return row.talkDurationSeconds;
    case "talkDurationSeconds": return row.talkDurationSeconds;
    case "avgSalesAmount": return row.avgSalesAmount;
    case "hubspot": return row.hubspot;
    case "outbound": return row.outbound;
    case "total21": return row.total21;
    case "premOn": return row.premOn;
    case "domain": return row.domain;
    case "score": return row.score;
    default: return 0;
  }
}

/* ── Component ── */

export function SalesSuccessIndexPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>(() => {
    const prevMonth = now.getMonth();
    const year = prevMonth === 0 ? String(now.getFullYear() - 1) : String(now.getFullYear());
    const quarter = prevMonth === 0 ? 4 : Math.ceil(prevMonth / 3);
    return { year, viewMode: "aylik", monthPeriodId: undefined, quarter };
  });
  const [sortKey, setSortKey] = useState<SortKey | null>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [manualData, setManualData] = useState<Record<string, ManualEntry>>({});

  const selectedYear = periodRange.year;
  const viewMode = periodRange.viewMode;
  const selectedQuarter = periodRange.quarter ?? 1;

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

  const defaultPeriod = useMemo(() => {
    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(
      now.getMonth() === 0 ? 12 : now.getMonth()
    ).padStart(2, "0")}`;
    return yearPeriods.find((p) => p.month === prevMonth) ?? selectDefaultReportPeriod(yearPeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearPeriods]);

  const monthlyPeriodId = yearPeriods.some((p) => p.id === periodRange.monthPeriodId)
    ? periodRange.monthPeriodId
    : defaultPeriod?.id;
  const selectedPeriod = yearPeriods.find((p) => p.id === monthlyPeriodId);

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
    queryKey: ["sales-success-kpi", auth.token, activePeriodIds.join(",")],
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

  /* ── Audit verisi ── */
  const auditQuery = useQuery({
    enabled: activePeriodIds.length > 0,
    queryKey: ["sales-success-audit", auth.token, activePeriodIds.join(",")],
    queryFn: async (): Promise<AuditMetric[]> => {
      if (activePeriodIds.length === 1) {
        const dashboard = await api.getDashboard(auth.token, activePeriodIds[0]!, undefined, {
          datasetTypes: ["agent-metrics", "audit-metrics"]
        });
        return selectAuditMetrics(dashboard.datasets);
      }
      const auditMap = await api.getAuditMetricsForPeriods(auth.token, activePeriodIds);
      const metricsPerPeriod = activePeriodIds.map((pid) => auditMap[pid] ?? []);
      return aggregateAuditMetrics(metricsPerPeriod);
    },
    staleTime: 5 * 60 * 1000
  });

  /* ── Manuel veri (Firestore) ── */
  const manualQueryKey = ["success-index-manual", monthlyPeriodId];
  const manualQuery = useQuery({
    enabled: Boolean(monthlyPeriodId),
    queryKey: manualQueryKey,
    queryFn: async (): Promise<Record<string, ManualEntry>> => {
      const db = firebaseDb;
      if (!db || !monthlyPeriodId) return {};
      const snap = await getDocs(collection(db, "reportPeriods", monthlyPeriodId, "successIndexEntries"));
      const result: Record<string, ManualEntry> = {};
      snap.forEach((d) => {
        const data = d.data();
        result[d.id] = {
          hubspot: data.hubspot ?? 0,
          outbound: data.outbound ?? 0,
          premOn: data.premOn ?? 0,
          domain: data.domain ?? 0,
        };
      });
      return result;
    },
    staleTime: 60 * 1000
  });

  useEffect(() => {
    if (manualQuery.data) setManualData(manualQuery.data);
  }, [manualQuery.data]);

  const saveManualEntry = async (agentKey: string, entry: ManualEntry) => {
    const db = firebaseDb;
    if (!db || !monthlyPeriodId) return;
    await setDoc(doc(db, "reportPeriods", monthlyPeriodId, "successIndexEntries", agentKey), entry);
    setManualData((prev) => ({ ...prev, [agentKey]: entry }));
    queryClient.invalidateQueries({ queryKey: manualQueryKey });
  };

  const kpiData = kpiQuery.data;
  const agents: SalesKpiAgent[] =
    kpiData && "agents" in kpiData ? ((kpiData as any).agents ?? []) : [];
  const auditMetrics: AuditMetric[] = auditQuery.data ?? [];

  /* ── Birleştirilmiş satırlar + skor hesabı ── */
  const rows: SuccessRow[] = useMemo(() => {
    const result: SuccessRow[] = agents.map((agent) => {
      const audit = auditMetrics.find((a) => a.agentKey === agent.agentKey);
      const manual = manualData[agent.agentKey];
      const total21 = (agent.scaleCount ?? 0) + (agent.scalePlusCount ?? 0);
      const totalLicenseForRatio = agent.licenseCount || 1;
      return {
        agentKey: agent.agentKey,
        agentName: agent.agentName,
        salesAmount: agent.salesAmount,
        licenseCount: agent.licenseCount,
        auditScore: audit?.auditScore ?? null,
        callAttempts: agent.callAttempts,
        talkDurationSeconds: agent.talkDurationSeconds,
        avgSalesAmount: agent.avgLicensePrice,
        hubspot: manual?.hubspot ?? 0,
        outbound: manual?.outbound ?? 0,
        total21,
        twoplusRatio: total21 / totalLicenseForRatio,
        premOn: manual?.premOn ?? 0,
        domain: manual?.domain ?? 0,
        score: 0,
      };
    });
    computeScores(result);
    return result;
  }, [agents, auditMetrics, manualData]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  /* ── Ortalamalar ── */
  const averages = useMemo(() => {
    const count = rows.length;
    if (count === 0) return null;
    const avg = (fn: (r: SuccessRow) => number) => rows.reduce((s, r) => s + fn(r), 0) / count;
    const avgNullable = (fn: (r: SuccessRow) => number | null) => {
      const valid = rows.filter((r) => fn(r) != null);
      return valid.length > 0 ? valid.reduce((s, r) => s + (fn(r) ?? 0), 0) / valid.length : null;
    };
    return {
      salesAmount: avg((r) => r.salesAmount),
      licenseCount: avg((r) => r.licenseCount),
      auditScore: avgNullable((r) => r.auditScore),
      callAttempts: avg((r) => r.callAttempts),
      talkDurationSeconds: avg((r) => r.talkDurationSeconds),
      avgSalesAmount: avg((r) => r.avgSalesAmount),
      hubspot: avg((r) => r.hubspot),
      outbound: avg((r) => r.outbound),
      total21: avg((r) => r.total21),
      premOn: avg((r) => r.premOn),
      domain: avg((r) => r.domain),
      score: avg((r) => r.score),
    };
  }, [rows]);

  const totals = useMemo(() => ({
    salesAmount: rows.reduce((s, r) => s + r.salesAmount, 0),
    licenseCount: rows.reduce((s, r) => s + r.licenseCount, 0),
    callAttempts: rows.reduce((s, r) => s + r.callAttempts, 0),
    total21: rows.reduce((s, r) => s + r.total21, 0),
  }), [rows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const monthLabel = useMemo(() => {
    if (viewMode === "aylik") {
      return selectedPeriod
        ? formatPeriodMonth(selectedPeriod.month).toLocaleUpperCase("tr-TR")
        : "AY";
    }
    if (viewMode === "ceyreklik") {
      return `${selectedYear} ${QUARTER_SHORT[selectedQuarter - 1]}`;
    }
    return `${selectedYear} (YILLIK)`;
  }, [viewMode, selectedPeriod, selectedYear, selectedQuarter]);

  const isLoading = periodsQuery.isPending || kpiQuery.isPending;
  const hasData = agents.length > 0;

  const tdCls = "px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap";
  const tdCenterCls = "px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap text-center";
  const thBase = "px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white whitespace-nowrap cursor-pointer select-none hover:bg-emerald-700 dark:hover:bg-emerald-800 transition-colors";
  const summaryTdCls = "px-3 py-2.5 text-sm font-bold text-emerald-200 whitespace-nowrap text-center";

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";

  const sortTh = (label: string, key: SortKey, align: "left" | "center" = "center") => (
    <th className={`${thBase} ${align === "left" ? "text-left" : "text-center"}`} onClick={() => toggleSort(key)}>
      {label}{sortArrow(key)}
    </th>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Başarı Endeksi"
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
          <p className="text-sm text-slate-600 dark:text-slate-400">Seçilen dönem için başarı endeksi verisi bulunamadı.</p>
        </SurfaceCard>
      ) : (
        <SurfaceCard variant="default">
          <div className="-m-5 overflow-x-auto sm:-m-6">
            <table className="min-w-full">
              <thead>
                <tr className="bg-emerald-800 dark:bg-emerald-900">
                  {sortTh("Temsilci", "agentName", "left")}
                  {sortTh("Satış Tutarı", "salesAmount")}
                  {sortTh("Lisans Adedi", "licenseCount")}
                  {sortTh("Audit Skoru", "auditScore")}
                  {sortTh("Dokunulan Kişi", "callAttempts")}
                  {sortTh("Konuşma Süresi", "talkDurationFormatted")}
                  {sortTh("Konuşma (sn)", "talkDurationSeconds")}
                  {sortTh("Ort. Satış Tutarı", "avgSalesAmount")}
                  {sortTh("Hubspot", "hubspot")}
                  {sortTh("Outbound", "outbound")}
                  {sortTh("2+1", "total21")}
                  {sortTh("PremOn", "premOn")}
                  {sortTh("Domain", "domain")}
                  {sortTh("Skor", "score")}
                </tr>
              </thead>

              <tbody>
                {sortedRows.map((row, idx) => (
                  <tr
                    key={row.agentKey}
                    className={[
                      "border-b border-slate-200/70 transition-colors hover:bg-slate-50/80 dark:border-slate-700/50 dark:hover:bg-slate-700/30",
                      idx % 2 === 0 ? "bg-white dark:bg-slate-800/30" : "bg-slate-50/50 dark:bg-slate-800/50"
                    ].join(" ")}
                  >
                    <td className={`${tdCls} font-semibold`}>{row.agentName}</td>
                    <td className={tdCenterCls}>{formatCurrency(row.salesAmount)}</td>
                    <td className={tdCenterCls}>{formatNumber(row.licenseCount)}</td>
                    <td className={tdCenterCls}>
                      {row.auditScore !== null ? formatNumber(row.auditScore, 1) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className={tdCenterCls}>{formatNumber(row.callAttempts)}</td>
                    <td className={tdCenterCls}>{formatHMS(row.talkDurationSeconds)}</td>
                    <td className={tdCenterCls}>{formatNumber(row.talkDurationSeconds)}</td>
                    <td className={tdCenterCls}>{formatCurrency(row.avgSalesAmount)}</td>
                    <td className={tdCenterCls}>
                      <EditableCell
                        value={row.hubspot}
                        onSave={(v) => saveManualEntry(row.agentKey, { ...manualData[row.agentKey] ?? { hubspot: 0, outbound: 0, premOn: 0, domain: 0 }, hubspot: v })}
                        format={(v) => formatNumber(v, 3)}
                      />
                    </td>
                    <td className={tdCenterCls}>
                      <EditableCell
                        value={row.outbound}
                        onSave={(v) => saveManualEntry(row.agentKey, { ...manualData[row.agentKey] ?? { hubspot: 0, outbound: 0, premOn: 0, domain: 0 }, outbound: v })}
                        format={(v) => formatNumber(v)}
                      />
                    </td>
                    <td className={tdCenterCls}>{formatNumber(row.total21)}</td>
                    <td className={tdCenterCls}>
                      <EditableCell
                        value={row.premOn}
                        onSave={(v) => saveManualEntry(row.agentKey, { ...manualData[row.agentKey] ?? { hubspot: 0, outbound: 0, premOn: 0, domain: 0 }, premOn: v })}
                        format={(v) => formatNumber(v)}
                      />
                    </td>
                    <td className={tdCenterCls}>
                      <EditableCell
                        value={row.domain}
                        onSave={(v) => saveManualEntry(row.agentKey, { ...manualData[row.agentKey] ?? { hubspot: 0, outbound: 0, premOn: 0, domain: 0 }, domain: v })}
                        format={(v) => formatNumber(v)}
                      />
                    </td>
                    <td className={`${tdCenterCls} font-bold`}>
                      <span className={
                        row.score >= 0.7 ? "text-emerald-600 dark:text-emerald-400"
                          : row.score >= 0.4 ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-600 dark:text-slate-400"
                      }>
                        {formatNumber(row.score * 100, 1)}
                      </span>
                    </td>
                  </tr>
                ))}

                {averages ? (
                  <tr className="border-t-2 border-emerald-600 bg-emerald-800 dark:border-emerald-700 dark:bg-emerald-900">
                    <td className="px-3 py-2.5 text-sm font-bold text-white whitespace-nowrap">ORTALAMA</td>
                    <td className={summaryTdCls}>{formatCurrency(averages.salesAmount)}</td>
                    <td className={summaryTdCls}>{formatNumber(Math.round(averages.licenseCount))}</td>
                    <td className={summaryTdCls}>{averages.auditScore !== null ? formatNumber(averages.auditScore, 1) : "-"}</td>
                    <td className={summaryTdCls}>{formatNumber(Math.round(averages.callAttempts))}</td>
                    <td className={summaryTdCls}>{formatHMS(Math.round(averages.talkDurationSeconds))}</td>
                    <td className={summaryTdCls}>{formatNumber(Math.round(averages.talkDurationSeconds))}</td>
                    <td className={summaryTdCls}>{formatCurrency(Math.round(averages.avgSalesAmount))}</td>
                    <td className={summaryTdCls}>{formatNumber(averages.hubspot, 3)}</td>
                    <td className={summaryTdCls}>{formatNumber(Math.round(averages.outbound))}</td>
                    <td className={summaryTdCls}>{formatNumber(Math.round(averages.total21))}</td>
                    <td className={summaryTdCls}>{formatNumber(Math.round(averages.premOn))}</td>
                    <td className={summaryTdCls}>{formatNumber(Math.round(averages.domain))}</td>
                    <td className={summaryTdCls}>{formatNumber(averages.score * 100, 1)}</td>
                  </tr>
                ) : null}

                <tr className="border-t border-emerald-600 bg-emerald-800 dark:border-emerald-700 dark:bg-emerald-900">
                  <td className="px-3 py-2.5 text-sm font-bold text-white whitespace-nowrap">TOPLAM</td>
                  <td className={summaryTdCls}>{formatCurrency(totals.salesAmount)}</td>
                  <td className={summaryTdCls}>{formatNumber(totals.licenseCount)}</td>
                  <td className={summaryTdCls} />
                  <td className={summaryTdCls}>{formatNumber(totals.callAttempts)}</td>
                  <td className={summaryTdCls} />
                  <td className={summaryTdCls} />
                  <td className={summaryTdCls} />
                  <td className={summaryTdCls} />
                  <td className={summaryTdCls} />
                  <td className={summaryTdCls}>{formatNumber(totals.total21)}</td>
                  <td className={summaryTdCls} />
                  <td className={summaryTdCls} />
                  <td className={summaryTdCls} />
                </tr>
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}

/* ── Inline editable cell ── */

function EditableCell(props: { value: number; onSave: (v: number) => void; format: (v: number) => string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(String(props.value || ""));
    setEditing(true);
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(draft.replace(",", "."));
    if (!isNaN(parsed) && parsed !== props.value) {
      props.onSave(parsed);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="w-16 rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-center text-sm text-slate-800 outline-none focus:border-emerald-500 dark:border-emerald-600 dark:bg-slate-700 dark:text-slate-200"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      />
    );
  }

  return (
    <span
      className="cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
      onClick={startEdit}
      title="Düzenlemek için tıklayın"
    >
      {props.value === 0 ? <span className="text-slate-400">-</span> : props.format(props.value)}
    </span>
  );
}
