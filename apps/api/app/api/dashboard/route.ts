import { buildDashboardSnapshot } from "@kalitedb/shared";

import { requireAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function GET(request: Request) {
  try {
    await requireAuth(request as never, ["admin", "team", "ceo"]);
    const repository = await getRepository();
    const periods = await repository.listReportPeriods();
    const url = new URL(request.url);
    const periodId = url.searchParams.get("periodId") ?? periods.find((period) => period.status === "published")?.id;
    const compareToPeriodId = url.searchParams.get("compareToPeriodId") ?? undefined;

    if (!periodId) {
      throw new ApiError(404, "Gösterilecek yayımlanmış dönem bulunamadı.");
    }

    const details = await repository.getPeriodDetails(periodId);
    if (!details) {
      throw new ApiError(404, "Dönem bulunamadı.");
    }

    const compareTo = compareToPeriodId ? await repository.getPeriodDetails(compareToPeriodId) : undefined;
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
