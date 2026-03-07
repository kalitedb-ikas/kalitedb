import {
  datasetTypeSchema,
  parseDatasetCsv,
  type ImportJob
} from "@kalitedb/shared";

import { requireAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function POST(
  request: Request,
  context: { params: Promise<{ periodId: string; datasetType: string }> }
) {
  try {
    const user = await requireAuth(request as never, ["admin", "team"]);
    const { periodId, datasetType: rawDatasetType } = await context.params;
    const datasetType = datasetTypeSchema.parse(rawDatasetType);
    const repository = await getRepository();
    const details = await repository.getPeriodDetails(periodId);
    if (!details) {
      throw new ApiError(404, "Dönem bulunamadı.");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const commit = formData.get("commit") === "true";

    if (!(file instanceof File)) {
      throw new ApiError(400, "CSV dosyası gerekli.");
    }

    const text = await file.text();
    const preview =
      datasetType === "agent-metrics"
        ? parseDatasetCsv({
            datasetType,
            text,
            expectedPeriod: details.period.month
          })
        : datasetType === "question-performance"
          ? parseDatasetCsv({
              datasetType,
              text,
              expectedPeriod: details.period.month
            })
          : parseDatasetCsv({
              datasetType,
              text,
              expectedPeriod: details.period.month
            });

    if (preview.errors.length > 0 || !commit) {
      return jsonResponse({
        ...preview,
        committed: false
      });
    }

    const storagePath = `imports/${periodId}/${datasetType}/${preview.sha256}.csv`;
    await repository.storeImportFile(storagePath, text);
    await repository.replaceDataset(periodId, datasetType, preview.validRows as never);

    const importJob: ImportJob = {
      id: crypto.randomUUID(),
      periodId,
      datasetType,
      sha256: preview.sha256,
      storagePath,
      status: "imported",
      rowCount: preview.rowCount,
      errorCount: preview.errors.length,
      uploadedBy: user.email,
      uploadedAt: new Date().toISOString()
    };

    await repository.createImportJob(importJob);

    return jsonResponse({
      ...preview,
      committed: true
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
