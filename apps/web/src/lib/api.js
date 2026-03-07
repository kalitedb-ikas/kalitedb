const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
async function request(path, options) {
    const requestInit = {
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
    }
    else if (options.body !== undefined) {
        requestInit.body = JSON.stringify(options.body);
    }
    const response = await fetch(`${API_BASE_URL}${path}`, requestInit);
    const payload = (await response.json());
    if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "API istegi basarisiz");
    }
    return payload.data;
}
export const api = {
    getMe(token) {
        return request("/api/me", { token });
    },
    getPeriods(token) {
        return request("/api/report-periods", { token });
    },
    createPeriod(token, body) {
        return request("/api/report-periods", { token, method: "POST", body });
    },
    getPeriodDetails(token, periodId) {
        return request(`/api/report-periods/${periodId}`, { token });
    },
    updatePeriod(token, periodId, body) {
        return request(`/api/report-periods/${periodId}`, { token, method: "PATCH", body });
    },
    importDataset(token, periodId, datasetType, file, commit) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("commit", String(commit));
        return request(`/api/report-periods/${periodId}/imports/${datasetType}`, {
            token,
            method: "POST",
            formData
        });
    },
    publishPeriod(token, periodId) {
        return request(`/api/report-periods/${periodId}/publish`, {
            token,
            method: "POST"
        });
    },
    reopenPeriod(token, periodId) {
        return request(`/api/report-periods/${periodId}/reopen`, {
            token,
            method: "POST"
        });
    },
    getDashboard(token, periodId, compareToPeriodId) {
        const params = new URLSearchParams();
        if (periodId) {
            params.set("periodId", periodId);
        }
        if (compareToPeriodId) {
            params.set("compareToPeriodId", compareToPeriodId);
        }
        const queryString = params.toString();
        return request(`/api/dashboard${queryString ? `?${queryString}` : ""}`, { token });
    },
    getThresholds(token) {
        return request("/api/settings/thresholds", { token });
    },
    updateThresholds(token, body) {
        return request("/api/settings/thresholds", {
            token,
            method: "PATCH",
            body
        });
    },
    getRoles(token) {
        return request("/api/users/roles", { token });
    },
    createRole(token, body) {
        return request("/api/users/roles", {
            token,
            method: "POST",
            body
        });
    }
};
