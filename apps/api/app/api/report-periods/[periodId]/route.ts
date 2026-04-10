import { datasetTypeSchema } from "@kalitedb/shared";
import { z } from "zod";

import { sanitizeEditedRecord } from "@/src/lib/edit-record";
import { requireAuth } from "@/src/lib/auth";
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

function parseManualCountField(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const digits = String(value).replace(/[^\d]/g, "");

  if (!digits) {
    return null;
  }

  return Number(digits);
}

const patchSchema = z.object({
  title: z.string().optional(),
  compareToPeriodId: z.string().optional(),
  manualTotalCallCount: z.preprocess(parseManualCountField, z.number().int().nonnegative().nullable().optional()),
  manualTotalChatMailCount: z.preprocess(parseManualCountField, z.number().int().nonnegative().nullable().optional()),
  manualTotalTicketClosedCount: z.preprocess(
    parseManualCountField,
    z.number().int().nonnegative().nullable().optional()
  ),
  action: z.enum(["reset-dataset", "delete-record"]).optional(),
  datasetType: z.enum(["agent-metrics", "audit-metrics", "question-performance", "qt-metrics"]).optional(),
  recordId: z.string().optional(),
  updates: z.record(z.string(), z.unknown()).optional()
});

export async function GET(
  request: Request,
  context: { params: Promise<{ periodId: string }> }
) {
  try {
    const { periodId } = await context.params;
    const url = new URL(request.url);
    const datasetTypes = parseDatasetTypes(url.searchParams.get("datasets"));
    const includeImportJobs = url.searchParams.get("includeImportJobs") !== "false";
    const repository = await getRepository();
    const details = await repository.getPeriodDetails(periodId, {
      datasetTypes,
      includeImportJobs
    });
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
    await requireAuth(request as never, ["admin", "team", "manager", "team_leader"]);
    const body = patchSchema.parse(await request.json());
    const { periodId } = await context.params;
    const repository = await getRepository();

    if (body.action === "reset-dataset") {
      if (!body.datasetType) {
        throw new ApiError(400, "Sıfırlanacak veri kümesi belirtilmelidir.");
      }

      const period = await repository.getReportPeriod(periodId);
      if (!period) {
        throw new ApiError(404, "Dönem bulunamadı.");
      }

      await repository.replaceDataset(periodId, body.datasetType, []);
      await repository.updateReportPeriod(periodId, {});

      return jsonResponse({
        periodId,
        datasetType: body.datasetType,
        reset: true as const
      });
    }

    if (body.action === "delete-record" && body.datasetType && body.recordId) {
      await repository.deleteDatasetRecord(periodId, body.datasetType, body.recordId);
      return jsonResponse({ deleted: true });
    }

    if (body.datasetType && body.recordId && body.updates) {
      const current = await repository.getDatasetRecord(periodId, body.datasetType, body.recordId);
      if (!current) {
        throw new ApiError(404, "Kayıt bulunamadı.");
      }

      const nextRecord =
        body.datasetType === "agent-metrics"
          ? sanitizeEditedRecord(body.datasetType, current as never, body.updates as never)
          : body.datasetType === "audit-metrics"
            ? sanitizeEditedRecord(body.datasetType, current as never, body.updates as never)
          : body.datasetType === "question-performance"
            ? sanitizeEditedRecord(body.datasetType, current as never, body.updates as never)
            : sanitizeEditedRecord(body.datasetType, current as never, body.updates as never);
      const updated = await repository.updateDatasetRecord(periodId, body.datasetType, nextRecord as never);
      return jsonResponse(updated);
    }

    const period = await repository.updateReportPeriod(periodId, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.compareToPeriodId !== undefined ? { compareToPeriodId: body.compareToPeriodId } : {}),
      ...(body.manualTotalCallCount !== undefined ? { manualTotalCallCount: body.manualTotalCallCount } : {}),
      ...(body.manualTotalChatMailCount !== undefined ? { manualTotalChatMailCount: body.manualTotalChatMailCount } : {}),
      ...(body.manualTotalTicketClosedCount !== undefined
        ? { manualTotalTicketClosedCount: body.manualTotalTicketClosedCount }
        : {})
    });
    return jsonResponse(period);
  } catch (error) {
    return handleRouteError(error);
  }
}
