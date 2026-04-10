import {
  datasetTypeSchema,
  normalizeKey,
  parseDatasetCsv,
  type ImportJob
} from "@kalitedb/shared";

import { requireAuth } from "@/src/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function POST(
  request: Request,
  context: { params: Promise<{ periodId: string; datasetType: string }> }
) {
  try {
    const user = await requireAuth(request as never, ["admin", "team", "manager", "team_leader"]);
    const { periodId, datasetType: rawDatasetType } = await context.params;
    const datasetType = datasetTypeSchema.parse(rawDatasetType);
    const repository = await getRepository();
    const period = await repository.getReportPeriod(periodId);
    if (!period) {
      throw new ApiError(404, "Dönem bulunamadı.");
    }

    if (datasetType === "qt-metrics") {
      throw new ApiError(400, "QT verileri artık CSV ile değil, QT kullanıcıları tarafından manuel giriliyor.");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const commit = formData.get("commit") === "true";

    if (!(file instanceof File)) {
      throw new ApiError(400, "CSV dosyası gerekli.");
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      const limitMB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
      throw new ApiError(413, `Dosya boyutu ${limitMB} MB sınırını aşıyor.`);
    }

    const text = await file.text();
    const preview =
      datasetType === "agent-metrics"
        ? parseDatasetCsv({
            datasetType,
            text,
            expectedPeriod: period.month
          })
        : datasetType === "audit-metrics"
          ? parseDatasetCsv({
              datasetType,
              text,
              expectedPeriod: period.month
            })
          : datasetType === "question-performance"
            ? parseDatasetCsv({
                datasetType,
                text,
                expectedPeriod: period.month
              })
            : parseDatasetCsv({
                datasetType,
                text,
                expectedPeriod: period.month
              });

    if (preview.errors.length > 0 || !commit) {
      return jsonResponse({
        ...preview,
        committed: false
      });
    }

    const storagePath = `imports/${periodId}/${datasetType}/${preview.sha256}.csv`;

    // CSV dosyasını sakla (başarısız olursa veri kaydını engelleme)
    try {
      await repository.storeImportFile(storagePath, text);
    } catch {
      // Storage bucket yoksa veya erişim hatası varsa devam et
    }

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

    try {
      await repository.createImportJob(importJob);
    } catch {
      // Import job kaydı başarısız olursa da veri zaten yazıldı
    }

    // İçe aktarılan verideki yeni temsilcileri otomatik kaydet
    if (datasetType === "agent-metrics" || datasetType === "audit-metrics") {
      try {
        const department = period.department ?? "cs";
        const now = new Date().toISOString();
        const rows = preview.validRows as Array<{ agentKey: string; agentName: string }>;
        const seen = new Set<string>();

        for (const row of rows) {
          const key = row.agentKey || normalizeKey(row.agentName);
          if (!key || seen.has(key)) continue;
          seen.add(key);

          const existing = await repository.getRepresentative(key);
          if (!existing) {
            await repository.upsertRepresentative({
              key,
              displayName: row.agentName,
              department,
              status: "active",
              createdAt: now,
              updatedAt: now
            });
          }
        }
      } catch {
        // Temsilci kaydı başarısız olursa import'u engelleme
      }
    }

    return jsonResponse({
      ...preview,
      committed: true
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
