import type {
  Role,
  ReportDatasets,
  DashboardSnapshot,
  DatasetType,
  KpiMetricKey,
  QtManualEntry,
  ReportPeriod,
  ThresholdConfig,
  UserRoleAssignment,
  UserRoleEntry
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
  roleSchema,
  selectDefaultReportPeriod,
  thresholdConfigSchema,
  userRoleAssignmentSchema
} from "@kalitedb/shared";
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from "firebase/firestore";

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
  method?: "GET" | "POST" | "PATCH";
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

function shouldPreferFirebaseReadMode() {
  if (!canUseFirebaseReadMode() || typeof window === "undefined") {
    return false;
  }

  return window.location.hostname.endsWith("github.io");
}

function shouldPreferFirebaseClientMode() {
  if (!canUseFirebaseClientFallback() || typeof window === "undefined") {
    return false;
  }

  return window.location.hostname.endsWith("github.io");
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
  const role = await resolveFirebaseRole(currentUser.email!);

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
  } catch (error) {
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
    if (shouldPreferFirebaseClientMode()) {
      return getMeFromFirebase();
    }

    try {
      return await request<AuthenticatedUser>("/api/me", { token });
    } catch (error) {
      if (!canUseFirebaseClientFallback()) {
        throw error;
      }

      return getMeFromFirebase();
    }
  },
  async getPeriods(token: string | null) {
    if (shouldPreferFirebaseReadMode()) {
      try {
        return await getPeriodsFromFirebase();
      } catch {
        // Static fallback keeps guest pages usable if public Firestore read is unavailable.
      }
    }

    if (shouldPreferFirebaseClientMode()) {
      return getPeriodsFromFirebase();
    }

    return requestWithPublicFallback<ReportPeriod[]>("/api/report-periods", { token }, (fallback) => fallback.periods);
  },
  createPeriod(
    token: string | null,
    body: { month: string; title: string; department?: "cs" | "sales"; compareToPeriodId?: string | undefined }
  ) {
    return request<ReportPeriod>("/api/report-periods", { token, method: "POST", body });
  },
  async getPeriodDetails(token: string | null, periodId: string, options?: PeriodDetailsOptions) {
    if (shouldPreferFirebaseReadMode()) {
      try {
        return await getPeriodDetailsFromFirebase(periodId, options);
      } catch {
        // Backend remains the fallback for admin-heavy screens.
      }
    }

    const params = new URLSearchParams();
    appendDatasetTypes(params, options?.datasetTypes);
    if (options?.includeImportJobs === false) {
      params.set("includeImportJobs", "false");
    }

    const queryString = params.toString();
    return request<{
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
  },
  updatePeriod(token: string | null, periodId: string, body: Record<string, unknown>) {
    return request(`/api/report-periods/${periodId}`, { token, method: "PATCH", body });
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
        // Static dashboard snapshot stays as the last-resort guest fallback.
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
    return requestWithPublicFallback<DashboardSnapshot>(
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
  },
  async getThresholds(token: string | null) {
    if (shouldPreferFirebaseReadMode()) {
      try {
        return await getThresholdsFromFirebase();
      } catch {
        // Fall through to API fallback.
      }
    }

    if (shouldPreferFirebaseClientMode()) {
      return getThresholdsFromFirebase();
    }

    try {
      return await request<Record<KpiMetricKey, ThresholdConfig>>("/api/settings/thresholds", { token });
    } catch (error) {
      if (!canUseFirebaseClientFallback()) {
        throw error;
      }

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
  getRoles(token: string | null) {
    if (shouldPreferFirebaseClientMode()) {
      return getRolesFromFirebase();
    }

    return request<UserRoleAssignment[]>("/api/users/roles", { token }).catch((error) => {
      if (!canUseFirebaseClientFallback()) {
        throw error;
      }

      return getRolesFromFirebase();
    });
  },
  createRole(token: string | null, body: { uid?: string; email: string; role: Role }) {
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
        // Keep backend as fallback for environments without public Firestore reads.
      }
    }

    if (shouldPreferFirebaseClientMode()) {
      return getQtManualEntriesFromFirebase(periodId);
    }

    try {
      return await request<QtManualEntry[]>(`/api/report-periods/${periodId}/qt-manual-entry?scope=all`, { token });
    } catch (error) {
      if (!canUseFirebaseClientFallback()) {
        throw error;
      }

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
      if (!canUseFirebaseClientFallback()) {
        throw error;
      }

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
      if (!canUseFirebaseClientFallback()) {
        throw error;
      }

      return updateQtManualEntryFromFirebase(periodId, body, target);
    }
  }
};
