import { z } from "zod";

export const reportStatusSchema = z.enum(["draft", "published"]);
export const datasetTypeSchema = z.enum(["agent-metrics", "question-performance", "qt-metrics"]);
export const thresholdDirectionSchema = z.enum(["higher_is_better", "lower_is_better"]);
export const roleSchema = z.enum(["admin", "team", "ceo"]);
export const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);

export const kpiMetricKeySchema = z.enum([
  "auditScore",
  "missingQuestionsAccuracy",
  "callEvaluationAverage",
  "localCloseRate",
  "avgTalkDurationSeconds",
  "feedbackCoverage"
]);

export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type DatasetType = z.infer<typeof datasetTypeSchema>;
export type ThresholdDirection = z.infer<typeof thresholdDirectionSchema>;
export type Role = z.infer<typeof roleSchema>;
export type KpiMetricKey = z.infer<typeof kpiMetricKeySchema>;

export type ThresholdTone = "green" | "yellow" | "red" | "neutral";

export const reportPeriodSchema = z.object({
  id: z.string(),
  month: periodSchema,
  title: z.string().min(1),
  status: reportStatusSchema,
  compareToPeriodId: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const agentSchema = z.object({
  agentId: z.string(),
  displayName: z.string().min(1),
  active: z.boolean().default(true)
});

const nullableNumber = z.number().nullable();
const nullableInteger = z.number().int().nullable();

export const agentMetricSchema = z.object({
  id: z.string(),
  period: periodSchema,
  agentKey: z.string(),
  agentName: z.string().min(1),
  auditScore: nullableNumber,
  previousAuditAccuracy: nullableNumber,
  missingQuestionsAccuracy: nullableNumber,
  totalCallCount: z.number().int().nonnegative(),
  totalChatMailCount: z.number().int().nonnegative(),
  totalTicketClosedCount: z.number().int().nonnegative(),
  totalConversationCount: z.number().int().nonnegative(),
  avgTalkDurationSeconds: nullableInteger,
  localCloseRate: nullableNumber,
  missedCalls: nullableInteger,
  callEvaluationAverage: nullableNumber,
  evaluationCount: nullableInteger
});

export const questionPerformanceSchema = z.object({
  id: z.string(),
  period: periodSchema,
  topic: z.string().min(1),
  questionText: z.string().min(1),
  correctCount: z.number().int().nonnegative(),
  wrongCount: z.number().int().nonnegative(),
  accuracyRate: z.number().min(0).max(100)
});

export const qtMetricSchema = z.object({
  id: z.string(),
  period: periodSchema,
  representativeKey: z.string(),
  representativeName: z.string().min(1),
  listenedCallCount: z.number().int().nonnegative(),
  listenedDurationSeconds: z.number().int().nonnegative(),
  totalEvaluatedCallCount: nullableInteger,
  totalEvaluatedChatMailCount: nullableInteger,
  feedbackCount: nullableInteger,
  feedbackCoverage: nullableNumber
});

export const thresholdConfigSchema = z.object({
  metric: kpiMetricKeySchema,
  label: z.string().min(1),
  direction: thresholdDirectionSchema,
  red: z.number(),
  yellow: z.number(),
  green: z.number(),
  unit: z.enum(["number", "percent", "seconds"])
});

export const importJobStatusSchema = z.enum(["previewed", "imported", "failed"]);

export const importJobSchema = z.object({
  id: z.string(),
  periodId: z.string(),
  datasetType: datasetTypeSchema,
  sha256: z.string(),
  storagePath: z.string(),
  status: importJobStatusSchema,
  rowCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  uploadedBy: z.string(),
  uploadedAt: z.string().datetime()
});

export const userRoleAssignmentSchema = z.object({
  uid: z.string().optional(),
  email: z.string().email(),
  role: roleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const qtManualEntrySchema = z.object({
  id: z.string(),
  periodId: z.string(),
  userKey: z.string(),
  userEmail: z.string().email(),
  userName: z.string().min(1),
  totalEvaluatedCallCount: nullableInteger,
  totalEvaluatedChatMailCount: nullableInteger,
  feedbackCount: nullableInteger,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type AgentMetric = z.infer<typeof agentMetricSchema>;
export type QuestionPerformance = z.infer<typeof questionPerformanceSchema>;
export type QtMetric = z.infer<typeof qtMetricSchema>;
export type ThresholdConfig = z.infer<typeof thresholdConfigSchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
export type UserRoleAssignment = z.infer<typeof userRoleAssignmentSchema>;
export type QtManualEntry = z.infer<typeof qtManualEntrySchema>;

export type ImportPreviewError = {
  row: number;
  field?: string;
  message: string;
};

export type CsvImportPreview<TRecord> = {
  datasetType: DatasetType;
  sha256: string;
  rowCount: number;
  validRows: TRecord[];
  previewRows: TRecord[];
  errors: ImportPreviewError[];
};

export type ReportDatasets = {
  agentMetrics: AgentMetric[];
  questionPerformance: QuestionPerformance[];
  qtMetrics: QtMetric[];
};

export type DashboardMetricItem = {
  id: string;
  label: string;
  value: number | null;
  delta?: number | null;
};

export type DashboardSummary = {
  auditAverage: number | null;
  missingQuestionsAverage: number | null;
  csatAverage: number | null;
  qtCoverageAverage: number | null;
  totalConversationCount: number;
  agentCount: number;
  questionCount: number;
  qtRepresentativeCount: number;
};

export type QtOverviewRow = {
  id: string;
  representativeName: string;
  listenedCallCount: number;
  listenedDurationSeconds: number;
};

export type QtOverviewSummary = {
  totalListenedCallCount: number;
  totalListeningSeconds: number;
  totalEvaluatedCallCount: number | null;
  totalEvaluatedChatMailCount: number | null;
  totalEvaluatedCount: number | null;
  feedbackCount: number | null;
  feedbackCoverage: number | null;
};

export type QtOverview = {
  rows: QtOverviewRow[];
  summary: QtOverviewSummary;
};

export type DashboardSnapshot = {
  period: ReportPeriod;
  compareToPeriod?: ReportPeriod;
  summary: DashboardSummary;
  highlights: {
    bestAudit?: DashboardMetricItem;
    lowestAudit?: DashboardMetricItem;
    bestCsat?: DashboardMetricItem;
    lowestCsat?: DashboardMetricItem;
    mostImproved?: DashboardMetricItem;
    mostDeclined?: DashboardMetricItem;
  };
  rankings: {
    auditTop: DashboardMetricItem[];
    auditBottom: DashboardMetricItem[];
    csatTop: DashboardMetricItem[];
    csatBottom: DashboardMetricItem[];
    risers: DashboardMetricItem[];
    fallers: DashboardMetricItem[];
    weakestQuestions: QuestionPerformance[];
    strongestQuestions: QuestionPerformance[];
    qtCoverage: QtMetric[];
  };
  datasets: ReportDatasets;
  thresholds: Record<KpiMetricKey, ThresholdConfig>;
};

export const DEFAULT_THRESHOLDS: Record<KpiMetricKey, ThresholdConfig> = {
  auditScore: {
    metric: "auditScore",
    label: "Audit Skoru",
    direction: "higher_is_better",
    red: 60,
    yellow: 80,
    green: 90,
    unit: "percent"
  },
  missingQuestionsAccuracy: {
    metric: "missingQuestionsAccuracy",
    label: "Kayıp Soruları Bilme Oranı",
    direction: "higher_is_better",
    red: 60,
    yellow: 80,
    green: 90,
    unit: "percent"
  },
  callEvaluationAverage: {
    metric: "callEvaluationAverage",
    label: "Çağrı Değerlendirme Ortalaması",
    direction: "higher_is_better",
    red: 4.8,
    yellow: 4.9,
    green: 4.97,
    unit: "number"
  },
  localCloseRate: {
    metric: "localCloseRate",
    label: "Lokal Kapatma Oranı",
    direction: "higher_is_better",
    red: 70,
    yellow: 85,
    green: 92,
    unit: "percent"
  },
  avgTalkDurationSeconds: {
    metric: "avgTalkDurationSeconds",
    label: "Ortalama Konuşma Süresi",
    direction: "lower_is_better",
    red: 420,
    yellow: 360,
    green: 300,
    unit: "seconds"
  },
  feedbackCoverage: {
    metric: "feedbackCoverage",
    label: "Saat Başına Geri Bildirim",
    direction: "higher_is_better",
    red: 1.5,
    yellow: 2,
    green: 3,
    unit: "number"
  }
};
