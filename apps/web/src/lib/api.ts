import type {
  AgentMetric,
  AuditMetric,
  Department,
  Representative,
  Role,
  RoleplayMetric,
  ReportDatasets,
  DashboardSnapshot,
  DatasetType,
  KpiMetricKey,
  QtManualEntry,
  ReportPeriod,
  SalesEvaluationQuestion,
  SalesKpiData,
  SalesMeeting,
  ThresholdConfig,
  TrainingEvent,
  UserRoleAssignment,
  UserRoleEntry,
  VoiceCoachCoaching,
  VoiceCoachScenario,
  VoiceCoachSession,
  VoiceCoachTranscriptTurn,
  RoleplayScenario,
  RoleplayScenarioInput,
  RoleplayKnowledgeDoc,
  RoleplayKnowledgeDocInput
} from "@kalitedb/shared";
import {
  agentMetricSchema,
  auditMetricSchema,
  buildDashboardSnapshot,
  DEFAULT_THRESHOLDS as DEFAULT_THRESHOLD_MAP,
  questionPerformanceSchema,
  qtManualEntrySchema,
  qtMetricSchema,
  reportPeriodSchema,
  representativeSchema,
  roleplayMetricSchema,
  roleSchema,
  salesEvaluationQuestionSchema,
  salesKpiDataSchema,
  salesMeetingSchema,
  normalizeKey,
  selectDefaultReportPeriod,
  thresholdConfigSchema,
  trainingEventSchema,
  userRoleAssignmentSchema
} from "@kalitedb/shared";
import { onAuthStateChanged } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, getDocsFromServer, orderBy, query, setDoc, where } from "firebase/firestore";

import { toPublicAssetPath } from "./asset-path";
import { firebaseAuth, firebaseDb } from "./firebase";

const CONFIGURED_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
const LOCAL_API_BASE_URL = "http://localhost:3001";
const LOCALTUNNEL_BYPASS_HEADER = "bypass-tunnel-reminder";

type ApiResponse<T> = {
  data: T;
};

export type AuthenticatedUser = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  roles?: UserRoleEntry[];
};

type ResetDatasetResponse = {
  datasetType: DatasetType;
  periodId: string;
  reset: true;
};

type RequestOptions = {
  token: string | null;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  formData?: FormData;
};

type PeriodDetailsOptions = {
  datasetTypes?: DatasetType[] | undefined;
  includeImportJobs?: boolean | undefined;
};

type DashboardOptions = {
  datasetTypes?: DatasetType[] | undefined;
};

type PublicFallbackPayload = {
  generatedAt: string;
  periods: ReportPeriod[];
  dashboards: Record<string, DashboardSnapshot>;
};

type QtManualEntryTarget = {
  targetUserEmail?: string;
  targetUserName?: string;
};

let publicFallbackPromise: Promise<PublicFallbackPayload | null> | undefined;

const ALL_DATASET_TYPES: DatasetType[] = ["agent-metrics", "audit-metrics", "question-performance", "qt-metrics"];

function emptyDatasets(): ReportDatasets {
  return {
    agentMetrics: [],
    auditMetrics: [],
    questionPerformance: [],
    qtMetrics: []
  };
}

function normalizeRoleEmail(email: string) {
  return email.trim().toLocaleLowerCase("tr-TR");
}

function normalizeQtEntryKey(email: string) {
  return normalizeRoleEmail(email);
}

function canUseFirebaseReadMode() {
  return Boolean(firebaseDb);
}

function canUseFirebaseClientFallback() {
  return Boolean(firebaseDb && firebaseAuth?.currentUser);
}

/**
 * Firebase Auth oturum durumunu bekler. Dev token modunda bile Firebase
 * IndexedDB'den önceki Google oturumunu geri yükleyebilir — bu yüzden
 * auth state'in resolve olmasını bekliyoruz.
 */
function waitForFirebaseAuth(timeoutMs = 3000): Promise<boolean> {
  if (!firebaseAuth || !firebaseDb) return Promise.resolve(false);
  if (firebaseAuth.currentUser) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    const unsubscribe = onAuthStateChanged(firebaseAuth!, (user) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(Boolean(user));
    });
  });
}

/**
 * Firebase yapılandırılmış ama oturum yoksa anlamlı hata fırlat.
 * API sunucusu kapalıyken kullanıcıyı yönlendirmek için.
 */
function assertFirebaseAuthOrThrow(hasAuth: boolean): asserts hasAuth is true {
  if (!hasAuth) {
    throw new Error(
      "Veritabanına erişim yok. Google ile oturum açın veya API sunucusunu başlatın."
    );
  }
}

function isFirebasePreferredHost() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return hostname.endsWith("github.io") || hostname === "localhost" || hostname === "127.0.0.1";
}

function shouldPreferFirebaseReadMode() {
  return canUseFirebaseReadMode() && isFirebasePreferredHost();
}

function shouldPreferFirebaseClientMode() {
  return canUseFirebaseClientFallback() && isFirebasePreferredHost();
}

async function getFirebaseCurrentUser() {
  const currentUser = firebaseAuth?.currentUser;

  if (!currentUser || !currentUser.email) {
    throw new Error("Firebase oturumu bulunamadı.");
  }

  return currentUser;
}

async function resolveFirebaseRole(email: string): Promise<Role | null> {
  const tokenResult = await firebaseAuth?.currentUser?.getIdTokenResult();
  const claimRole = roleSchema.safeParse(tokenResult?.claims.role);

  if (claimRole.success) {
    return claimRole.data;
  }

  if (!firebaseDb) {
    return null;
  }

  const roleSnapshot = await getDoc(doc(firebaseDb, "userRoles", normalizeRoleEmail(email)));

  if (!roleSnapshot.exists()) {
    return null;
  }

  const parsedRoleAssignment = userRoleAssignmentSchema.safeParse(roleSnapshot.data());
  if (parsedRoleAssignment.success) {
    return parsedRoleAssignment.data.role;
  }

  const parsedRole = roleSchema.safeParse(roleSnapshot.data().role);
  return parsedRole.success ? parsedRole.data : null;
}

async function getMeFromFirebase(): Promise<AuthenticatedUser> {
  const currentUser = await getFirebaseCurrentUser();
  let role = await resolveFirebaseRole(currentUser.email!);

  // Dev modunda rol bulunamazsa otomatik admin kaydı oluştur (bootstrap)
  if (!role && import.meta.env.VITE_DEV_AUTH_MODE === "true" && firebaseDb) {
    const emailKey = normalizeRoleEmail(currentUser.email!);
    try {
      await setDoc(doc(firebaseDb, "userRoles", emailKey), {
        email: currentUser.email!,
        role: "admin"
      });
      role = "admin";
      console.info(`[KaliteDB] Dev bootstrap: ${currentUser.email} → admin rolü oluşturuldu.`);
    } catch {
      // Firestore kuralları izin vermiyorsa sessizce geç
    }
  }

  if (!role) {
    throw new Error("Kullanıcı rol tanımı bulunamadı.");
  }

  return {
    uid: currentUser.uid,
    email: currentUser.email!,
    displayName: currentUser.displayName ?? currentUser.email!,
    role
  };
}

async function getPeriodsFromFirebase(): Promise<ReportPeriod[]> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const snapshot = await getDocs(query(collection(firebaseDb, "reportPeriods"), orderBy("month", "desc")));

  return snapshot.docs
    .map((periodDoc) => reportPeriodSchema.safeParse({ id: periodDoc.id, ...(periodDoc.data() ?? {}) }))
    .filter((period): period is { success: true; data: ReportPeriod } => period.success)
    .map((period) => period.data)
    .sort((left, right) => right.month.localeCompare(left.month));
}

async function getThresholdsFromFirebase(): Promise<Record<KpiMetricKey, ThresholdConfig>> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const thresholds = structuredClone(DEFAULT_THRESHOLD_MAP);
  const snapshot = await getDocs(collection(firebaseDb, "thresholdConfigs"));

  snapshot.forEach((thresholdDoc) => {
    const parsed = thresholdConfigSchema.safeParse(thresholdDoc.data());

    if (!parsed.success) {
      return;
    }

    thresholds[thresholdDoc.id as KpiMetricKey] = parsed.data;
  });

  return thresholds;
}

async function getRolesFromFirebase(): Promise<UserRoleAssignment[]> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const currentUser = await getFirebaseCurrentUser();
  const currentRole = await resolveFirebaseRole(currentUser.email!);

  if (currentRole !== "admin") {
    throw new Error("Rol listesi yalnızca admin kullanıcılar için kullanılabilir.");
  }

  const snapshot = await getDocs(collection(firebaseDb, "userRoles"));

  return snapshot.docs
    .map((roleDoc) => userRoleAssignmentSchema.safeParse(roleDoc.data()))
    .filter((role): role is { success: true; data: UserRoleAssignment } => role.success)
    .map((role) => role.data)
    .sort((left, right) => left.email.localeCompare(right.email, "tr"));
}

async function getRepresentativesFromFirebase(): Promise<Representative[]> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  // Cache'den değil sunucudan oku - yeni eklenen temsilcilerin hemen görünmesi için
  let snapshot;
  try {
    snapshot = await getDocsFromServer(query(collection(firebaseDb, "representatives"), orderBy("displayName", "asc")));
  } catch {
    // Sunucu erişilemezse cache'den oku
    snapshot = await getDocs(query(collection(firebaseDb, "representatives"), orderBy("displayName", "asc")));
  }

  const results: Representative[] = [];
  for (const repDoc of snapshot.docs) {
    const raw = { key: repDoc.id, ...repDoc.data() };
    const parsed = representativeSchema.safeParse(raw);
    if (parsed.success) {
      results.push(parsed.data);
    } else {
      console.warn("[KaliteDB] Temsilci parse hatası:", repDoc.id, parsed.error.issues);
    }
  }
  const salesCount = results.filter((r) => r.department === "sales").length;
  const csCount = results.filter((r) => r.department === "cs").length;
  console.info(`[KaliteDB] Temsilciler yüklendi: ${results.length} toplam (CS: ${csCount}, Satış: ${salesCount})`);
  return results;
}

async function populateRepresentativesFromFirebase(): Promise<{ created: number; existing: number }> {
  if (!firebaseDb) throw new Error("Firebase veritabanı hazır değil.");

  // Mevcut temsilcileri al
  const existingSnap = await getDocs(collection(firebaseDb, "representatives"));
  const existingKeys = new Set(existingSnap.docs.map((d) => d.id));

  // Tüm dönemlerden agent isimlerini topla
  const periodsSnap = await getDocs(collection(firebaseDb, "reportPeriods"));
  const agentMap = new Map<string, { name: string; department: Department }>();

  for (const periodDoc of periodsSnap.docs) {
    const periodData = periodDoc.data();
    const dept = (periodData.department ?? "cs") as "cs" | "sales";

    // agentMetrics
    const amSnap = await getDocs(collection(firebaseDb, "reportPeriods", periodDoc.id, "agentMetrics"));
    for (const amDoc of amSnap.docs) {
      const data = amDoc.data();
      if (data.agentName) agentMap.set(normalizeKey(data.agentName), { name: data.agentName, department: dept });
    }

    // auditMetrics
    const auSnap = await getDocs(collection(firebaseDb, "reportPeriods", periodDoc.id, "auditMetrics"));
    for (const auDoc of auSnap.docs) {
      const data = auDoc.data();
      if (data.agentName) agentMap.set(normalizeKey(data.agentName), { name: data.agentName, department: dept });
    }

    // salesKpiData (satış temsilcileri)
    if (dept === "sales") {
      try {
        const kpiSnap = await getDoc(doc(firebaseDb, "reportPeriods", periodDoc.id, "salesKpiData", "main"));
        if (kpiSnap.exists()) {
          const kpiData = kpiSnap.data();
          for (const agent of kpiData.agents ?? []) {
            if (agent.agentName) {
              const key = agent.agentKey || normalizeKey(agent.agentName);
              agentMap.set(key, { name: agent.agentName, department: "sales" });
            }
          }
        }
      } catch { /* salesKpiData okunamazsa devam et */ }
    }
  }

  let created = 0;
  const now = new Date().toISOString();
  for (const [key, info] of agentMap) {
    if (!existingKeys.has(key)) {
      await setDoc(doc(firebaseDb, "representatives", key), {
        key,
        displayName: info.name,
        department: info.department,
        status: "active",
        badges: [],
        timeline: [],
        createdAt: now,
        updatedAt: now
      });
      created++;
    }
  }

  return { created, existing: existingKeys.size };
}

/**
 * Firebase ve API kullanılamadığında, public-fallback'teki dönem verilerinden
 * temsilci listesi türetir.
 */
async function deriveRepresentativesFromFallback(): Promise<Representative[]> {
  const fallback = await loadPublicFallback();
  if (!fallback) return [];

  const agentMap = new Map<string, { name: string; department: Department }>();
  const now = new Date().toISOString();

  for (const [periodId, dashboard] of Object.entries(fallback.dashboards)) {
    const period = fallback.periods.find((p) => p.id === periodId);
    const dept = period?.department ?? "cs";

    for (const record of dashboard.datasets.agentMetrics ?? []) {
      if (record.agentKey && record.agentName) {
        agentMap.set(record.agentKey, { name: record.agentName, department: dept });
      }
    }
    for (const record of dashboard.datasets.auditMetrics ?? []) {
      if (record.agentKey && record.agentName) {
        agentMap.set(record.agentKey, { name: record.agentName, department: dept });
      }
    }
  }

  return Array.from(agentMap.entries())
    .map(([key, info]) => ({
      key,
      displayName: info.name,
      department: info.department,
      status: "active" as const,
      badges: [],
      timeline: [],
      createdAt: now,
      updatedAt: now
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
}

async function getReportPeriodFromFirebase(periodId: string, knownPeriods?: ReportPeriod[]) {
  const knownPeriod = knownPeriods?.find((period) => period.id === periodId);
  if (knownPeriod) {
    return knownPeriod;
  }

  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const periodSnapshot = await getDoc(doc(firebaseDb, "reportPeriods", periodId));
  if (!periodSnapshot.exists()) {
    throw new Error("Dönem bulunamadı.");
  }

  const parsedPeriod = reportPeriodSchema.safeParse({ id: periodSnapshot.id, ...(periodSnapshot.data() ?? {}) });
  if (!parsedPeriod.success) {
    throw new Error("Dönem verisi okunamadı.");
  }

  return parsedPeriod.data;
}

async function getPeriodDatasetsFromFirebase(periodId: string, datasetTypes?: DatasetType[]): Promise<ReportDatasets> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const selectedTypes = new Set(datasetTypes?.length ? datasetTypes : ALL_DATASET_TYPES);

  const [agentMetrics, auditMetrics, questionPerformance, qtMetrics] = await Promise.all([
    selectedTypes.has("agent-metrics")
      ? getDocs(collection(firebaseDb, "reportPeriods", periodId, "agentMetrics")).then((snapshot) =>
          snapshot.docs
            .map((recordDoc) => agentMetricSchema.safeParse(recordDoc.data()))
            .filter((record): record is { success: true; data: ReportDatasets["agentMetrics"][number] } => record.success)
            .map((record) => record.data)
        )
      : Promise.resolve(emptyDatasets().agentMetrics),
    selectedTypes.has("audit-metrics")
      ? getDocs(collection(firebaseDb, "reportPeriods", periodId, "auditMetrics")).then((snapshot) =>
          snapshot.docs
            .map((recordDoc) => auditMetricSchema.safeParse(recordDoc.data()))
            .filter((record): record is { success: true; data: ReportDatasets["auditMetrics"][number] } => record.success)
            .map((record) => record.data)
        )
      : Promise.resolve(emptyDatasets().auditMetrics),
    selectedTypes.has("question-performance")
      ? getDocs(collection(firebaseDb, "reportPeriods", periodId, "questionPerformance")).then((snapshot) =>
          snapshot.docs
            .map((recordDoc) => questionPerformanceSchema.safeParse(recordDoc.data()))
            .filter(
              (record): record is { success: true; data: ReportDatasets["questionPerformance"][number] } =>
                record.success
            )
            .map((record) => record.data)
        )
      : Promise.resolve(emptyDatasets().questionPerformance),
    selectedTypes.has("qt-metrics")
      ? getDocs(collection(firebaseDb, "reportPeriods", periodId, "qtMetrics")).then((snapshot) =>
          snapshot.docs
            .map((recordDoc) => qtMetricSchema.safeParse(recordDoc.data()))
            .filter((record): record is { success: true; data: ReportDatasets["qtMetrics"][number] } => record.success)
            .map((record) => record.data)
        )
      : Promise.resolve(emptyDatasets().qtMetrics)
  ]);

  return {
    agentMetrics,
    auditMetrics,
    questionPerformance,
    qtMetrics
  };
}

async function getPeriodDetailsFromFirebase(
  periodId: string,
  options?: PeriodDetailsOptions
): Promise<{
  period: ReportPeriod;
  datasets: ReportDatasets;
  importJobs: Array<{
    id: string;
    datasetType: DatasetType;
    uploadedAt: string;
    uploadedBy: string;
    rowCount: number;
    errorCount: number;
    status: string;
  }>;
}> {
  const periods = await getPeriodsFromFirebase();
  const period = await getReportPeriodFromFirebase(periodId, periods);
  const datasets = await getPeriodDatasetsFromFirebase(periodId, options?.datasetTypes);

  return {
    period,
    datasets,
    importJobs: []
  };
}

async function getDashboardFromFirebase(
  periodId?: string,
  compareToPeriodId?: string,
  options?: DashboardOptions
): Promise<DashboardSnapshot> {
  const periods = await getPeriodsFromFirebase();
  const fallbackPeriodId = selectDefaultReportPeriod(periods)?.id;
  const resolvedPeriodId =
    periodId && (firebaseAuth?.currentUser || periods.some((period) => period.id === periodId))
      ? periodId
      : fallbackPeriodId;

  if (!resolvedPeriodId) {
    throw new Error("Gösterilecek dönem bulunamadı.");
  }

  const resolvedCompareToPeriodId =
    compareToPeriodId && (firebaseAuth?.currentUser || periods.some((period) => period.id === compareToPeriodId))
      ? compareToPeriodId
      : undefined;

  const [currentPeriod, currentDatasets, thresholds, compareToPeriod, compareDatasets] = await Promise.all([
    getReportPeriodFromFirebase(resolvedPeriodId, periods),
    getPeriodDatasetsFromFirebase(resolvedPeriodId, options?.datasetTypes),
    getThresholdsFromFirebase(),
    resolvedCompareToPeriodId
      ? getReportPeriodFromFirebase(resolvedCompareToPeriodId, periods)
      : Promise.resolve(undefined),
    resolvedCompareToPeriodId
      ? getPeriodDatasetsFromFirebase(resolvedCompareToPeriodId, options?.datasetTypes)
      : Promise.resolve(undefined)
  ]);

  return buildDashboardSnapshot({
    period: currentPeriod,
    datasets: currentDatasets,
    ...(compareToPeriod && compareDatasets
      ? {
          compareToPeriod,
          compareDatasets
        }
      : {}),
    thresholds
  });
}

function buildDefaultQtManualEntry(
  periodId: string,
  target: {
    userKey: string;
    userEmail: string;
    userName: string;
  }
): QtManualEntry {
  const now = new Date().toISOString();

  return {
    id: `${periodId}-qt-manual-${target.userKey}`,
    periodId,
    userKey: target.userKey,
    userEmail: target.userEmail,
    userName: target.userName,
    totalListeningHours: null,
    totalEvaluatedCallCount: null,
    totalEvaluatedChatMailCount: null,
    feedbackCount: null,
    feedbackCoverage: null,
    trainingCount: null,
    meetingCount: null,
    createdAt: now,
    updatedAt: now
  };
}

async function resolveQtManualTarget(target?: QtManualEntryTarget) {
  const currentUser = await getFirebaseCurrentUser();
  const currentUserName = currentUser.displayName ?? currentUser.email!;
  const currentRole = await resolveFirebaseRole(currentUser.email!);

  if (!currentRole) {
    throw new Error("Kullanıcı rol tanımı bulunamadı.");
  }

  if (currentRole !== "admin" || !target?.targetUserEmail) {
    return {
      requesterRole: currentRole,
      userKey: currentUser.uid,
      userEmail: currentUser.email!,
      userName: currentUserName
    };
  }

  return {
    requesterRole: currentRole,
    userKey: normalizeQtEntryKey(target.targetUserEmail),
    userEmail: normalizeRoleEmail(target.targetUserEmail),
    userName: target.targetUserName?.trim() || normalizeRoleEmail(target.targetUserEmail)
  };
}

async function getRoleplayMetricsFromFirebase(periodId: string): Promise<RoleplayMetric[]> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const snapshot = await getDocs(collection(firebaseDb, "reportPeriods", periodId, "roleplayMetrics"));

  return snapshot.docs
    .map((entryDoc) => roleplayMetricSchema.safeParse(entryDoc.data()))
    .filter((entry): entry is { success: true; data: RoleplayMetric } => entry.success)
    .map((entry) => entry.data)
    .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));
}

async function saveRoleplayMetricsToFirebase(
  periodId: string,
  entries: { agentKey: string; agentName: string; rolePlayCount: number; revOpsCount: number | null; note?: string }[]
): Promise<void> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const now = new Date().toISOString();

  // Mevcut kayıtları sil
  const existingSnapshot = await getDocs(collection(firebaseDb, "reportPeriods", periodId, "roleplayMetrics"));
  const deletePromises = existingSnapshot.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletePromises);

  // Yeni kayıtları yaz
  const writePromises = entries.map((entry) => {
    const data: Record<string, unknown> = {
      agentKey: entry.agentKey,
      agentName: entry.agentName,
      rolePlayCount: entry.rolePlayCount,
      revOpsCount: entry.revOpsCount,
      updatedAt: now
    };
    if (entry.note) {
      data.note = entry.note;
    }
    return setDoc(doc(firebaseDb!, "reportPeriods", periodId, "roleplayMetrics", entry.agentKey), data);
  });
  await Promise.all(writePromises);
}

async function getEvaluationQuestionsFromFirebase(periodId: string): Promise<SalesEvaluationQuestion[]> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const snapshot = await getDocs(collection(firebaseDb, "reportPeriods", periodId, "evaluationQuestions"));

  return snapshot.docs
    .map((entryDoc) => salesEvaluationQuestionSchema.safeParse({ id: entryDoc.id, ...entryDoc.data() }))
    .filter((entry): entry is { success: true; data: SalesEvaluationQuestion } => entry.success)
    .map((entry) => entry.data);
}

async function saveEvaluationQuestionsToFirebase(
  periodId: string,
  entries: { id?: string; questionText: string; answer: string; score: number }[]
): Promise<void> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const now = new Date().toISOString();

  // Mevcut kayıtları sil
  const existingSnapshot = await getDocs(collection(firebaseDb, "reportPeriods", periodId, "evaluationQuestions"));
  const deletePromises = existingSnapshot.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletePromises);

  // Yeni kayıtları yaz
  const writePromises = entries.map((entry) => {
    const id = entry.id || crypto.randomUUID();
    return setDoc(doc(firebaseDb!, "reportPeriods", periodId, "evaluationQuestions", id), {
      id,
      questionText: entry.questionText,
      answer: entry.answer,
      score: entry.score,
      updatedAt: now
    });
  });
  await Promise.all(writePromises);
}

async function getQtManualEntriesFromFirebase(periodId: string): Promise<QtManualEntry[]> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const snapshot = await getDocs(
    query(collection(firebaseDb, "reportPeriods", periodId, "qtManualEntries"), orderBy("userName", "asc"))
  );

  return snapshot.docs
    .map((entryDoc) => qtManualEntrySchema.safeParse(entryDoc.data()))
    .filter((entry): entry is { success: true; data: QtManualEntry } => entry.success)
    .map((entry) => entry.data);
}

async function getQtManualEntryFromFirebase(periodId: string, target?: QtManualEntryTarget): Promise<QtManualEntry> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const resolvedTarget = await resolveQtManualTarget(target);
  const keyCandidates = Array.from(
    new Set([resolvedTarget.userKey, normalizeQtEntryKey(resolvedTarget.userEmail)].filter(Boolean))
  );

  for (const key of keyCandidates) {
    const entrySnapshot = await getDoc(doc(firebaseDb, "reportPeriods", periodId, "qtManualEntries", key));
    if (!entrySnapshot.exists()) {
      continue;
    }

    const parsedEntry = qtManualEntrySchema.safeParse(entrySnapshot.data());
    if (parsedEntry.success) {
      return parsedEntry.data;
    }
  }

  const matchingEntry = (await getQtManualEntriesFromFirebase(periodId)).find(
    (entry) => normalizeQtEntryKey(entry.userEmail) === normalizeQtEntryKey(resolvedTarget.userEmail)
  );
  if (matchingEntry) {
    return matchingEntry;
  }

  return buildDefaultQtManualEntry(periodId, resolvedTarget);
}

async function updateQtManualEntryFromFirebase(
  periodId: string,
  body: {
    totalListeningHours: number | null;
    totalEvaluatedCallCount: number | null;
    totalEvaluatedChatMailCount: number | null;
    feedbackCount: number | null;
    feedbackCoverage: number | null;
    trainingCount: number | null;
    meetingCount: number | null;
  },
  target?: QtManualEntryTarget
): Promise<QtManualEntry> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const resolvedTarget = await resolveQtManualTarget(target);
  const currentEntry = await getQtManualEntryFromFirebase(periodId, target);
  const nextEntry: QtManualEntry = {
    ...currentEntry,
    ...body,
    userEmail: resolvedTarget.userEmail,
    userName: target?.targetUserName?.trim() || currentEntry.userName || resolvedTarget.userName,
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(firebaseDb, "reportPeriods", periodId, "qtManualEntries", currentEntry.userKey), nextEntry);
  return nextEntry;
}

async function getTrainingEventsFromFirebase(month: string): Promise<TrainingEvent[]> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const startDate = `${month}-01`;
  const [yearStr, monthStr] = month.split("-");
  const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const snapshot = await getDocs(
    query(
      collection(firebaseDb, "trainingEvents"),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "asc")
    )
  );

  return snapshot.docs
    .map((eventDoc) => trainingEventSchema.safeParse({ id: eventDoc.id, ...eventDoc.data() }))
    .filter((event): event is { success: true; data: TrainingEvent } => event.success)
    .map((event) => event.data);
}

async function saveTrainingEventToFirebase(
  event: Omit<TrainingEvent, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<TrainingEvent> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const now = new Date().toISOString();
  const eventId = event.id || doc(collection(firebaseDb, "trainingEvents")).id;
  const data: TrainingEvent = {
    id: eventId,
    title: event.title,
    date: event.date,
    color: event.color ?? "#3b82f6",
    participants: event.participants ?? [],
    trainer: event.trainer,
    department: event.department ?? "sales",
    createdAt: now,
    updatedAt: now
  };

  await setDoc(doc(firebaseDb, "trainingEvents", eventId), data);
  return data;
}

async function updateTrainingEventInFirebase(
  eventId: string,
  patch: Partial<Omit<TrainingEvent, "id" | "createdAt">>
): Promise<TrainingEvent> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const eventRef = doc(firebaseDb, "trainingEvents", eventId);
  const existing = await getDoc(eventRef);
  if (!existing.exists()) {
    throw new Error("Etkinlik bulunamadı.");
  }

  const parsed = trainingEventSchema.parse({ id: existing.id, ...existing.data() });
  const updated: TrainingEvent = {
    ...parsed,
    ...patch,
    id: eventId,
    updatedAt: new Date().toISOString()
  };

  await setDoc(eventRef, updated);
  return updated;
}

async function deleteTrainingEventFromFirebase(eventId: string): Promise<void> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  await deleteDoc(doc(firebaseDb, "trainingEvents", eventId));
}

async function createReportPeriodInFirebase(input: {
  month: string;
  title: string;
  department?: "cs" | "sales";
  compareToPeriodId?: string;
}): Promise<ReportPeriod> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const department = input.department ?? "cs";

  // Aynı ay+departman için mükerrer dönem kontrolü
  const snapshot = await getDocs(
    query(collection(firebaseDb, "reportPeriods"), where("month", "==", input.month))
  );
  const existingDoc = snapshot.docs.find(
    (d) => ((d.data() as Record<string, unknown>).department ?? "cs") === department
  );
  if (existingDoc) {
    return reportPeriodSchema.parse({ id: existingDoc.id, ...existingDoc.data() });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const data: Record<string, unknown> = {
    month: input.month,
    title: input.title,
    status: "draft",
    department,
    createdAt: now,
    updatedAt: now
  };
  if (input.compareToPeriodId) {
    data.compareToPeriodId = input.compareToPeriodId;
  }

  await setDoc(doc(firebaseDb, "reportPeriods", id), data);
  return reportPeriodSchema.parse({ id, ...data });
}

async function getSalesMeetingsFromFirebase(periodId: string): Promise<SalesMeeting[]> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const snapshot = await getDocs(collection(firebaseDb, "reportPeriods", periodId, "salesMeetings"));

  return snapshot.docs
    .map((entryDoc) => salesMeetingSchema.safeParse({ id: entryDoc.id, ...entryDoc.data() }))
    .filter((entry): entry is { success: true; data: SalesMeeting } => entry.success)
    .map((entry) => entry.data)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

async function saveSalesMeetingsToFirebase(
  periodId: string,
  meetings: Omit<SalesMeeting, "id" | "createdAt" | "updatedAt">[]
): Promise<void> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const now = new Date().toISOString();

  // Mevcut kayıtları sil
  const existingSnapshot = await getDocs(collection(firebaseDb, "reportPeriods", periodId, "salesMeetings"));
  const deletePromises = existingSnapshot.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletePromises);

  // Yeni kayıtları yaz
  const writePromises = meetings.map((meeting) => {
    const id = crypto.randomUUID();
    const base: SalesMeeting = {
      id,
      periodId,
      date: meeting.date ?? "",
      qualityMember: meeting.qualityMember,
      salesRepresentative: meeting.salesRepresentative,
      customerName: meeting.customerName,
      status: meeting.status ?? "devam_ediyor",
      licenseDetail: meeting.licenseDetail ?? "",
      licenseAmount: meeting.licenseAmount ?? null,
      createdAt: now,
      updatedAt: now
    };
    const data: SalesMeeting = {
      ...base,
      ...(meeting.lossReason ? { lossReason: meeting.lossReason } : {}),
      ...(meeting.lossNote ? { lossNote: meeting.lossNote } : {})
    };
    return setDoc(doc(firebaseDb!, "reportPeriods", periodId, "salesMeetings", id), data);
  });
  await Promise.all(writePromises);
}

async function getSalesKpiDataFromFirebase(periodId: string): Promise<SalesKpiData | null> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const snapshot = await getDoc(doc(firebaseDb, "reportPeriods", periodId, "salesKpiData", "main"));
  if (!snapshot.exists()) return null;

  const parsed = salesKpiDataSchema.safeParse(snapshot.data());
  return parsed.success ? parsed.data : null;
}

async function saveSalesKpiDataToFirebase(periodId: string, data: SalesKpiData): Promise<void> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  await setDoc(doc(firebaseDb!, "reportPeriods", periodId, "salesKpiData", "main"), data);

  // Satış temsilcilerini otomatik kaydet
  try {
    for (const agent of data.agents) {
      const key = agent.agentKey || normalizeKey(agent.agentName);
      if (!key) continue;
      const repDoc = doc(firebaseDb!, "representatives", key);
      const snap = await getDoc(repDoc);
      if (!snap.exists()) {
        const now = new Date().toISOString();
        await setDoc(repDoc, {
          key,
          displayName: agent.agentName,
          department: "sales",
          status: "active",
          badges: [],
          timeline: [],
          createdAt: now,
          updatedAt: now
        });
      }
    }
  } catch { /* Temsilci kaydı başarısız olursa KPI kaydetmeyi engelleme */ }
}

function appendDatasetTypes(params: URLSearchParams, datasetTypes?: DatasetType[]) {
  if (!datasetTypes?.length) {
    return;
  }

  params.set("datasets", datasetTypes.join(","));
}

function canUseLocalApiFallback() {
  if (CONFIGURED_API_BASE_URL) {
    return false;
  }

  if (typeof window === "undefined") {
    return false;
  }

  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function buildLocalApiHelpMessage(baseMessage: string) {
  if (!canUseLocalApiFallback()) {
    return baseMessage;
  }

  return `${baseMessage} Geliştirme ortamında API için \`pnpm dev\` veya \`pnpm dev:api\` çalıştığından emin olun.`;
}

function buildExternalApiHelpMessage(url: string) {
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
  const corsHint = currentOrigin ? ` Backend CORS ayarında ${currentOrigin} origin'i izinli olmalı.` : "";

  return `API'ye ulaşılamadı. İstek hedefi: ${url}.${corsHint}`;
}

async function loadPublicFallback() {
  if (!publicFallbackPromise) {
    publicFallbackPromise = fetch(toPublicAssetPath("/public-fallback.json"), {
      headers: {
        Accept: "application/json"
      }
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as PublicFallbackPayload;
      })
      .catch(() => null);
  }

  return publicFallbackPromise;
}

type ParsedHttpResponse<T> = {
  url: string;
  response: Response;
  rawBody: string;
  contentType: string;
  payload: (ApiResponse<T> & { data?: T; error?: string }) | null;
};

async function fetchAndParse<T>(url: string, requestInit: RequestInit): Promise<ParsedHttpResponse<T>> {
  const response = await fetch(url, requestInit);
  const rawBody = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let payload: (ApiResponse<T> & { data?: T; error?: string }) | null = null;

  if (rawBody && contentType.includes("application/json")) {
    try {
      payload = JSON.parse(rawBody) as ApiResponse<T> & { data?: T; error?: string };
    } catch {
      throw new Error("API yanıtı okunamadı. JSON biçimi geçersiz.");
    }
  }

  return {
    url,
    response,
    rawBody,
    contentType,
    payload
  };
}

function createHeaders(token: string | null, url: string) {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (url.includes(".loca.lt")) {
    headers[LOCALTUNNEL_BYPASS_HEADER] = "true";
  }

  return headers;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const primaryUrl = `${CONFIGURED_API_BASE_URL}${path}`;
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers: createHeaders(options.token, primaryUrl)
  };

  if (options.formData) {
    requestInit.body = options.formData;
  } else if (options.body !== undefined) {
    Object.assign(requestInit.headers as Record<string, string>, {
      "Content-Type": "application/json"
    });
    requestInit.body = JSON.stringify(options.body);
  }

  let result: ParsedHttpResponse<T>;

  try {
    result = await fetchAndParse(primaryUrl, requestInit);
  } catch {
    if (!canUseLocalApiFallback()) {
      throw new Error(buildExternalApiHelpMessage(primaryUrl));
    }

    try {
      result = await fetchAndParse(`${LOCAL_API_BASE_URL}${path}`, requestInit);
    } catch {
      throw new Error(buildLocalApiHelpMessage(`Yerel API'ye ulaşılamadı. ${LOCAL_API_BASE_URL} çalışıyor mu?`));
    }
  }

  if (
    options.token &&
    requestInit.method === "GET" &&
    path !== "/api/me" &&
    (result.response.status === 401 || result.response.status === 403)
  ) {
    const guestRequestInit: RequestInit = {
      ...requestInit,
      headers: createHeaders(null, result.url)
    };
    result = await fetchAndParse(result.url, guestRequestInit);
  }

  if (result.rawBody && !result.contentType.includes("application/json") && result.rawBody.trimStart().startsWith("<")) {
    if (canUseLocalApiFallback() && result.url === primaryUrl) {
      try {
        result = await fetchAndParse(`${LOCAL_API_BASE_URL}${path}`, requestInit);
      } catch {
        throw new Error(buildLocalApiHelpMessage(`Yerel API'ye ulaşılamadı. ${LOCAL_API_BASE_URL} çalışıyor mu?`));
      }
    }

    if (result.rawBody.trimStart().startsWith("<")) {
      const baseUrlHint =
        CONFIGURED_API_BASE_URL === ""
          ? " `VITE_API_BASE_URL` tanımlı değilse web uygulamasını `/api` yönlendirmesi olan bir origin altında açın."
          : "";
      throw new Error(
        buildLocalApiHelpMessage(`API JSON yerine HTML döndü. API süreci hata veriyor olabilir. İstek hedefi: ${result.url}.${baseUrlHint}`)
      );
    }
  }

  if (result.rawBody && !result.contentType.includes("application/json") && !result.rawBody.trimStart().startsWith("<")) {
    throw new Error(`API beklenmeyen bir yanıt döndürdü. İstek hedefi: ${result.url}.`);
  }

  const data = result.payload?.data;

  if (!result.response.ok || data === undefined) {
    throw new Error(result.payload?.error ?? "API isteği başarısız.");
  }

  return data;
}

async function requestWithPublicFallback<T>(
  path: string,
  options: RequestOptions,
  resolveFallback?: (payload: PublicFallbackPayload) => T | undefined
) {
  try {
    return await request<T>(path, options);
  } catch (error) {
    if (!resolveFallback) {
      throw error;
    }

    const fallback = await loadPublicFallback();
    const resolved = fallback ? resolveFallback(fallback) : undefined;

    if (resolved !== undefined) {
      return resolved;
    }

    throw error;
  }
}

export const api = {
  async getMe(token: string | null) {
    // Dev token'lar API sunucusuna ihtiyaç duymadan çalışır
    if (token?.startsWith("dev-")) {
      const role = roleSchema.safeParse(token.slice(4));
      if (role.success) {
        return {
          uid: "dev-user",
          email: "dev@kalitedb.local",
          displayName: "Geliştirici",
          role: role.data
        } satisfies AuthenticatedUser;
      }
    }

    if (shouldPreferFirebaseClientMode()) {
      return getMeFromFirebase();
    }

    try {
      return await request<AuthenticatedUser>("/api/me", { token });
    } catch (error) {
      const hasAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
      if (!hasAuth) throw error;
      return getMeFromFirebase();
    }
  },
  async getPeriods(token: string | null) {
    if (shouldPreferFirebaseReadMode()) {
      try {
        return await getPeriodsFromFirebase();
      } catch {
        // Auth henüz hazır olmayabilir — bekle ve tekrar dene
        const hasAuth = await waitForFirebaseAuth();
        if (hasAuth) {
          return getPeriodsFromFirebase();
        }
        // Auth yoksa public fallback'e düş (misafir kullanıcılar için)
      }
    }

    if (shouldPreferFirebaseClientMode()) {
      return getPeriodsFromFirebase();
    }

    try {
      return await requestWithPublicFallback<ReportPeriod[]>("/api/report-periods", { token }, (fallback) => fallback.periods);
    } catch {
      const hasAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
      if (!hasAuth) {
        console.warn("[KaliteDB] Dönemler yüklenemedi: API kapalı ve Firebase oturumu yok. Google ile giriş yapın veya API sunucusunu başlatın.");
        return [];
      }
      return getPeriodsFromFirebase();
    }
  },
  async createPeriod(
    token: string | null,
    body: { month: string; title: string; department?: "cs" | "sales"; compareToPeriodId?: string | undefined }
  ) {
    const hasFirebaseAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFirebaseAuth) {
      return createReportPeriodInFirebase({
        month: body.month,
        title: body.title,
        ...(body.department ? { department: body.department } : {}),
        ...(body.compareToPeriodId ? { compareToPeriodId: body.compareToPeriodId } : {})
      });
    }
    try {
      return await request<ReportPeriod>("/api/report-periods", { token, method: "POST", body });
    } catch (error) {
      assertFirebaseAuthOrThrow(false);
      throw error;
    }
  },
  async getPeriodDetails(token: string | null, periodId: string, options?: PeriodDetailsOptions) {
    if (shouldPreferFirebaseReadMode()) {
      try {
        return await getPeriodDetailsFromFirebase(periodId, options);
      } catch {
        const hasAuth = await waitForFirebaseAuth();
        if (hasAuth) {
          return getPeriodDetailsFromFirebase(periodId, options);
        }
      }
    }

    const params = new URLSearchParams();
    appendDatasetTypes(params, options?.datasetTypes);
    if (options?.includeImportJobs === false) {
      params.set("includeImportJobs", "false");
    }

    const queryString = params.toString();
    try {
      return await request<{
        period: ReportPeriod;
        datasets: DashboardSnapshot["datasets"];
        importJobs: Array<{
          id: string;
          datasetType: DatasetType;
          uploadedAt: string;
          uploadedBy: string;
          rowCount: number;
          errorCount: number;
          status: string;
        }>;
      }>(`/api/report-periods/${periodId}${queryString ? `?${queryString}` : ""}`, { token });
    } catch (error) {
      const hasAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
      if (!hasAuth) throw error;
      return getPeriodDetailsFromFirebase(periodId, options);
    }
  },
  updatePeriod(token: string | null, periodId: string, body: Record<string, unknown>) {
    return request(`/api/report-periods/${periodId}`, { token, method: "PATCH", body });
  },
  async deleteDatasetRecord(token: string | null, periodId: string, datasetType: string, recordId: string): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const collectionName = datasetType === "agent-metrics" ? "agentMetrics"
        : datasetType === "audit-metrics" ? "auditMetrics"
        : datasetType === "question-performance" ? "questionPerformance"
        : "qtMetrics";
      await deleteDoc(doc(firebaseDb, "reportPeriods", periodId, collectionName, recordId));
      return;
    }
    await request(`/api/report-periods/${periodId}`, {
      token,
      method: "PATCH",
      body: { action: "delete-record", datasetType, recordId }
    });
  },
  resetDataset(token: string | null, periodId: string, datasetType: DatasetType) {
    return request<ResetDatasetResponse>(`/api/report-periods/${periodId}`, {
      token,
      method: "PATCH",
      body: {
        action: "reset-dataset",
        datasetType
      }
    });
  },
  importDataset(
    token: string | null,
    periodId: string,
    datasetType: DatasetType,
    file: File,
    commit: boolean
  ) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("commit", String(commit));
    return request<{
      errors: Array<{ row: number; field?: string; message: string }>;
      rowCount: number;
      previewRows: unknown[];
      committed: boolean;
    }>(`/api/report-periods/${periodId}/imports/${datasetType}`, {
      token,
      method: "POST",
      formData
    });
  },
  publishPeriod(token: string | null, periodId: string) {
    return request<ReportPeriod>(`/api/report-periods/${periodId}/publish`, {
      token,
      method: "POST"
    });
  },
  reopenPeriod(token: string | null, periodId: string) {
    return request<ReportPeriod>(`/api/report-periods/${periodId}/reopen`, {
      token,
      method: "POST"
    });
  },
  async getDashboard(token: string | null, periodId?: string, compareToPeriodId?: string, options?: DashboardOptions) {
    if (shouldPreferFirebaseReadMode()) {
      try {
        return await getDashboardFromFirebase(periodId, compareToPeriodId, options);
      } catch {
        const hasAuth = await waitForFirebaseAuth();
        if (hasAuth) {
          return getDashboardFromFirebase(periodId, compareToPeriodId, options);
        }
      }
    }

    const params = new URLSearchParams();
    if (periodId) {
      params.set("periodId", periodId);
    }
    if (compareToPeriodId) {
      params.set("compareToPeriodId", compareToPeriodId);
    }
    appendDatasetTypes(params, options?.datasetTypes);

    const queryString = params.toString();
    try {
      return await requestWithPublicFallback<DashboardSnapshot>(
        `/api/dashboard${queryString ? `?${queryString}` : ""}`,
        { token },
        (fallback) => {
          const resolvedPeriodId = periodId ?? selectDefaultReportPeriod(fallback.periods)?.id;
          if (!resolvedPeriodId) {
            return undefined;
          }

          const currentSnapshot = fallback.dashboards[resolvedPeriodId];
          if (!currentSnapshot) {
            return undefined;
          }

          if (!compareToPeriodId) {
            return currentSnapshot;
          }

          const compareSnapshot = fallback.dashboards[compareToPeriodId];
          if (!compareSnapshot) {
            return currentSnapshot;
          }

          return buildDashboardSnapshot({
            period: currentSnapshot.period,
            compareToPeriod: compareSnapshot.period,
            datasets: currentSnapshot.datasets,
            compareDatasets: compareSnapshot.datasets,
            thresholds: currentSnapshot.thresholds
          });
        }
      );
    } catch (error) {
      const hasAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
      if (!hasAuth) throw error;
      return getDashboardFromFirebase(periodId, compareToPeriodId, options);
    }
  },
  async getThresholds(token: string | null) {
    if (shouldPreferFirebaseReadMode()) {
      try {
        return await getThresholdsFromFirebase();
      } catch {
        const hasAuth = await waitForFirebaseAuth();
        if (hasAuth) {
          return getThresholdsFromFirebase();
        }
      }
    }

    if (shouldPreferFirebaseClientMode()) {
      return getThresholdsFromFirebase();
    }

    try {
      return await request<Record<KpiMetricKey, ThresholdConfig>>("/api/settings/thresholds", { token });
    } catch (error) {
      const hasAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
      if (!hasAuth) throw error;
      return getThresholdsFromFirebase();
    }
  },
  updateThresholds(token: string | null, body: Partial<Record<KpiMetricKey, Partial<ThresholdConfig>>>) {
    return request<Record<KpiMetricKey, ThresholdConfig>>("/api/settings/thresholds", {
      token,
      method: "PATCH",
      body
    });
  },
  async getAgentMetricsForPeriods(token: string | null, periodIds: string[]): Promise<Record<string, AgentMetric[]>> {
    if (canUseFirebaseReadMode() && (firebaseAuth?.currentUser || (await waitForFirebaseAuth()))) {
      try {
        const entries = await Promise.all(
          periodIds.map(async (periodId) => {
            const datasets = await getPeriodDatasetsFromFirebase(periodId, ["agent-metrics"]);
            return [periodId, datasets.agentMetrics] as const;
          })
        );
        return Object.fromEntries(entries);
      } catch {
        // Firebase başarısız olursa API'ye düş
      }
    }

    const entries = await Promise.all(
      periodIds.map(async (periodId) => {
        try {
          const snapshot = await api.getDashboard(token, periodId, undefined, { datasetTypes: ["agent-metrics"] });
          return [periodId, snapshot.datasets.agentMetrics] as const;
        } catch {
          return [periodId, [] as AgentMetric[]] as const;
        }
      })
    );
    return Object.fromEntries(entries);
  },
  async getAuditMetricsForPeriods(token: string | null, periodIds: string[]): Promise<Record<string, AuditMetric[]>> {
    // Firebase doğrudan okuma (en hızlı yol)
    if (canUseFirebaseReadMode() && (firebaseAuth?.currentUser || (await waitForFirebaseAuth()))) {
      try {
        const entries = await Promise.all(
          periodIds.map(async (periodId) => {
            const datasets = await getPeriodDatasetsFromFirebase(periodId, ["audit-metrics"]);
            return [periodId, datasets.auditMetrics] as const;
          })
        );
        return Object.fromEntries(entries);
      } catch {
        // Firebase başarısız olursa API'ye düş
      }
    }

    // API fallback: her dönem için getDashboard çağır, audit metriklerini çıkar
    const entries = await Promise.all(
      periodIds.map(async (periodId) => {
        try {
          const snapshot = await api.getDashboard(token, periodId, undefined, { datasetTypes: ["audit-metrics"] });
          return [periodId, snapshot.datasets.auditMetrics] as const;
        } catch {
          return [periodId, [] as AuditMetric[]] as const;
        }
      })
    );
    return Object.fromEntries(entries);
  },
  async getRoleplayMetrics(token: string | null, periodId: string): Promise<RoleplayMetric[]> {
    if (canUseFirebaseReadMode() && (firebaseAuth?.currentUser || (await waitForFirebaseAuth()))) {
      try {
        return await getRoleplayMetricsFromFirebase(periodId);
      } catch {
        // Firebase başarısız olursa API'ye düş
      }
    }
    return request<RoleplayMetric[]>(`/api/report-periods/${periodId}/roleplay-metrics`, { token });
  },
  async saveRoleplayMetrics(
    token: string | null,
    periodId: string,
    entries: { agentKey: string; agentName: string; rolePlayCount: number; revOpsCount: number | null; note?: string }[]
  ): Promise<void> {
    const hasFbAuth = firebaseAuth?.currentUser || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth) {
      return saveRoleplayMetricsToFirebase(periodId, entries);
    }
    try {
      await request(`/api/report-periods/${periodId}/roleplay-metrics`, { token, method: "PUT", body: entries });
    } catch (error) {
      assertFirebaseAuthOrThrow(false);
      throw error;
    }
  },
  async getEvaluationQuestions(token: string | null, periodId: string): Promise<SalesEvaluationQuestion[]> {
    if (canUseFirebaseReadMode() && (firebaseAuth?.currentUser || (await waitForFirebaseAuth()))) {
      try {
        return await getEvaluationQuestionsFromFirebase(periodId);
      } catch {
        // Firebase başarısız olursa API'ye düş
      }
    }
    return request<SalesEvaluationQuestion[]>(`/api/report-periods/${periodId}/evaluation-questions`, { token });
  },
  async saveEvaluationQuestions(
    token: string | null,
    periodId: string,
    entries: { id?: string; questionText: string; answer: string; score: number }[]
  ): Promise<void> {
    const hasFbAuth = firebaseAuth?.currentUser || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth) {
      return saveEvaluationQuestionsToFirebase(periodId, entries);
    }
    try {
      await request(`/api/report-periods/${periodId}/evaluation-questions`, { token, method: "PUT", body: entries });
    } catch (error) {
      assertFirebaseAuthOrThrow(false);
      throw error;
    }
  },
  getRoles(token: string | null) {
    if (shouldPreferFirebaseClientMode()) {
      return getRolesFromFirebase();
    }

    return request<UserRoleAssignment[]>("/api/users/roles", { token }).catch(async (error) => {
      const hasAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
      if (!hasAuth) throw error;
      return getRolesFromFirebase();
    });
  },
  createRole(token: string | null, body: { uid?: string; email: string; role: Role; departments?: Department[] }) {
    return request<UserRoleAssignment>("/api/users/roles", {
      token,
      method: "POST",
      body
    });
  },
  async getQtManualEntries(token: string | null, periodId: string) {
    if (shouldPreferFirebaseReadMode()) {
      try {
        return await getQtManualEntriesFromFirebase(periodId);
      } catch {
        const hasAuth = await waitForFirebaseAuth();
        if (hasAuth) {
          return getQtManualEntriesFromFirebase(periodId);
        }
      }
    }

    if (shouldPreferFirebaseClientMode()) {
      return getQtManualEntriesFromFirebase(periodId);
    }

    try {
      return await request<QtManualEntry[]>(`/api/report-periods/${periodId}/qt-manual-entry?scope=all`, { token });
    } catch (error) {
      const hasAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
      if (!hasAuth) throw error;
      return getQtManualEntriesFromFirebase(periodId);
    }
  },
  async getQtManualEntry(token: string | null, periodId: string, target?: QtManualEntryTarget) {
    if (shouldPreferFirebaseClientMode()) {
      return getQtManualEntryFromFirebase(periodId, target);
    }

    const params = new URLSearchParams();
    if (target?.targetUserEmail) {
      params.set("targetEmail", target.targetUserEmail);
    }
    if (target?.targetUserName) {
      params.set("targetUserName", target.targetUserName);
    }
    const queryString = params.toString();

    try {
      return await request<QtManualEntry>(
        `/api/report-periods/${periodId}/qt-manual-entry${queryString ? `?${queryString}` : ""}`,
        { token }
      );
    } catch (error) {
      const hasAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
      if (!hasAuth) throw error;
      return getQtManualEntryFromFirebase(periodId, target);
    }
  },
  async updateQtManualEntry(
    token: string | null,
    periodId: string,
    body: {
      totalListeningHours: number | null;
      totalEvaluatedCallCount: number | null;
      totalEvaluatedChatMailCount: number | null;
      feedbackCount: number | null;
      feedbackCoverage: number | null;
      trainingCount: number | null;
      meetingCount: number | null;
    },
    target?: QtManualEntryTarget
  ) {
    if (shouldPreferFirebaseClientMode()) {
      return updateQtManualEntryFromFirebase(periodId, body, target);
    }

    try {
      return await request<QtManualEntry>(`/api/report-periods/${periodId}/qt-manual-entry`, {
        token,
        method: "PATCH",
        body: {
          ...body,
          ...(target?.targetUserEmail ? { targetEmail: target.targetUserEmail } : {}),
          ...(target?.targetUserName ? { targetUserName: target.targetUserName } : {})
        }
      });
    } catch (error) {
      const hasAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
      if (!hasAuth) throw error;
      return updateQtManualEntryFromFirebase(periodId, body, target);
    }
  },
  async getTrainingEvents(token: string | null, month: string): Promise<TrainingEvent[]> {
    if (canUseFirebaseReadMode() && (firebaseAuth?.currentUser || (await waitForFirebaseAuth()))) {
      try {
        return await getTrainingEventsFromFirebase(month);
      } catch {
        // Firebase başarısız olursa API'ye düş
      }
    }
    return request<TrainingEvent[]>(`/api/training-events?month=${encodeURIComponent(month)}`, { token });
  },
  async createTrainingEvent(
    token: string | null,
    event: Omit<TrainingEvent, "id" | "createdAt" | "updatedAt">
  ): Promise<TrainingEvent> {
    const hasFbAuth = firebaseAuth?.currentUser || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth) {
      return saveTrainingEventToFirebase(event);
    }
    try {
      return await request<TrainingEvent>("/api/training-events", { token, method: "POST", body: event });
    } catch (error) {
      assertFirebaseAuthOrThrow(false);
      throw error;
    }
  },
  async updateTrainingEvent(
    token: string | null,
    eventId: string,
    patch: Partial<Omit<TrainingEvent, "id" | "createdAt">>
  ): Promise<TrainingEvent> {
    const hasFbAuth = firebaseAuth?.currentUser || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth) {
      return updateTrainingEventInFirebase(eventId, patch);
    }
    try {
      return await request<TrainingEvent>(`/api/training-events/${eventId}`, { token, method: "PATCH", body: patch });
    } catch (error) {
      assertFirebaseAuthOrThrow(false);
      throw error;
    }
  },
  async deleteTrainingEvent(token: string | null, eventId: string): Promise<void> {
    const hasFbAuth = firebaseAuth?.currentUser || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth) {
      return deleteTrainingEventFromFirebase(eventId);
    }
    try {
      await request<{ deleted: boolean }>(`/api/training-events/${eventId}`, { token, method: "DELETE" });
    } catch (error) {
      assertFirebaseAuthOrThrow(false);
      throw error;
    }
  },
  async getSalesMeetings(token: string | null, periodId: string): Promise<SalesMeeting[]> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth) {
      try {
        return await getSalesMeetingsFromFirebase(periodId);
      } catch {
        // Firebase başarısız olursa API'ye düş
      }
    }
    return request<SalesMeeting[]>(`/api/report-periods/${periodId}/sales-meetings`, { token });
  },
  async saveSalesMeetings(
    token: string | null,
    periodId: string,
    meetings: Omit<SalesMeeting, "id" | "createdAt" | "updatedAt">[]
  ): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth) {
      return saveSalesMeetingsToFirebase(periodId, meetings);
    }
    try {
      await request(`/api/report-periods/${periodId}/sales-meetings`, { token, method: "PUT", body: meetings });
    } catch (error) {
      assertFirebaseAuthOrThrow(false);
      throw error;
    }
  },
  async getSalesKpiData(token: string | null, periodId: string): Promise<SalesKpiData | null> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth) {
      try {
        return await getSalesKpiDataFromFirebase(periodId);
      } catch {
        // Firebase başarısız olursa API'ye düş
      }
    }
    return request<SalesKpiData | null>(`/api/report-periods/${periodId}/sales-kpi`, { token });
  },
  async saveSalesKpiData(token: string | null, periodId: string, data: SalesKpiData): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth) {
      return saveSalesKpiDataToFirebase(periodId, data);
    }
    try {
      await request(`/api/report-periods/${periodId}/sales-kpi`, { token, method: "PUT", body: data });
    } catch (error) {
      assertFirebaseAuthOrThrow(false);
      throw error;
    }
  },
  // ── Roleplay individual CRUD ──
  async updateRoleplayMetric(
    token: string | null,
    periodId: string,
    agentKey: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const docRef = doc(firebaseDb, "reportPeriods", periodId, "roleplayMetrics", agentKey);
      await setDoc(docRef, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
      return;
    }
    await request(`/api/report-periods/${periodId}/roleplay-metrics`, { token, method: "PATCH", body: { agentKey, ...updates } });
  },
  async deleteRoleplayMetric(token: string | null, periodId: string, agentKey: string): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      await deleteDoc(doc(firebaseDb, "reportPeriods", periodId, "roleplayMetrics", agentKey));
      return;
    }
    await request(`/api/report-periods/${periodId}/roleplay-metrics`, { token, method: "DELETE", body: { agentKey } });
  },

  // ── Evaluation questions individual CRUD ──
  async updateEvaluationQuestion(
    token: string | null,
    periodId: string,
    id: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const docRef = doc(firebaseDb, "reportPeriods", periodId, "evaluationQuestions", id);
      await setDoc(docRef, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
      return;
    }
    await request(`/api/report-periods/${periodId}/evaluation-questions`, { token, method: "PATCH", body: { id, ...updates } });
  },
  async deleteEvaluationQuestion(token: string | null, periodId: string, id: string): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      await deleteDoc(doc(firebaseDb, "reportPeriods", periodId, "evaluationQuestions", id));
      return;
    }
    await request(`/api/report-periods/${periodId}/evaluation-questions`, { token, method: "DELETE", body: { id } });
  },

  // ── Sales meetings individual CRUD ──
  async createSalesMeeting(
    token: string | null,
    periodId: string,
    meeting: Omit<SalesMeeting, "id" | "periodId" | "createdAt" | "updatedAt">
  ): Promise<{ id: string }> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const safeData = Object.fromEntries(
        Object.entries({ id, periodId, ...meeting, createdAt: now, updatedAt: now })
          .filter(([, v]) => v !== undefined)
      );
      await setDoc(doc(firebaseDb, "reportPeriods", periodId, "salesMeetings", id), safeData);
      return { id };
    }
    return request<{ id: string }>(`/api/report-periods/${periodId}/sales-meetings`, { token, method: "POST", body: meeting });
  },
  async updateSalesMeeting(
    token: string | null,
    periodId: string,
    meetingId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const docRef = doc(firebaseDb, "reportPeriods", periodId, "salesMeetings", meetingId);
      await setDoc(docRef, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
      return;
    }
    await request(`/api/report-periods/${periodId}/sales-meetings`, { token, method: "PATCH", body: { id: meetingId, ...updates } });
  },
  async deleteSalesMeeting(token: string | null, periodId: string, meetingId: string): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      await deleteDoc(doc(firebaseDb, "reportPeriods", periodId, "salesMeetings", meetingId));
      return;
    }
    await request(`/api/report-periods/${periodId}/sales-meetings`, { token, method: "DELETE", body: { id: meetingId } });
  },

  // ── KPI individual CRUD ──
  async addKpiAgent(
    token: string | null,
    periodId: string,
    agent: { agentName: string; perfScore: number | null; salesAmount: number; licenseCount: number; avgLicensePrice: number; talkDurationSeconds: number; callAttempts: number; conversionRate: number }
  ): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const kpiDoc = doc(firebaseDb, "reportPeriods", periodId, "salesKpiData", "main");
      const snap = await getDoc(kpiDoc);
      if (!snap.exists()) throw new Error("KPI verisi bulunamadı");
      const current = snap.data() as { targets: unknown; agents: unknown[]; updatedAt: string };
      current.agents.push({ ...agent, agentKey: agent.agentName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_çğıöşü]/g, "") });
      current.updatedAt = new Date().toISOString();
      await setDoc(kpiDoc, current);
      return;
    }
    await request(`/api/report-periods/${periodId}/sales-kpi`, { token, method: "PATCH", body: { action: "add-agent", agent } });
  },
  async updateKpiAgent(
    token: string | null,
    periodId: string,
    agentKey: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const kpiDoc = doc(firebaseDb, "reportPeriods", periodId, "salesKpiData", "main");
      const snap = await getDoc(kpiDoc);
      if (!snap.exists()) throw new Error("KPI verisi bulunamadı");
      const current = snap.data() as { targets: unknown; agents: Array<Record<string, unknown>>; updatedAt: string };
      const idx = current.agents.findIndex((a) => a.agentKey === agentKey);
      if (idx === -1) throw new Error("Temsilci bulunamadı");
      current.agents[idx] = { ...current.agents[idx], ...updates };
      current.updatedAt = new Date().toISOString();
      await setDoc(kpiDoc, current);
      return;
    }
    await request(`/api/report-periods/${periodId}/sales-kpi`, { token, method: "PATCH", body: { action: "update-agent", agentKey, updates } });
  },
  async deleteKpiAgent(token: string | null, periodId: string, agentKey: string): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const kpiDoc = doc(firebaseDb, "reportPeriods", periodId, "salesKpiData", "main");
      const snap = await getDoc(kpiDoc);
      if (!snap.exists()) throw new Error("KPI verisi bulunamadı");
      const current = snap.data() as { targets: unknown; agents: Array<Record<string, unknown>>; updatedAt: string };
      current.agents = current.agents.filter((a) => a.agentKey !== agentKey);
      current.updatedAt = new Date().toISOString();
      await setDoc(kpiDoc, current);
      return;
    }
    await request(`/api/report-periods/${periodId}/sales-kpi`, { token, method: "PATCH", body: { action: "delete-agent", agentKey } });
  },
  async resetKpiAgents(token: string | null, periodId: string): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const kpiDoc = doc(firebaseDb, "reportPeriods", periodId, "salesKpiData", "main");
      const snap = await getDoc(kpiDoc);
      if (!snap.exists()) throw new Error("KPI verisi bulunamadı");
      const current = snap.data() as { targets: unknown; agents: Array<Record<string, unknown>>; updatedAt: string };
      current.agents = [];
      current.updatedAt = new Date().toISOString();
      await setDoc(kpiDoc, current);
      return;
    }
    await request(`/api/report-periods/${periodId}/sales-kpi`, { token, method: "PATCH", body: { action: "reset-agents" } });
  },
  async updateKpiTargets(
    token: string | null,
    periodId: string,
    targets: Record<string, unknown>
  ): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const kpiDoc = doc(firebaseDb, "reportPeriods", periodId, "salesKpiData", "main");
      const snap = await getDoc(kpiDoc);
      if (!snap.exists()) throw new Error("KPI verisi bulunamadı");
      const current = snap.data() as { targets: Record<string, unknown>; agents: unknown[]; updatedAt: string };
      current.targets = { ...current.targets, ...targets };
      current.updatedAt = new Date().toISOString();
      await setDoc(kpiDoc, current);
      return;
    }
    await request(`/api/report-periods/${periodId}/sales-kpi`, { token, method: "PATCH", body: { action: "update-targets", targets } });
  },
  async updateLicenseSummary(
    token: string | null,
    periodId: string,
    licenseSummary: { preCount: number; scaleCount: number; scale2Plus1Count: number; scalePlusCount: number; scalePlus2Plus1Count: number }
  ): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const kpiDoc = doc(firebaseDb, "reportPeriods", periodId, "salesKpiData", "main");
      const snap = await getDoc(kpiDoc);
      if (!snap.exists()) throw new Error("KPI verisi bulunamadı");
      const current = snap.data() as Record<string, unknown>;
      current.licenseSummary = licenseSummary;
      current.updatedAt = new Date().toISOString();
      await setDoc(kpiDoc, current);
      return;
    }
    await request(`/api/report-periods/${periodId}/sales-kpi`, { token, method: "PATCH", body: { action: "update-license-summary", licenseSummary } });
  },

  async getRepresentatives(token: string | null): Promise<Representative[]> {
    // 1) Firebase'den oku
    if (shouldPreferFirebaseReadMode()) {
      try {
        const result = await getRepresentativesFromFirebase();
        if (result.length > 0) return result;
      } catch { /* Firebase başarısız — diğer yolları dene */ }

      try {
        const hasAuth = await waitForFirebaseAuth();
        if (hasAuth) {
          const result = await getRepresentativesFromFirebase();
          if (result.length > 0) return result;
        }
      } catch { /* Auth sonrası da başarısız */ }
    }

    // 2) API'den oku
    try {
      const result = await request<Representative[]>("/api/representatives", { token });
      if (result.length > 0) return result;
    } catch { /* API da başarısız */ }

    // 3) Son çare: dönem verilerinden türet
    return deriveRepresentativesFromFallback();
  },
  async updateRepresentativeStatus(
    token: string | null,
    key: string,
    body: { status?: string; department?: string; statusNote?: string }
  ): Promise<Representative> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const repDoc = doc(firebaseDb, "representatives", key);
      const snap = await getDoc(repDoc);
      if (!snap.exists()) throw new Error("Temsilci bulunamadı");
      const current = snap.data() as Record<string, unknown>;
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.status != null) updates.status = body.status;
      if (body.department != null) updates.department = body.department;
      if (body.statusNote != null) updates.statusNote = body.statusNote;
      await setDoc(repDoc, { ...current, ...updates });
      return { ...current, ...updates } as unknown as Representative;
    }
    return request<Representative>(`/api/representatives/${encodeURIComponent(key)}`, {
      token,
      method: "PATCH",
      body
    });
  },
  async updateRepresentative(
    token: string | null,
    key: string,
    body: { displayName?: string; status?: string; department?: string; statusNote?: string; badges?: string[]; timeline?: Array<{ id: string; title: string; startDate: string; endDate?: string; department?: string }> }
  ): Promise<Representative> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const repDoc = doc(firebaseDb, "representatives", key);
      const snap = await getDoc(repDoc);
      if (!snap.exists()) throw new Error("Temsilci bulunamadı");
      const current = snap.data() as Record<string, unknown>;
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.displayName != null) updates.displayName = body.displayName;
      if (body.status != null) updates.status = body.status;
      if (body.department != null) updates.department = body.department;
      if (body.statusNote != null) updates.statusNote = body.statusNote;
      if (body.badges != null) updates.badges = body.badges;
      if (body.timeline != null) updates.timeline = body.timeline;
      await setDoc(repDoc, { ...current, ...updates });
      return { ...current, ...updates } as unknown as Representative;
    }
    return request<Representative>(`/api/representatives/${encodeURIComponent(key)}`, {
      token,
      method: "PATCH",
      body
    });
  },
  async createRepresentative(
    token: string | null,
    body: { displayName: string; department: Department }
  ): Promise<Representative> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      const key = normalizeKey(body.displayName);
      const now = new Date().toISOString();
      const rep: Record<string, unknown> = {
        key,
        displayName: body.displayName,
        department: body.department,
        status: "active",
        badges: [],
        timeline: [],
        createdAt: now,
        updatedAt: now
      };
      await setDoc(doc(firebaseDb, "representatives", key), rep);
      return rep as unknown as Representative;
    }
    return request<Representative>("/api/representatives", {
      token,
      method: "POST",
      body
    });
  },
  async deleteRepresentative(token: string | null, key: string): Promise<void> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      await deleteDoc(doc(firebaseDb, "representatives", key));
      return;
    }
    await request(`/api/representatives/${encodeURIComponent(key)}`, {
      token,
      method: "DELETE"
    });
  },
  async populateRepresentatives(token: string | null): Promise<{ created: number; existing: number }> {
    const hasFbAuth = canUseFirebaseClientFallback() || (await waitForFirebaseAuth());
    if (canUseFirebaseReadMode() && hasFbAuth && firebaseDb) {
      return populateRepresentativesFromFirebase();
    }
    return request<{ created: number; existing: number }>("/api/representatives/populate", {
      token,
      method: "POST",
      body: {}
    });
  },
  async getVoiceCoachEntitlement(
    token: string | null
  ): Promise<{ allowed: boolean; reason?: string }> {
    return request<{ allowed: boolean; reason?: string }>("/api/voice-coach/entitlement", { token });
  },
  async requestVoiceCoachSignedUrl(
    token: string | null,
    scenarioId: string
  ): Promise<{
    signedUrl: string;
    sessionId: string;
    agentId: string;
    dynamicVariables: Record<string, string | number | boolean>;
  }> {
    return request("/api/voice-coach/signed-url", {
      token,
      method: "POST",
      body: { scenarioId }
    });
  },
  async finalizeVoiceCoachSession(
    token: string | null,
    sessionId: string,
    payload: {
      transcript: VoiceCoachTranscriptTurn[];
      elevenlabsConversationId?: string;
      durationSec?: number;
      status: "completed" | "failed";
      coaching?: VoiceCoachCoaching;
    }
  ): Promise<VoiceCoachSession> {
    return request<VoiceCoachSession>(
      `/api/voice-coach/sessions/${encodeURIComponent(sessionId)}/finalize`,
      { token, method: "POST", body: payload }
    );
  },
  async listVoiceCoachSessions(
    token: string | null,
    params?: { repEmail?: string; limit?: number }
  ): Promise<VoiceCoachSession[]> {
    const query = new URLSearchParams();
    if (params?.repEmail) query.set("repEmail", params.repEmail);
    if (params?.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<VoiceCoachSession[]>(`/api/voice-coach/sessions${suffix}`, { token });
  },
  async getVoiceCoachSession(token: string | null, sessionId: string): Promise<VoiceCoachSession> {
    return request<VoiceCoachSession>(
      `/api/voice-coach/sessions/${encodeURIComponent(sessionId)}`,
      { token }
    );
  },
  async listRoleplayScenarios(token: string | null): Promise<RoleplayScenario[]> {
    return request<RoleplayScenario[]>("/api/roleplay/scenarios", { token });
  },
  async createRoleplayScenario(
    token: string | null,
    input: RoleplayScenarioInput
  ): Promise<RoleplayScenario> {
    return request<RoleplayScenario>("/api/roleplay/scenarios", {
      token,
      method: "POST",
      body: input
    });
  },
  async updateRoleplayScenario(
    token: string | null,
    scenarioId: string,
    patch: Partial<RoleplayScenarioInput>
  ): Promise<RoleplayScenario> {
    return request<RoleplayScenario>(
      `/api/roleplay/scenarios/${encodeURIComponent(scenarioId)}`,
      { token, method: "PATCH", body: patch }
    );
  },
  async deleteRoleplayScenario(token: string | null, scenarioId: string): Promise<void> {
    await request<{ deleted: true }>(
      `/api/roleplay/scenarios/${encodeURIComponent(scenarioId)}`,
      { token, method: "DELETE" }
    );
  },
  async listRoleplayKnowledgeDocs(token: string | null): Promise<RoleplayKnowledgeDoc[]> {
    return request<RoleplayKnowledgeDoc[]>("/api/roleplay/knowledge-docs", { token });
  },
  async createRoleplayKnowledgeDoc(
    token: string | null,
    input: RoleplayKnowledgeDocInput
  ): Promise<RoleplayKnowledgeDoc> {
    return request<RoleplayKnowledgeDoc>("/api/roleplay/knowledge-docs", {
      token,
      method: "POST",
      body: input
    });
  },
  async updateRoleplayKnowledgeDoc(
    token: string | null,
    docId: string,
    patch: Partial<RoleplayKnowledgeDocInput>
  ): Promise<RoleplayKnowledgeDoc> {
    return request<RoleplayKnowledgeDoc>(
      `/api/roleplay/knowledge-docs/${encodeURIComponent(docId)}`,
      { token, method: "PATCH", body: patch }
    );
  },
  async deleteRoleplayKnowledgeDoc(token: string | null, docId: string): Promise<void> {
    await request<{ deleted: true }>(
      `/api/roleplay/knowledge-docs/${encodeURIComponent(docId)}`,
      { token, method: "DELETE" }
    );
  },
  async syncRoleplayKnowledgeDoc(
    token: string | null,
    docId: string
  ): Promise<RoleplayKnowledgeDoc> {
    return request<RoleplayKnowledgeDoc>(
      `/api/roleplay/knowledge-docs/${encodeURIComponent(docId)}/sync`,
      { token, method: "POST", body: {} }
    );
  }
};
