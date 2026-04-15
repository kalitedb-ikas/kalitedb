import { z } from "zod";

export const reportStatusSchema = z.enum(["draft", "published"]);
export const datasetTypeSchema = z.enum(["agent-metrics", "audit-metrics", "question-performance", "qt-metrics"]);
export const thresholdDirectionSchema = z.enum(["higher_is_better", "lower_is_better"]);
export const departmentSchema = z.enum(["cs", "sales", "quality", "partner"]);
export const managerLevelSchema = z.enum(["senior", "mid", "junior"]);
export const roleSchema = z.enum([
  // Yeni roller
  "admin",
  "manager",
  "team_leader",
  "quality",
  "representative",
  "viewer",
  // Eski roller (geriye dönük uyumluluk)
  "team",
  "ceo",
  "qt"
]);
export const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);

export const kpiMetricKeySchema = z.enum([
  "auditScore",
  "callEvaluationAverage",
  "localCloseRate",
  "avgTalkDurationSeconds",
  "feedbackCoverage"
]);

export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type DatasetType = z.infer<typeof datasetTypeSchema>;
export type ThresholdDirection = z.infer<typeof thresholdDirectionSchema>;
export type Department = z.infer<typeof departmentSchema>;
export type ManagerLevel = z.infer<typeof managerLevelSchema>;
export type Role = z.infer<typeof roleSchema>;
export type KpiMetricKey = z.infer<typeof kpiMetricKeySchema>;

export type ThresholdTone = "green" | "yellow" | "red" | "neutral";

export const reportPeriodSchema = z.object({
  id: z.string(),
  month: periodSchema,
  title: z.string().min(1),
  status: reportStatusSchema,
  department: departmentSchema.default("cs"),
  compareToPeriodId: z.string().optional(),
  manualTotalCallCount: z.number().int().nonnegative().nullable().optional(),
  manualTotalChatMailCount: z.number().int().nonnegative().nullable().optional(),
  manualTotalTicketClosedCount: z.number().int().nonnegative().nullable().optional(),
  publishedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const agentSchema = z.object({
  agentId: z.string(),
  displayName: z.string().min(1),
  active: z.boolean().default(true)
});

export const representativeStatusSchema = z.enum(["active", "departed", "department_changed"]);

export const timelineEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string().optional(),
  department: z.string().optional()
});

export const representativeSchema = z.object({
  key: z.string(),
  displayName: z.string().min(1),
  department: departmentSchema,
  status: representativeStatusSchema.default("active"),
  statusNote: z.string().optional(),
  badges: z.array(z.string()).default([]),
  timeline: z.array(timelineEventSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const nullableNumber = z.number().nullable();
const nullableInteger = z.number().int().nullable();

export const agentMetricSchema = z.object({
  id: z.string(),
  period: periodSchema,
  agentKey: z.string(),
  agentName: z.string().min(1),
  // Legacy alanlar: audit verisi artik ayri import ile yonetiliyor.
  auditScore: nullableNumber,
  previousAuditAccuracy: nullableNumber,
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

export const auditMetricSchema = z.object({
  id: z.string(),
  period: periodSchema,
  agentKey: z.string(),
  agentName: z.string().min(1),
  auditScore: nullableNumber,
  previousAuditAccuracy: nullableNumber
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
  departments: z.array(departmentSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// Bir kullanıcının tek bir departmandaki rol tanımı
export const userRoleEntrySchema = z.object({
  department: departmentSchema.optional(), // admin için boş (global erişim)
  role: roleSchema,
  level: managerLevelSchema.optional(),    // sadece manager için
  teamId: z.string().optional()            // team_leader / representative için
});

// Yeni kullanıcı dokümanı (userRoles'un yerini alır)
export const userSchema = z.object({
  uid: z.string().optional(),
  email: z.string().email(),
  displayName: z.string().optional(),
  role: roleSchema,                               // birincil rol (kural ve claim uyumu için)
  roles: z.array(userRoleEntrySchema).default([]), // tüm departman atamaları
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// Takım dokümanı
export const teamSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  department: departmentSchema,
  leaderEmail: z.string().email(),
  memberEmails: z.array(z.string().email()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const roleplayMetricSchema = z.object({
  agentKey: z.string(),
  agentName: z.string().min(1),
  rolePlayCount: z.number().int().nonnegative(),
  revOpsCount: z.number().int().nonnegative().nullable(),
  note: z.string().optional(),
  updatedAt: z.string().datetime()
});

export const trainingEventSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  color: z.string().default("#3b82f6"),
  participants: z.array(z.string()).default([]),
  trainer: z.string().optional(),
  department: departmentSchema.default("sales"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const salesEvaluationQuestionSchema = z.object({
  id: z.string(),
  questionText: z.string().min(1),
  answer: z.string().default(""),
  score: z.number(),
  updatedAt: z.string().datetime()
});

export const salesMeetingStatusSchema = z.enum(["devam_ediyor", "kapandi", "kaybedildi"]);

export const salesMeetingSchema = z.object({
  id: z.string(),
  periodId: z.string(),
  date: z.string().optional(),
  qualityMember: z.string().min(1),
  salesRepresentative: z.string().min(1),
  customerName: z.string().min(1),
  status: salesMeetingStatusSchema.optional(),
  licenseDetail: z.string().optional(),
  licenseAmount: z.number().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type SalesMeetingStatus = z.infer<typeof salesMeetingStatusSchema>;
export type SalesMeeting = z.infer<typeof salesMeetingSchema>;

/* ── Sales KPI ── */

export const salesKpiAgentSchema = z.object({
  agentKey: z.string(),
  agentName: z.string(),
  perfScore: z.number().nullable(),
  salesAmount: z.number(),
  licenseCount: z.number(),
  avgLicensePrice: z.number(),
  talkDurationSeconds: z.number(),
  callAttempts: z.number(),
  conversionRate: z.number(),
  scaleCount: z.number().default(0),
  scalePlusCount: z.number().default(0),
  scaleConversion: z.number().default(0),
  scalePlusConversion: z.number().default(0),
  totalConversion: z.number().default(0)
});

export const salesKpiTargetsSchema = z.object({
  perfScore: z.number(),
  salesAmount: z.number(),
  licenseCount: z.number(),
  avgLicensePrice: z.number(),
  talkDurationLabel: z.string(),
  // Aylık toplam konuşma süresi hedefi (saniye). talkDurationLabel gösterim
  // amaçlı serbest metin (ör. "35'"); bu alan sayısal karşılaştırma için
  // kullanılır. Eski kayıtlarda yoksa null olur; UI tarafında label'dan
  // parse edilerek fallback hesaplanır.
  talkDurationTargetSeconds: z.number().nullable().optional().default(null),
  callAttempts: z.number(),
  conversionRate: z.number(),
  /** Kişi başı aylık satış hedefi (TRY). salesAmount takım toplamıdır; radar
   *  ve bireysel karşılaştırmalar bu alanı kullanır. */
  perPersonSalesTarget: z.number().nullable().optional().default(null)
});

export const licenseSummarySchema = z.object({
  preCount: z.number(),
  scaleCount: z.number(),
  scale2Plus1Count: z.number(),
  scalePlusCount: z.number(),
  scalePlus2Plus1Count: z.number()
});

export const salesKpiDataSchema = z.object({
  targets: salesKpiTargetsSchema,
  agents: z.array(salesKpiAgentSchema),
  licenseSummary: licenseSummarySchema.optional(),
  updatedAt: z.string()
});

export type SalesKpiAgent = z.infer<typeof salesKpiAgentSchema>;
export type SalesKpiTargets = z.infer<typeof salesKpiTargetsSchema>;
export type SalesKpiData = z.infer<typeof salesKpiDataSchema>;
export type LicenseSummary = z.infer<typeof licenseSummarySchema>;

export const qtManualEntrySchema = z.object({
  id: z.string(),
  periodId: z.string(),
  userKey: z.string(),
  userEmail: z.string().email(),
  userName: z.string().min(1),
  totalListeningHours: nullableNumber.optional().default(null),
  totalEvaluatedCallCount: nullableInteger.optional().default(null),
  totalEvaluatedChatMailCount: nullableInteger.optional().default(null),
  feedbackCount: nullableInteger.optional().default(null),
  feedbackCoverage: nullableNumber.optional().default(null),
  trainingCount: nullableInteger.optional().default(null),
  meetingCount: nullableInteger.optional().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type RepresentativeStatus = z.infer<typeof representativeStatusSchema>;
export type Representative = z.infer<typeof representativeSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type AgentMetric = z.infer<typeof agentMetricSchema>;
export type AuditMetric = z.infer<typeof auditMetricSchema>;
export type QuestionPerformance = z.infer<typeof questionPerformanceSchema>;
export type QtMetric = z.infer<typeof qtMetricSchema>;
export type ThresholdConfig = z.infer<typeof thresholdConfigSchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
export type UserRoleAssignment = z.infer<typeof userRoleAssignmentSchema>;
export type UserRoleEntry = z.infer<typeof userRoleEntrySchema>;
export type User = z.infer<typeof userSchema>;
export type Team = z.infer<typeof teamSchema>;
export type RoleplayMetric = z.infer<typeof roleplayMetricSchema>;
export type TrainingEvent = z.infer<typeof trainingEventSchema>;
export type SalesEvaluationQuestion = z.infer<typeof salesEvaluationQuestionSchema>;
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
  auditMetrics: AuditMetric[];
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
  previousAuditAccuracyAverage: number | null;
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
    label: "Audit skoru",
    direction: "higher_is_better",
    // Yönetim hedefi:
    // - < 60 -> sıkıntı (red)
    // - >= 77 -> operasyonel hedef tutuyor (green)
    // - 60 - 76.99 -> izlenmeli (yellow)
    red: 60,
    yellow: 60,
    green: 77,
    unit: "percent"
  },
  callEvaluationAverage: {
    metric: "callEvaluationAverage",
    label: "Çağrı değerlendirme ortalaması",
    direction: "higher_is_better",
    // CSAT hedef/iyi eşik:
    // - >= 4.85 -> iyi (green)
    // - 4.80 - 4.84 -> geliştirilmeli (yellow)
    // - < 4.80 -> risk (red)
    red: 4.8,
    yellow: 4.8,
    green: 4.85,
    unit: "number"
  },
  localCloseRate: {
    metric: "localCloseRate",
    label: "Lokal kapatma oranı",
    direction: "higher_is_better",
    red: 70,
    yellow: 85,
    green: 92,
    unit: "percent"
  },
  avgTalkDurationSeconds: {
    metric: "avgTalkDurationSeconds",
    label: "Ortalama konuşma süresi",
    direction: "lower_is_better",
    red: 420,
    yellow: 360,
    green: 300,
    unit: "seconds"
  },
  feedbackCoverage: {
    metric: "feedbackCoverage",
    label: "Saat başına geri bildirim",
    direction: "higher_is_better",
    red: 1.5,
    yellow: 2,
    green: 3,
    unit: "number"
  }
};

/* ── RAMP Scoring ── */

export const rampEntrySchema = z.object({
  agentKey: z.string(),
  pipeline: z.number().default(0),
  growAmount: z.number().default(0),
  scaleAmount: z.number().default(0),
  scalePlusAmount: z.number().default(0),
  updatedAt: z.string().datetime()
});

export const rampTargetsSchema = z.object({
  touchesTarget: z.number().default(1500),
  talkTimeTargetSeconds: z.number().default(144000),
  wsaTarget: z.number().default(200000),
  pipelineCoverage: z.number().default(3),
  updatedAt: z.string().datetime()
});

export type RampEntry = z.infer<typeof rampEntrySchema>;
export type RampTargets = z.infer<typeof rampTargetsSchema>;
