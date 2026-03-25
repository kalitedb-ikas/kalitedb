import {
  agentMetricSchema,
  auditMetricSchema,
  computeFeedbackCoverage,
  computeQuestionAccuracy,
  computeTotalConversationCount,
  questionPerformanceSchema,
  qtMetricSchema,
  type AgentMetric,
  type AuditMetric,
  type DatasetType,
  type QuestionPerformance,
  type QtMetric
} from "@kalitedb/shared";

type DatasetRecordMap = {
  "agent-metrics": AgentMetric;
  "audit-metrics": AuditMetric;
  "question-performance": QuestionPerformance;
  "qt-metrics": QtMetric;
};

export function sanitizeEditedRecord(
  datasetType: "agent-metrics",
  current: AgentMetric,
  updates: Partial<AgentMetric>
): AgentMetric;
export function sanitizeEditedRecord(
  datasetType: "audit-metrics",
  current: AuditMetric,
  updates: Partial<AuditMetric>
): AuditMetric;
export function sanitizeEditedRecord(
  datasetType: "question-performance",
  current: QuestionPerformance,
  updates: Partial<QuestionPerformance>
): QuestionPerformance;
export function sanitizeEditedRecord(
  datasetType: "qt-metrics",
  current: QtMetric,
  updates: Partial<QtMetric>
): QtMetric;
export function sanitizeEditedRecord(
  datasetType: DatasetType,
  current: DatasetRecordMap[DatasetType],
  updates: Partial<DatasetRecordMap[DatasetType]>
): DatasetRecordMap[DatasetType] {
  if (datasetType === "agent-metrics") {
    const merged = {
      ...(current as AgentMetric),
      ...(updates as Partial<AgentMetric>)
    };
    const next = {
      ...merged,
      totalConversationCount: computeTotalConversationCount(
        merged.totalCallCount,
        merged.totalChatMailCount,
        merged.totalTicketClosedCount
      )
    };

    return agentMetricSchema.parse(next);
  }

  if (datasetType === "question-performance") {
    const merged = {
      ...(current as QuestionPerformance),
      ...(updates as Partial<QuestionPerformance>)
    };
    const next = {
      ...merged,
      accuracyRate: computeQuestionAccuracy(merged.correctCount, merged.wrongCount)
    };

    return questionPerformanceSchema.parse(next);
  }

  if (datasetType === "audit-metrics") {
    return auditMetricSchema.parse({
      ...(current as AuditMetric),
      ...(updates as Partial<AuditMetric>)
    });
  }

  const merged = {
    ...(current as QtMetric),
    ...(updates as Partial<QtMetric>)
  };
  const next = {
    ...merged,
    feedbackCoverage: computeFeedbackCoverage(
      merged.listenedDurationSeconds / 3600,
      merged.feedbackCount
    )
  };

  return qtMetricSchema.parse(next);
}
