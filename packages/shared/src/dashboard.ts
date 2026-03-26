import {
  DEFAULT_THRESHOLDS,
  type AgentMetric,
  type AuditMetric,
  type DashboardMetricItem,
  type DashboardSnapshot,
  type KpiMetricKey,
  type QuestionPerformance,
  type QtOverview,
  type QtMetric,
  type ReportDatasets,
  type ReportPeriod,
  type ThresholdConfig
} from "./domain";
import { average, computeFeedbackCoverage, selectQuestionRankings, sortMetricItems, sum } from "./metrics";

type ThresholdMap = Record<KpiMetricKey, ThresholdConfig>;

function buildMetricItem(
  id: string,
  label: string,
  value: number | null,
  delta?: number | null
): DashboardMetricItem {
  const item: DashboardMetricItem = { id, label, value };

  if (delta !== undefined) {
    item.delta = delta;
  }

  return item;
}

function buildMetricDeltaMap<TRecord extends { id: string; agentKey: string; agentName: string }>(
  current: TRecord[],
  previous: TRecord[],
  getValue: (record: TRecord) => number | null
): DashboardMetricItem[] {
  const previousMap = new Map(previous.map((record) => [record.agentKey, record]));

  return current
    .map((record) => {
      const previousRecord = previousMap.get(record.agentKey);
      const currentValue = getValue(record);
      const previousValue = previousRecord ? getValue(previousRecord) : null;

      if (currentValue === null) {
        return null;
      }

      return buildMetricItem(
        record.id,
        record.agentName,
        currentValue,
        previousValue === null ? null : Number((currentValue - previousValue).toFixed(2))
      );
    })
    .filter((record): record is DashboardMetricItem => Boolean(record));
}

function pickFirst(items: DashboardMetricItem[]): DashboardMetricItem | undefined {
  return items[0];
}

function buildLegacyAuditMetrics(agentMetrics: AgentMetric[]): AuditMetric[] {
  return agentMetrics
    .filter((record) => record.auditScore !== null || record.previousAuditAccuracy !== null)
    .map((record) => ({
      id: record.id,
      period: record.period,
      agentKey: record.agentKey,
      agentName: record.agentName,
      auditScore: record.auditScore,
      previousAuditAccuracy: record.previousAuditAccuracy
    }));
}

function getReportPeriodPriority(period: ReportPeriod) {
  if (period.status === "published") {
    return 3;
  }

  if (period.publishedAt) {
    return 2;
  }

  if (
    period.manualTotalCallCount !== undefined ||
    period.manualTotalChatMailCount !== undefined ||
    period.manualTotalTicketClosedCount !== undefined
  ) {
    return 1;
  }

  return 0;
}

export function selectDefaultReportPeriod(periods: ReportPeriod[]): ReportPeriod | undefined {
  if (!periods.length) {
    return undefined;
  }

  return [...periods].sort((left, right) => {
    const priorityDiff = getReportPeriodPriority(right) - getReportPeriodPriority(left);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const monthDiff = right.month.localeCompare(left.month);
    if (monthDiff !== 0) {
      return monthDiff;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  })[0];
}

export function selectAuditMetrics(datasets: Pick<ReportDatasets, "agentMetrics" | "auditMetrics">): AuditMetric[] {
  if (datasets.auditMetrics.length > 0) {
    return datasets.auditMetrics;
  }

  return buildLegacyAuditMetrics(datasets.agentMetrics);
}

function buildSummary(
  agentMetrics: AgentMetric[],
  auditMetrics: AuditMetric[],
  questionPerformance: QuestionPerformance[],
  qtMetrics: QtMetric[]
) {
  const agentKeys = new Set([
    ...agentMetrics.map((record) => record.agentKey),
    ...auditMetrics.map((record) => record.agentKey)
  ]);

  return {
    auditAverage: average(auditMetrics.map((record) => record.auditScore)),
    previousAuditAccuracyAverage: average(auditMetrics.map((record) => record.previousAuditAccuracy)),
    csatAverage: average(agentMetrics.map((record) => record.callEvaluationAverage)),
    qtCoverageAverage: average(qtMetrics.map((record) => record.feedbackCoverage)),
    totalConversationCount: sum(agentMetrics.map((record) => record.totalConversationCount)),
    agentCount: agentKeys.size,
    questionCount: questionPerformance.length,
    qtRepresentativeCount: qtMetrics.length
  };
}

function pickNullableMax(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => value !== null && value !== undefined);
  if (!filtered.length) {
    return null;
  }

  return Math.max(...filtered);
}

export function buildQtOverview(qtMetrics: QtMetric[]): QtOverview {
  const totalListeningSeconds = sum(qtMetrics.map((record) => record.listenedDurationSeconds));
  const totalListenedCallCount = sum(qtMetrics.map((record) => record.listenedCallCount));
  const totalEvaluatedCallCount = pickNullableMax(qtMetrics.map((record) => record.totalEvaluatedCallCount));
  const totalEvaluatedChatMailCount = pickNullableMax(
    qtMetrics.map((record) => record.totalEvaluatedChatMailCount)
  );
  const feedbackCount = pickNullableMax(qtMetrics.map((record) => record.feedbackCount));
  const feedbackCoverage = computeFeedbackCoverage(totalListeningSeconds / 3600, feedbackCount);

  return {
    rows: [...qtMetrics].sort((left, right) => right.listenedCallCount - left.listenedCallCount).map((record) => ({
      id: record.id,
      representativeName: record.representativeName,
      listenedCallCount: record.listenedCallCount,
      listenedDurationSeconds: record.listenedDurationSeconds
    })),
    summary: {
      totalListenedCallCount,
      totalListeningSeconds,
      totalEvaluatedCallCount,
      totalEvaluatedChatMailCount,
      totalEvaluatedCount:
        totalEvaluatedCallCount === null && totalEvaluatedChatMailCount === null
          ? null
          : (totalEvaluatedCallCount ?? 0) + (totalEvaluatedChatMailCount ?? 0),
      feedbackCount,
      feedbackCoverage
    }
  };
}

export function buildDashboardSnapshot(params: {
  period: ReportPeriod;
  compareToPeriod?: ReportPeriod;
  datasets: ReportDatasets;
  compareDatasets?: ReportDatasets;
  thresholds?: ThresholdMap;
}): DashboardSnapshot {
  const thresholds = params.thresholds ?? structuredClone(DEFAULT_THRESHOLDS);
  const currentAgents = params.datasets.agentMetrics;
  const compareAgents = params.compareDatasets?.agentMetrics ?? [];
  const currentAudits = selectAuditMetrics(params.datasets);
  const compareAudits = params.compareDatasets ? selectAuditMetrics(params.compareDatasets) : [];
  const auditItems = buildMetricDeltaMap(currentAudits, compareAudits, (record) => record.auditScore);
  const csatItems = buildMetricDeltaMap(currentAgents, compareAgents, (record) => record.callEvaluationAverage);
  const auditDesc = sortMetricItems(auditItems, "desc");
  const auditAsc = sortMetricItems(auditItems, "asc");
  const csatDesc = sortMetricItems(csatItems, "desc");
  const csatAsc = sortMetricItems(csatItems, "asc");
  const deltaSorted = [...auditItems].sort((left, right) => (right.delta ?? Number.NEGATIVE_INFINITY) - (left.delta ?? Number.NEGATIVE_INFINITY));
  const deltaAsc = [...auditItems].sort((left, right) => (left.delta ?? Number.POSITIVE_INFINITY) - (right.delta ?? Number.POSITIVE_INFINITY));
  const questionRankings = selectQuestionRankings(params.datasets.questionPerformance);
  const qtCoverage = [...params.datasets.qtMetrics].sort(
    (left, right) => (right.feedbackCoverage ?? Number.NEGATIVE_INFINITY) - (left.feedbackCoverage ?? Number.NEGATIVE_INFINITY)
  );
  const highlights: DashboardSnapshot["highlights"] = {};
  const bestAudit = pickFirst(auditDesc);
  const lowestAudit = pickFirst(auditAsc);
  const bestCsat = pickFirst(csatDesc);
  const lowestCsat = pickFirst(csatAsc);
  const mostImproved = pickFirst(deltaSorted);
  const mostDeclined = pickFirst(deltaAsc);

  if (bestAudit) highlights.bestAudit = bestAudit;
  if (lowestAudit) highlights.lowestAudit = lowestAudit;
  if (bestCsat) highlights.bestCsat = bestCsat;
  if (lowestCsat) highlights.lowestCsat = lowestCsat;
  if (mostImproved) highlights.mostImproved = mostImproved;
  if (mostDeclined) highlights.mostDeclined = mostDeclined;

  return {
    period: params.period,
    ...(params.compareToPeriod ? { compareToPeriod: params.compareToPeriod } : {}),
    summary: buildSummary(
      params.datasets.agentMetrics,
      currentAudits,
      params.datasets.questionPerformance,
      params.datasets.qtMetrics
    ),
    highlights,
    rankings: {
      auditTop: auditDesc.slice(0, 5),
      auditBottom: auditAsc.slice(0, 5),
      csatTop: csatDesc.slice(0, 5),
      csatBottom: csatAsc.slice(0, 5),
      risers: deltaSorted.filter((item) => item.delta !== null && item.delta !== undefined && item.delta > 0).slice(0, 5),
      fallers: deltaAsc.filter((item) => item.delta !== null && item.delta !== undefined && item.delta < 0).slice(0, 5),
      weakestQuestions: questionRankings.weakestQuestions,
      strongestQuestions: questionRankings.strongestQuestions,
      qtCoverage
    },
    datasets: params.datasets,
    thresholds
  };
}
