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
  feedbackCoverage: z.number().nonnegative().nullable(),
  trainingCount: z.number().int().nonnegative().nullable(),
  meetingCount: z.number().int().nonnegative().nullable(),
  targetEmail: z.string().email().optional(),
  targetUserName: z.string().min(1).optional()
});

function normalizeTargetEmail(email: string) {
  return email.trim().toLocaleLowerCase("tr-TR");
}

function buildDefaultEntry(
  periodId: string,
  target: { userKey: string; userEmail: string; userName: string }
): QtManualEntry {
  const now = new Date().toISOString();

  return {
    id: createDeterministicId(periodId, "qt-manual", target.userKey),
    periodId,
    userKey: target.userKey,
    userEmail: target.userEmail,
    userName: target.userName,
    totalListeningHours: null,
    totalEvaluatedCallCount: null,
    totalEvaluatedChatMailCount: null,
    feedbackCount: null,
    feedbackCoverage: null,
    trainingCount: null,
    meetingCount: null,
    createdAt: now,
    updatedAt: now
  };
}

async function resolveQtTarget(
  repository: Awaited<ReturnType<typeof getRepository>>,
  user: Awaited<ReturnType<typeof requireAuth>>,
  input?: { targetEmail?: string | undefined; targetUserName?: string | undefined }
) {
  if (user.role !== "admin" || !input?.targetEmail) {
    return {
      userKey: user.uid,
      userEmail: user.email,
      userName: user.displayName || user.email
    };
  }

  const targetEmail = normalizeTargetEmail(input.targetEmail);
  const targetRole = await repository.findRoleByEmail(targetEmail);

  if (targetRole !== "qt") {
    throw new ApiError(400, "Seçilen kullanıcı QT rolünde değil.");
  }

  return {
    userKey: targetEmail,
    userEmail: targetEmail,
    userName: input.targetUserName?.trim() || targetEmail
  };
}

async function findQtEntry(
  repository: Awaited<ReturnType<typeof getRepository>>,
  periodId: string,
  target: { userKey: string; userEmail: string }
) {
  const directEntry = await repository.getQtManualEntry(periodId, target.userKey);
  if (directEntry) {
    return directEntry;
  }

  const normalizedEmail = normalizeTargetEmail(target.userEmail);
  if (normalizedEmail !== target.userKey) {
    const emailEntry = await repository.getQtManualEntry(periodId, normalizedEmail);
    if (emailEntry) {
      return emailEntry;
    }
  }

  const entries = await repository.listQtManualEntries(periodId);
  return entries.find((entry) => normalizeTargetEmail(entry.userEmail) === normalizedEmail);
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
    const target = await resolveQtTarget(repository, user, {
      targetEmail: url.searchParams.get("targetEmail") ?? undefined,
      targetUserName: url.searchParams.get("targetUserName") ?? undefined
    });
    const entry = (await findQtEntry(repository, periodId, target)) ?? buildDefaultEntry(periodId, target);
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
    const target = await resolveQtTarget(repository, user, {
      targetEmail: payload.targetEmail,
      targetUserName: payload.targetUserName
    });
    const current = (await findQtEntry(repository, periodId, target)) ?? buildDefaultEntry(periodId, target);
    const next: QtManualEntry = {
      ...current,
      totalListeningHours: payload.totalListeningHours,
      totalEvaluatedCallCount: payload.totalEvaluatedCallCount,
      totalEvaluatedChatMailCount: payload.totalEvaluatedChatMailCount,
      feedbackCount: payload.feedbackCount,
      feedbackCoverage: payload.feedbackCoverage,
      trainingCount: payload.trainingCount,
      meetingCount: payload.meetingCount,
      userEmail: target.userEmail,
      userName: payload.targetUserName?.trim() || current.userName || target.userName,
      updatedAt: new Date().toISOString()
    };

    const saved = await repository.upsertQtManualEntry(next);
    return jsonResponse(saved);
  } catch (error) {
    return handleRouteError(error);
  }
}
