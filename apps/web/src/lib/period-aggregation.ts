import type {
  AuditMetric,
  LicenseSummary,
  QtManualEntry,
  ReportPeriod,
  SalesKpiAgent,
  SalesKpiData
} from "@kalitedb/shared";

import type { PeriodRangeValue } from "../components/period-range-filter";
import { parseTalkDurationLabelToSeconds } from "./format";

/* ── Sabitler ── */

export const QUARTER_LABELS = [
  "1. Çeyrek (Oca-Mar)",
  "2. Çeyrek (Nis-Haz)",
  "3. Çeyrek (Tem-Eyl)",
  "4. Çeyrek (Eki-Ara)"
] as const;

export const QUARTER_SHORT = ["Q1", "Q2", "Q3", "Q4"] as const;

/* ── Çeyrek helper ── */

export function getQuarterPeriodIds(
  yearPeriods: Array<{ id: string; month: string }>,
  quarter: number
): string[] {
  const startMonth = (quarter - 1) * 3 + 1;
  const months = [startMonth, startMonth + 1, startMonth + 2].map((m) =>
    String(m).padStart(2, "0")
  );
  return yearPeriods
    .filter((p) => {
      const m = p.month.split("-")[1];
      return months.includes(m ?? "");
    })
    .map((p) => p.id);
}

/* ── Sales KPI aggregation ── */

export function aggregateMultiPeriodKpi(datasets: (SalesKpiData | null)[]): {
  agents: SalesKpiAgent[];
  licenseSummary: LicenseSummary;
  targets: SalesKpiData["targets"] | null;
} {
  const valid = datasets.filter((d): d is SalesKpiData => d !== null);
  if (valid.length === 0) {
    return {
      agents: [],
      licenseSummary: {
        preCount: 0,
        scaleCount: 0,
        scale2Plus1Count: 0,
        scalePlusCount: 0,
        scalePlus2Plus1Count: 0
      },
      targets: null
    };
  }

  // Temsilcileri agentKey bazında birleştir
  const agentMap = new Map<string, { sums: SalesKpiAgent; count: number }>();
  for (const dataset of valid) {
    for (const agent of dataset.agents) {
      const existing = agentMap.get(agent.agentKey);
      if (existing) {
        existing.sums = {
          ...existing.sums,
          salesAmount: existing.sums.salesAmount + agent.salesAmount,
          licenseCount: existing.sums.licenseCount + agent.licenseCount,
          callAttempts: existing.sums.callAttempts + agent.callAttempts,
          talkDurationSeconds: existing.sums.talkDurationSeconds + agent.talkDurationSeconds,
          scaleCount: (existing.sums.scaleCount ?? 0) + (agent.scaleCount ?? 0),
          scalePlusCount: (existing.sums.scalePlusCount ?? 0) + (agent.scalePlusCount ?? 0),
          // Oranları topluyoruz, sonra ortalama alacağız
          conversionRate: existing.sums.conversionRate + agent.conversionRate,
          avgLicensePrice: existing.sums.avgLicensePrice + agent.avgLicensePrice,
          perfScore: (existing.sums.perfScore ?? 0) + (agent.perfScore ?? 0),
          scaleConversion: (existing.sums.scaleConversion ?? 0) + (agent.scaleConversion ?? 0),
          scalePlusConversion:
            (existing.sums.scalePlusConversion ?? 0) + (agent.scalePlusConversion ?? 0),
          totalConversion: (existing.sums.totalConversion ?? 0) + (agent.totalConversion ?? 0)
        };
        existing.count++;
      } else {
        agentMap.set(agent.agentKey, { sums: { ...agent }, count: 1 });
      }
    }
  }

  const agents: SalesKpiAgent[] = Array.from(agentMap.values()).map(({ sums, count }) => ({
    ...sums,
    conversionRate: sums.conversionRate / count,
    avgLicensePrice: sums.avgLicensePrice / count,
    perfScore: sums.perfScore !== null ? (sums.perfScore as number) / count : null,
    scaleConversion: (sums.scaleConversion ?? 0) / count,
    scalePlusConversion: (sums.scalePlusConversion ?? 0) / count,
    totalConversion: (sums.totalConversion ?? 0) / count
  }));

  // Lisans özeti: toplama
  const licenseSummary: LicenseSummary = {
    preCount: 0,
    scaleCount: 0,
    scale2Plus1Count: 0,
    scalePlusCount: 0,
    scalePlus2Plus1Count: 0
  };
  for (const dataset of valid) {
    if (dataset.licenseSummary) {
      licenseSummary.preCount += dataset.licenseSummary.preCount;
      licenseSummary.scaleCount += dataset.licenseSummary.scaleCount;
      licenseSummary.scale2Plus1Count += dataset.licenseSummary.scale2Plus1Count;
      licenseSummary.scalePlusCount += dataset.licenseSummary.scalePlusCount;
      licenseSummary.scalePlus2Plus1Count += dataset.licenseSummary.scalePlus2Plus1Count;
    }
  }

  // Hedefleri dönemler arası topla/ortala.
  // Agent verisi olmayan dönemler (ör. ayı henüz tamamlanmamış) hedefe dahil edilmez;
  // aksi halde "yıllık hedef" henüz veri girilmemiş ayları da sayar ve gerçekleşen ile
  // karşılaştırma tutarsız olur.
  const datasetsWithTargets = valid.filter((d) => d.targets && d.agents.length > 0);
  // Tek periyot için talkDurationTargetSeconds eksikse (eski kayıtlar) label'dan fallback hesapla.
  const resolveTalkTarget = (t: SalesKpiData["targets"]): number =>
    t.talkDurationTargetSeconds ?? parseTalkDurationLabelToSeconds(t.talkDurationLabel);

  let targets: SalesKpiData["targets"] | null = null;
  if (datasetsWithTargets.length === 1) {
    const base = datasetsWithTargets[0]!.targets;
    targets = { ...base, talkDurationTargetSeconds: resolveTalkTarget(base) };
  } else if (datasetsWithTargets.length > 1) {
    const n = datasetsWithTargets.length;
    targets = {
      // Kümülatif hedefler: topla
      salesAmount: datasetsWithTargets.reduce((s, d) => s + d.targets.salesAmount, 0),
      licenseCount: datasetsWithTargets.reduce((s, d) => s + d.targets.licenseCount, 0),
      callAttempts: datasetsWithTargets.reduce((s, d) => s + d.targets.callAttempts, 0),
      talkDurationTargetSeconds: datasetsWithTargets.reduce(
        (s, d) => s + resolveTalkTarget(d.targets),
        0
      ),
      // Oran hedefleri: ortalama al
      perfScore: datasetsWithTargets.reduce((s, d) => s + d.targets.perfScore, 0) / n,
      avgLicensePrice: datasetsWithTargets.reduce((s, d) => s + d.targets.avgLicensePrice, 0) / n,
      conversionRate: datasetsWithTargets.reduce((s, d) => s + d.targets.conversionRate, 0) / n,
      talkDurationLabel: datasetsWithTargets[n - 1]!.targets.talkDurationLabel
    };
  }

  return { agents, licenseSummary, targets };
}

/* ── Audit metrics aggregation (sales-audit için) ── */

export function aggregateAuditMetrics(metrics: AuditMetric[][]): AuditMetric[] {
  const flat = metrics.flat();
  if (flat.length === 0) return [];

  const grouped = new Map<
    string,
    {
      agentName: string;
      period: string;
      id: string;
      auditSum: number;
      auditCount: number;
      prevSum: number;
      prevCount: number;
    }
  >();

  for (const metric of flat) {
    const existing = grouped.get(metric.agentKey);
    if (existing) {
      if (metric.auditScore !== null) {
        existing.auditSum += metric.auditScore;
        existing.auditCount += 1;
      }
      if (metric.previousAuditAccuracy !== null) {
        existing.prevSum += metric.previousAuditAccuracy;
        existing.prevCount += 1;
      }
    } else {
      grouped.set(metric.agentKey, {
        agentName: metric.agentName,
        period: metric.period,
        id: metric.id,
        auditSum: metric.auditScore ?? 0,
        auditCount: metric.auditScore !== null ? 1 : 0,
        prevSum: metric.previousAuditAccuracy ?? 0,
        prevCount: metric.previousAuditAccuracy !== null ? 1 : 0
      });
    }
  }

  const result: AuditMetric[] = [];
  for (const [agentKey, g] of grouped.entries()) {
    result.push({
      id: g.id,
      period: g.period,
      agentKey,
      agentName: g.agentName,
      auditScore: g.auditCount > 0 ? g.auditSum / g.auditCount : null,
      previousAuditAccuracy: g.prevCount > 0 ? g.prevSum / g.prevCount : null
    });
  }

  return result;
}

/* ── QT manual entries aggregation (qt-page için) ── */

export function aggregateQtManualEntries(entries: QtManualEntry[][]): QtManualEntry[] {
  const flat = entries.flat();
  if (flat.length === 0) return [];

  const grouped = new Map<
    string,
    {
      entry: QtManualEntry;
      listeningHoursSum: number;
      listeningHoursCount: number;
      callCountSum: number;
      callCountHasValue: boolean;
      chatMailCountSum: number;
      chatMailCountHasValue: boolean;
      feedbackCountSum: number;
      feedbackCountHasValue: boolean;
      trainingCountSum: number;
      trainingCountHasValue: boolean;
      meetingCountSum: number;
      meetingCountHasValue: boolean;
    }
  >();

  for (const entry of flat) {
    const existing = grouped.get(entry.userKey);
    if (existing) {
      // En son entry'yi referans al (meta alanları için)
      existing.entry = {
        ...existing.entry,
        id: entry.id,
        periodId: entry.periodId,
        userName: entry.userName,
        userEmail: entry.userEmail,
        updatedAt: entry.updatedAt
      };
      if (entry.totalListeningHours != null) {
        existing.listeningHoursSum += entry.totalListeningHours;
        existing.listeningHoursCount += 1;
      }
      if (entry.totalEvaluatedCallCount != null) {
        existing.callCountSum += entry.totalEvaluatedCallCount;
        existing.callCountHasValue = true;
      }
      if (entry.totalEvaluatedChatMailCount != null) {
        existing.chatMailCountSum += entry.totalEvaluatedChatMailCount;
        existing.chatMailCountHasValue = true;
      }
      if (entry.feedbackCount != null) {
        existing.feedbackCountSum += entry.feedbackCount;
        existing.feedbackCountHasValue = true;
      }
      if (entry.trainingCount != null) {
        existing.trainingCountSum += entry.trainingCount;
        existing.trainingCountHasValue = true;
      }
      if (entry.meetingCount != null) {
        existing.meetingCountSum += entry.meetingCount;
        existing.meetingCountHasValue = true;
      }
    } else {
      grouped.set(entry.userKey, {
        entry,
        listeningHoursSum: entry.totalListeningHours ?? 0,
        listeningHoursCount: entry.totalListeningHours != null ? 1 : 0,
        callCountSum: entry.totalEvaluatedCallCount ?? 0,
        callCountHasValue: entry.totalEvaluatedCallCount != null,
        chatMailCountSum: entry.totalEvaluatedChatMailCount ?? 0,
        chatMailCountHasValue: entry.totalEvaluatedChatMailCount != null,
        feedbackCountSum: entry.feedbackCount ?? 0,
        feedbackCountHasValue: entry.feedbackCount != null,
        trainingCountSum: entry.trainingCount ?? 0,
        trainingCountHasValue: entry.trainingCount != null,
        meetingCountSum: entry.meetingCount ?? 0,
        meetingCountHasValue: entry.meetingCount != null
      });
    }
  }

  const result: QtManualEntry[] = [];
  for (const g of grouped.values()) {
    const totalListeningHours = g.listeningHoursCount > 0 ? g.listeningHoursSum : null;
    const feedbackCount = g.feedbackCountHasValue ? g.feedbackCountSum : null;
    // Feedback/saat: weighted average — toplam feedback / toplam dinleme saati
    const feedbackCoverage =
      totalListeningHours && totalListeningHours > 0 && feedbackCount != null
        ? feedbackCount / totalListeningHours
        : null;

    result.push({
      ...g.entry,
      totalListeningHours,
      totalEvaluatedCallCount: g.callCountHasValue ? g.callCountSum : null,
      totalEvaluatedChatMailCount: g.chatMailCountHasValue ? g.chatMailCountSum : null,
      feedbackCount,
      feedbackCoverage,
      trainingCount: g.trainingCountHasValue ? g.trainingCountSum : null,
      meetingCount: g.meetingCountHasValue ? g.meetingCountSum : null
    });
  }

  return result;
}

/* ── Period range helpers ── */

export function computeActivePeriodIds(
  yearPeriods: ReportPeriod[],
  value: PeriodRangeValue
): string[] {
  if (value.viewMode === "aylik") {
    return value.monthPeriodId ? [value.monthPeriodId] : [];
  }
  if (value.viewMode === "ceyreklik") {
    return value.quarter ? getQuarterPeriodIds(yearPeriods, value.quarter) : [];
  }
  return yearPeriods.map((p) => p.id);
}

export function derivePeriodRangeSelectors(
  departmentPeriods: ReportPeriod[],
  year: string
): {
  availableYears: string[];
  yearPeriods: ReportPeriod[];
  availableQuarters: number[];
} {
  const years = new Set<string>([year]);
  for (const p of departmentPeriods) years.add(p.month.slice(0, 4));

  const yearPeriods = [...departmentPeriods]
    .filter((p) => p.month.startsWith(`${year}-`))
    .sort((a, b) => a.month.localeCompare(b.month));

  const quarters = new Set<number>();
  for (const p of yearPeriods) {
    const m = Number(p.month.split("-")[1]);
    if (m) quarters.add(Math.ceil(m / 3));
  }

  return {
    availableYears: Array.from(years).sort((a, b) => b.localeCompare(a)),
    yearPeriods,
    availableQuarters: Array.from(quarters).sort()
  };
}
