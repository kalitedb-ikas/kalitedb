import { normalizeKey } from "@kalitedb/shared";

import { requireAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function POST(request: Request) {
  try {
    await requireAuth(request as never, ["admin"]);
    const repository = await getRepository();

    const periods = await repository.listReportPeriods();
    // Anahtar: agentKey, Değer: { displayName, department (en son dönemin departmanı) }
    const agentMap = new Map<string, { displayName: string; department: "cs" | "sales"; month: string }>();

    for (const period of periods) {
      const details = await repository.getPeriodDetails(period.id, { includeImportJobs: false });
      if (!details) continue;

      const department = period.department ?? "cs";

      for (const record of details.datasets.agentMetrics) {
        const existing = agentMap.get(record.agentKey);
        if (!existing || period.month > existing.month) {
          agentMap.set(record.agentKey, { displayName: record.agentName, department, month: period.month });
        }
      }

      for (const record of details.datasets.auditMetrics) {
        const existing = agentMap.get(record.agentKey);
        if (!existing || period.month > existing.month) {
          agentMap.set(record.agentKey, { displayName: record.agentName, department, month: period.month });
        }
      }

      for (const record of details.datasets.qtMetrics) {
        const key = record.representativeKey || normalizeKey(record.representativeName);
        const existing = agentMap.get(key);
        if (!existing || period.month > existing.month) {
          agentMap.set(key, { displayName: record.representativeName, department, month: period.month });
        }
      }
    }

    let created = 0;
    let existing = 0;
    const now = new Date().toISOString();

    for (const [key, info] of agentMap) {
      const existingRep = await repository.getRepresentative(key);
      if (existingRep) {
        existing++;
        continue;
      }

      await repository.upsertRepresentative({
        key,
        displayName: info.displayName,
        department: info.department,
        status: "active",
        createdAt: now,
        updatedAt: now
      });
      created++;
    }

    return jsonResponse({ created, existing });
  } catch (error) {
    return handleRouteError(error);
  }
}
