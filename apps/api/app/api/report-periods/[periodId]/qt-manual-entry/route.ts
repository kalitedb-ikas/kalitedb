import { z } from "zod";
import { createDeterministicId, type QtManualEntry } from "@kalitedb/shared";

import { requireAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const patchSchema = z.object({
  totalListeningHours: z.number().nonnegative().nullable(),
  totalEvaluatedCallCount: z.number().int().nonnegative().nullable(),
  totalEvaluatedChatMailCount: z.number().int().nonnegative().nullable(),
  feedbackCount: z.number().int().nonnegative().nullable(),
  feedbackCoverage: z.number().nonnegative().nullable()
});

function buildDefaultEntry(periodId: string, user: Awaited<ReturnType<typeof requireAuth>>): QtManualEntry {
  const now = new Date().toISOString();

  return {
    id: createDeterministicId(periodId, "qt-manual", user.uid),
    periodId,
    userKey: user.uid,
    userEmail: user.email,
    userName: user.displayName || user.email,
    totalListeningHours: null,
    totalEvaluatedCallCount: null,
    totalEvaluatedChatMailCount: null,
    feedbackCount: null,
    feedbackCoverage: null,
    createdAt: now,
    updatedAt: now
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ periodId: string }> }
) {
  try {
    const { periodId } = await context.params;
    const repository = await getRepository();
    const period = await repository.getReportPeriod(periodId);
    const url = new URL(request.url);

    if (!period) {
      throw new ApiError(404, "Dönem bulunamadı.");
    }

    if (url.searchParams.get("scope") === "all") {
      const entries = await repository.listQtManualEntries(periodId);
      return jsonResponse(entries);
    }

    const user = await requireAuth(request as never, ["admin", "qt"]);
    const entry = (await repository.getQtManualEntry(periodId, user.uid)) ?? buildDefaultEntry(periodId, user);
    return jsonResponse(entry);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ periodId: string }> }
) {
  try {
    const user = await requireAuth(request as never, ["admin", "qt"]);
    const { periodId } = await context.params;
    const repository = await getRepository();
    const period = await repository.getReportPeriod(periodId);

    if (!period) {
      throw new ApiError(404, "Dönem bulunamadı.");
    }

    const payload = patchSchema.parse(await request.json());
    const current = (await repository.getQtManualEntry(periodId, user.uid)) ?? buildDefaultEntry(periodId, user);
    const next: QtManualEntry = {
      ...current,
      ...payload,
      userEmail: user.email,
      userName: user.displayName || user.email,
      updatedAt: new Date().toISOString()
    };

    const saved = await repository.upsertQtManualEntry(next);
    return jsonResponse(saved);
  } catch (error) {
    return handleRouteError(error);
  }
}
