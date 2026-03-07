import {
  DEFAULT_THRESHOLDS,
  type AgentMetric,
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

function buildAgentDeltaMap(
  current: AgentMetric[],
  previous: AgentMetric[],
  metric: "auditScore" | "callEvaluationAverage"
): DashboardMetricItem[] {
  const previousMap = new Map(previous.map((record) => [record.agentKey, record]));

  return current
    .map((record) => {
      const previousRecord = previousMap.get(record.agentKey);
      const currentValue = record[metric];
      const previousValue = previousRecord?.[metric] ?? null;

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

function buildSummary(agentMetrics: AgentMetric[], questionPerformance: QuestionPerformance[], qtMetrics: QtMetric[]) {
  return {
    auditAverage: average(agentMetrics.map((record) => record.auditScore)),
    missingQuestionsAverage: average(agentMetrics.map((record) => record.missingQuestionsAccuracy)),
    csatAverage: average(agentMetrics.map((record) => record.callEvaluationAverage)),
    qtCoverageAverage: average(qtMetrics.map((record) => record.feedbackCoverage)),
    totalConversationCount: sum(agentMetrics.map((record) => record.totalConversationCount)),
    agentCount: agentMetrics.length,
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
  const auditItems = buildAgentDeltaMap(currentAgents, compareAgents, "auditScore");
  const csatItems = buildAgentDeltaMap(currentAgents, compareAgents, "callEvaluationAverage");
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
