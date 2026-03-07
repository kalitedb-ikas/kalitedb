import { z } from "zod";

import { sanitizeEditedRecord } from "@/src/lib/edit-record";
import { requireAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const patchSchema = z.object({
  title: z.string().optional(),
  compareToPeriodId: z.string().optional(),
  datasetType: z.enum(["agent-metrics", "question-performance", "qt-metrics"]).optional(),
  recordId: z.string().optional(),
  updates: z.record(z.string(), z.unknown()).optional()
});

export async function GET(
  request: Request,
  context: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never, ["admin", "team", "ceo"]);
    const { periodId } = await context.params;
    const repository = await getRepository();
    const details = await repository.getPeriodDetails(periodId);
    if (!details) {
      throw new ApiError(404, "Dönem bulunamadı.");
    }

    return jsonResponse(details);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never, ["admin", "team"]);
    const body = patchSchema.parse(await request.json());
    const { periodId } = await context.params;
    const repository = await getRepository();

    if (body.datasetType && body.recordId && body.updates) {
      const details = await repository.getPeriodDetails(periodId);
      if (!details) {
        throw new ApiError(404, "Dönem bulunamadı.");
      }

      const datasetProperty =
        body.datasetType === "agent-metrics"
          ? "agentMetrics"
          : body.datasetType === "question-performance"
            ? "questionPerformance"
            : "qtMetrics";
      const current = details.datasets[datasetProperty].find((record) => record.id === body.recordId);
      if (!current) {
        throw new ApiError(404, "Kayıt bulunamadı.");
      }

      const nextRecord =
        body.datasetType === "agent-metrics"
          ? sanitizeEditedRecord(body.datasetType, current as never, body.updates as never)
          : body.datasetType === "question-performance"
            ? sanitizeEditedRecord(body.datasetType, current as never, body.updates as never)
            : sanitizeEditedRecord(body.datasetType, current as never, body.updates as never);
      const updated = await repository.updateDatasetRecord(periodId, body.datasetType, nextRecord as never);
      return jsonResponse(updated);
    }

    const period = await repository.updateReportPeriod(periodId, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.compareToPeriodId !== undefined ? { compareToPeriodId: body.compareToPeriodId } : {})
    });
    return jsonResponse(period);
  } catch (error) {
    return handleRouteError(error);
  }
}
