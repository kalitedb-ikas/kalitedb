import { buildDashboardSnapshot, datasetTypeSchema, selectDefaultReportPeriod } from "@kalitedb/shared";

import { getOptionalAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

function parseDatasetTypes(value: string | null) {
  if (!value) {
    return undefined;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => datasetTypeSchema.parse(item));
}

export async function GET(request: Request) {
  try {
    await getOptionalAuth(request as never, ["admin", "team", "ceo", "qt"]);
    const repository = await getRepository();
    const periods = await repository.listReportPeriods();
    const visiblePeriods = periods;
    const url = new URL(request.url);
    const periodId = url.searchParams.get("periodId") ?? selectDefaultReportPeriod(visiblePeriods)?.id;
    const compareToPeriodId = url.searchParams.get("compareToPeriodId") ?? undefined;
    const datasetTypes = parseDatasetTypes(url.searchParams.get("datasets"));

    if (!periodId) {
      throw new ApiError(404, "Gösterilecek yayımlanmış dönem bulunamadı.");
    }

    const details = await repository.getPeriodDetails(periodId, {
      datasetTypes,
      includeImportJobs: false
    });
    if (!details) {
      throw new ApiError(404, "Dönem bulunamadı.");
    }

    const compareTo = compareToPeriodId
      ? await repository.getPeriodDetails(compareToPeriodId, {
          datasetTypes,
          includeImportJobs: false
        })
      : undefined;

    const thresholds = await repository.getThresholds();

    return jsonResponse(
      buildDashboardSnapshot({
        period: details.period,
        datasets: details.datasets,
        ...(compareTo
          ? {
              compareToPeriod: compareTo.period,
              compareDatasets: compareTo.datasets
            }
          : {}),
        thresholds
      })
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
