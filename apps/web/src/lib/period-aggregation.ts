import type {
  AgentMetric,
  AuditMetric,
  LicenseSummary,
  QtManualEntry,
  RampEntry,
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
    conversionRate: sums.callAttempts > 0 ? (sums.licenseCount / sums.callAttempts) * 100 : 0,
    avgLicensePrice: sums.licenseCount > 0 ? sums.salesAmount / sums.licenseCount : 0,
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
      talkDurationLabel: datasetsWithTargets[n - 1]!.targets.talkDurationLabel,
      perPersonSalesTarget: datasetsWithTargets.some((d) => d.targets.perPersonSalesTarget != null)
        ? datasetsWithTargets.reduce((s, d) => s + (d.targets.perPersonSalesTarget ?? 0), 0)
        : null
    };
  }

  return { agents, licenseSummary, targets };
}

/* ── Agent metrics aggregation (cs-csat için, çeyreklik/yıllık) ── */

export function aggregateAgentMetrics(metrics: AgentMetric[][]): AgentMetric[] {
  const flat = metrics.flat();
  if (flat.length === 0) return [];

  const grouped = new Map<
    string,
    {
      id: string;
      period: string;
      agentName: string;
      totalCallCount: number;
      totalChatMailCount: number;
      totalTicketClosedCount: number;
      totalConversationCount: number;
      missedCallsSum: number;
      missedCallsHasValue: boolean;
      evaluationCountSum: number;
      evaluationCountHasValue: boolean;
      talkDurationSum: number;
      talkDurationCount: number;
      localCloseRateSum: number;
      localCloseRateCount: number;
      weightedCsatSum: number;
      csatWeightSum: number;
      csatFallbackSum: number;
      csatFallbackCount: number;
      auditScoreSum: number;
      auditScoreCount: number;
      prevAuditSum: number;
      prevAuditCount: number;
    }
  >();

  for (const m of flat) {
    const existing = grouped.get(m.agentKey);
    if (existing) {
      existing.id = m.id;
      existing.period = m.period;
      existing.agentName = m.agentName;
      existing.totalCallCount += m.totalCallCount;
      existing.totalChatMailCount += m.totalChatMailCount;
      existing.totalTicketClosedCount += m.totalTicketClosedCount;
      existing.totalConversationCount += m.totalConversationCount;
      if (m.missedCalls !== null) {
        existing.missedCallsSum += m.missedCalls;
        existing.missedCallsHasValue = true;
      }
      if (m.evaluationCount !== null) {
        existing.evaluationCountSum += m.evaluationCount;
        existing.evaluationCountHasValue = true;
      }
      if (m.avgTalkDurationSeconds !== null) {
        existing.talkDurationSum += m.avgTalkDurationSeconds;
        existing.talkDurationCount += 1;
      }
      if (m.localCloseRate !== null) {
        existing.localCloseRateSum += m.localCloseRate;
        existing.localCloseRateCount += 1;
      }
      if (m.callEvaluationAverage !== null) {
        if (m.evaluationCount !== null && m.evaluationCount > 0) {
          existing.weightedCsatSum += m.callEvaluationAverage * m.evaluationCount;
          existing.csatWeightSum += m.evaluationCount;
        } else {
          existing.csatFallbackSum += m.callEvaluationAverage;
          existing.csatFallbackCount += 1;
        }
      }
      if (m.auditScore !== null) {
        existing.auditScoreSum += m.auditScore;
        existing.auditScoreCount += 1;
      }
      if (m.previousAuditAccuracy !== null) {
        existing.prevAuditSum += m.previousAuditAccuracy;
        existing.prevAuditCount += 1;
      }
    } else {
      grouped.set(m.agentKey, {
        id: m.id,
        period: m.period,
        agentName: m.agentName,
        totalCallCount: m.totalCallCount,
        totalChatMailCount: m.totalChatMailCount,
        totalTicketClosedCount: m.totalTicketClosedCount,
        totalConversationCount: m.totalConversationCount,
        missedCallsSum: m.missedCalls ?? 0,
        missedCallsHasValue: m.missedCalls !== null,
        evaluationCountSum: m.evaluationCount ?? 0,
        evaluationCountHasValue: m.evaluationCount !== null,
        talkDurationSum: m.avgTalkDurationSeconds ?? 0,
        talkDurationCount: m.avgTalkDurationSeconds !== null ? 1 : 0,
        localCloseRateSum: m.localCloseRate ?? 0,
        localCloseRateCount: m.localCloseRate !== null ? 1 : 0,
        weightedCsatSum:
          m.callEvaluationAverage !== null && m.evaluationCount !== null && m.evaluationCount > 0
            ? m.callEvaluationAverage * m.evaluationCount
            : 0,
        csatWeightSum:
          m.callEvaluationAverage !== null && m.evaluationCount !== null && m.evaluationCount > 0
            ? m.evaluationCount
            : 0,
        csatFallbackSum:
          m.callEvaluationAverage !== null && (m.evaluationCount === null || m.evaluationCount === 0)
            ? m.callEvaluationAverage
            : 0,
        csatFallbackCount:
          m.callEvaluationAverage !== null && (m.evaluationCount === null || m.evaluationCount === 0)
            ? 1
            : 0,
        auditScoreSum: m.auditScore ?? 0,
        auditScoreCount: m.auditScore !== null ? 1 : 0,
        prevAuditSum: m.previousAuditAccuracy ?? 0,
        prevAuditCount: m.previousAuditAccuracy !== null ? 1 : 0
      });
    }
  }

  const result: AgentMetric[] = [];
  for (const [agentKey, g] of grouped.entries()) {
    let csat: number | null = null;
    if (g.csatWeightSum > 0) {
      csat = g.weightedCsatSum / g.csatWeightSum;
    } else if (g.csatFallbackCount > 0) {
      csat = g.csatFallbackSum / g.csatFallbackCount;
    }
    result.push({
      id: g.id,
      period: g.period,
      agentKey,
      agentName: g.agentName,
      auditScore: g.auditScoreCount > 0 ? g.auditScoreSum / g.auditScoreCount : null,
      previousAuditAccuracy: g.prevAuditCount > 0 ? g.prevAuditSum / g.prevAuditCount : null,
      totalCallCount: g.totalCallCount,
      totalChatMailCount: g.totalChatMailCount,
      totalTicketClosedCount: g.totalTicketClosedCount,
      totalConversationCount: g.totalConversationCount,
      avgTalkDurationSeconds:
        g.talkDurationCount > 0 ? Math.round(g.talkDurationSum / g.talkDurationCount) : null,
      localCloseRate: g.localCloseRateCount > 0 ? g.localCloseRateSum / g.localCloseRateCount : null,
      missedCalls: g.missedCallsHasValue ? g.missedCallsSum : null,
      callEvaluationAverage: csat,
      evaluationCount: g.evaluationCountHasValue ? g.evaluationCountSum : null
    });
  }

  return result;
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

/* ── RAMP entries aggregation ── */

export function aggregateRampEntries(entries: RampEntry[][]): RampEntry[] {
  const flat = entries.flat();
  if (flat.length === 0) return [];

  const grouped = new Map<string, { pipeline: number; growAmount: number; scaleAmount: number; scalePlusAmount: number; updatedAt: string }>();

  for (const entry of flat) {
    const existing = grouped.get(entry.agentKey);
    if (existing) {
      existing.pipeline += entry.pipeline;
      existing.growAmount += entry.growAmount;
      existing.scaleAmount += entry.scaleAmount;
      existing.scalePlusAmount += entry.scalePlusAmount;
      if (entry.updatedAt > existing.updatedAt) existing.updatedAt = entry.updatedAt;
    } else {
      grouped.set(entry.agentKey, {
        pipeline: entry.pipeline,
        growAmount: entry.growAmount,
        scaleAmount: entry.scaleAmount,
        scalePlusAmount: entry.scalePlusAmount,
        updatedAt: entry.updatedAt
      });
    }
  }

  return Array.from(grouped.entries()).map(([agentKey, g]) => ({
    agentKey,
    ...g
  }));
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
