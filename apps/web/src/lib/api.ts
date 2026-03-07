import type {
  DashboardSnapshot,
  DatasetType,
  KpiMetricKey,
  QtManualEntry,
  ReportPeriod,
  ThresholdConfig,
  UserRoleAssignment
} from "@kalitedb/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

type ApiResponse<T> = {
  data: T;
};

type RequestOptions = {
  token: string | null;
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  formData?: FormData;
};

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers: options.formData
      ? {
          Authorization: options.token ? `Bearer ${options.token}` : ""
        }
      : {
          "Content-Type": "application/json",
          Authorization: options.token ? `Bearer ${options.token}` : ""
        }
  };

  if (options.formData) {
    requestInit.body = options.formData;
  } else if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, requestInit);

  const payload = (await response.json()) as ApiResponse<T> & {
    data?: T;
    error?: string;
  };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error ?? "API isteği başarısız.");
  }

  return payload.data;
}

export const api = {
  getMe(token: string | null) {
    return request<{
      uid: string;
      email: string;
      displayName: string;
      role: "admin" | "team" | "ceo";
    }>("/api/me", { token });
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
  getPeriodDetails(token: string | null, periodId: string) {
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
    }>(`/api/report-periods/${periodId}`, { token });
  },
  updatePeriod(token: string | null, periodId: string, body: Record<string, unknown>) {
    return request(`/api/report-periods/${periodId}`, { token, method: "PATCH", body });
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
  getDashboard(token: string | null, periodId?: string, compareToPeriodId?: string) {
    const params = new URLSearchParams();
    if (periodId) {
      params.set("periodId", periodId);
    }
    if (compareToPeriodId) {
      params.set("compareToPeriodId", compareToPeriodId);
    }

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
  createRole(token: string | null, body: { uid?: string; email: string; role: "admin" | "team" | "ceo" }) {
    return request<UserRoleAssignment>("/api/users/roles", {
      token,
      method: "POST",
      body
    });
  },
  getQtManualEntry(token: string | null, periodId: string) {
    return request<QtManualEntry>(`/api/report-periods/${periodId}/qt-manual-entry`, { token });
  },
  updateQtManualEntry(
    token: string | null,
    periodId: string,
    body: {
      totalEvaluatedCallCount: number | null;
      totalEvaluatedChatMailCount: number | null;
      feedbackCount: number | null;
    }
  ) {
    return request<QtManualEntry>(`/api/report-periods/${periodId}/qt-manual-entry`, {
      token,
      method: "PATCH",
      body
    });
  }
};
