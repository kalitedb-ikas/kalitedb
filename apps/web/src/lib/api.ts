import type {
  Role,
  DashboardSnapshot,
  DatasetType,
  KpiMetricKey,
  QtManualEntry,
  ReportPeriod,
  ThresholdConfig,
  UserRoleAssignment
} from "@kalitedb/shared";
import {
  buildDashboardSnapshot,
  DEFAULT_THRESHOLDS as DEFAULT_THRESHOLD_MAP,
  qtManualEntrySchema,
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
  role: "admin" | "team" | "ceo" | "qt";
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

let publicFallbackPromise: Promise<PublicFallbackPayload | null> | undefined;

function normalizeRoleEmail(email: string) {
  return email.trim().toLocaleLowerCase("tr-TR");
}

function canUseFirebaseClientFallback() {
  return Boolean(firebaseDb && firebaseAuth?.currentUser);
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

function buildDefaultQtManualEntry(periodId: string, user: Awaited<ReturnType<typeof getFirebaseCurrentUser>>): QtManualEntry {
  const now = new Date().toISOString();

  return {
    id: `${periodId}-qt-manual-${user.uid}`,
    periodId,
    userKey: user.uid,
    userEmail: user.email!,
    userName: user.displayName ?? user.email!,
    totalListeningHours: null,
    totalEvaluatedCallCount: null,
    totalEvaluatedChatMailCount: null,
    feedbackCount: null,
    feedbackCoverage: null,
    createdAt: now,
    updatedAt: now
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

async function getQtManualEntryFromFirebase(periodId: string): Promise<QtManualEntry> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const currentUser = await getFirebaseCurrentUser();
  const entrySnapshot = await getDoc(doc(firebaseDb, "reportPeriods", periodId, "qtManualEntries", currentUser.uid));

  if (!entrySnapshot.exists()) {
    return buildDefaultQtManualEntry(periodId, currentUser);
  }

  const parsedEntry = qtManualEntrySchema.safeParse(entrySnapshot.data());
  return parsedEntry.success ? parsedEntry.data : buildDefaultQtManualEntry(periodId, currentUser);
}

async function updateQtManualEntryFromFirebase(
  periodId: string,
  body: {
    totalListeningHours: number | null;
    totalEvaluatedCallCount: number | null;
    totalEvaluatedChatMailCount: number | null;
    feedbackCount: number | null;
    feedbackCoverage: number | null;
  }
): Promise<QtManualEntry> {
  if (!firebaseDb) {
    throw new Error("Firebase veritabanı hazır değil.");
  }

  const currentUser = await getFirebaseCurrentUser();
  const currentEntry = await getQtManualEntryFromFirebase(periodId);
  const nextEntry: QtManualEntry = {
    ...currentEntry,
    ...body,
    userEmail: currentUser.email!,
    userName: currentUser.displayName ?? currentUser.email!,
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(firebaseDb, "reportPeriods", periodId, "qtManualEntries", currentUser.uid), nextEntry);
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
  getPeriods(token: string | null) {
    return requestWithPublicFallback<ReportPeriod[]>("/api/report-periods", { token }, (fallback) => fallback.periods);
  },
  createPeriod(
    token: string | null,
    body: { month: string; title: string; compareToPeriodId?: string | undefined }
  ) {
    return request<ReportPeriod>("/api/report-periods", { token, method: "POST", body });
  },
  getPeriodDetails(token: string | null, periodId: string, options?: PeriodDetailsOptions) {
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
  getDashboard(token: string | null, periodId?: string, compareToPeriodId?: string, options?: DashboardOptions) {
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
    return request<UserRoleAssignment[]>("/api/users/roles", { token });
  },
  createRole(token: string | null, body: { uid?: string; email: string; role: "admin" | "team" | "ceo" | "qt" }) {
    return request<UserRoleAssignment>("/api/users/roles", {
      token,
      method: "POST",
      body
    });
  },
  async getQtManualEntries(token: string | null, periodId: string) {
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
  async getQtManualEntry(token: string | null, periodId: string) {
    if (shouldPreferFirebaseClientMode()) {
      return getQtManualEntryFromFirebase(periodId);
    }

    try {
      return await request<QtManualEntry>(`/api/report-periods/${periodId}/qt-manual-entry`, { token });
    } catch (error) {
      if (!canUseFirebaseClientFallback()) {
        throw error;
      }

      return getQtManualEntryFromFirebase(periodId);
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
    }
  ) {
    if (shouldPreferFirebaseClientMode()) {
      return updateQtManualEntryFromFirebase(periodId, body);
    }

    try {
      return await request<QtManualEntry>(`/api/report-periods/${periodId}/qt-manual-entry`, {
        token,
        method: "PATCH",
        body
      });
    } catch (error) {
      if (!canUseFirebaseClientFallback()) {
        throw error;
      }

      return updateQtManualEntryFromFirebase(periodId, body);
    }
  }
};
