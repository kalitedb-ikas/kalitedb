import type {
  DashboardSnapshot,
  DatasetType,
  KpiMetricKey,
  QtManualEntry,
  ReportPeriod,
  ThresholdConfig,
  UserRoleAssignment
} from "@kalitedb/shared";

const CONFIGURED_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
const LOCAL_API_BASE_URL = "http://localhost:3001";

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

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const primaryUrl = `${CONFIGURED_API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers
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
      throw error;
    }

    try {
      result = await fetchAndParse(`${LOCAL_API_BASE_URL}${path}`, requestInit);
    } catch {
      throw new Error(buildLocalApiHelpMessage(`Yerel API'ye ulaşılamadı. ${LOCAL_API_BASE_URL} çalışıyor mu?`));
    }
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

export const api = {
  getMe(token: string | null) {
    return request<AuthenticatedUser>("/api/me", { token });
  },
  getPeriods(token: string | null) {
    return request<ReportPeriod[]>("/api/report-periods", { token });
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
    return request<DashboardSnapshot>(`/api/dashboard${queryString ? `?${queryString}` : ""}`, { token });
  },
  getThresholds(token: string | null) {
    return request<Record<KpiMetricKey, ThresholdConfig>>("/api/settings/thresholds", { token });
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
  getQtManualEntries(token: string | null, periodId: string) {
    return request<QtManualEntry[]>(`/api/report-periods/${periodId}/qt-manual-entry?scope=all`, { token });
  },
  getQtManualEntry(token: string | null, periodId: string) {
    return request<QtManualEntry>(`/api/report-periods/${periodId}/qt-manual-entry`, { token });
  },
  updateQtManualEntry(
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
    return request<QtManualEntry>(`/api/report-periods/${periodId}/qt-manual-entry`, {
      token,
      method: "PATCH",
      body
    });
  }
};
