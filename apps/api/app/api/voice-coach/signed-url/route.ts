import { roleplayScenarioSchema, voiceCoachSessionSchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { canStartSession, createSignedUrl } from "@/src/lib/elevenlabs";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const bodySchema = z.object({
  scenarioId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request as never);
    const entitlement = canStartSession(user);
    if (!entitlement.allowed) {
      throw new ApiError(403, entitlement.reason ?? "Bu işlem için yetkin yok.");
    }
    const { scenarioId } = bodySchema.parse(await request.json());

    const db = getFirebaseAdminDb();
    const scenarioSnap = await db.collection("roleplayScenarios").doc(scenarioId).get();
    if (!scenarioSnap.exists) {
      throw new ApiError(404, "Senaryo bulunamadı.");
    }
    const scenarioDoc = roleplayScenarioSchema.parse({ id: scenarioSnap.id, ...scenarioSnap.data() });
    if (!scenarioDoc.active) {
      throw new ApiError(409, "Bu senaryo şu an pasif.");
    }

    const { signedUrl, agentId } = await createSignedUrl();

    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const session = voiceCoachSessionSchema.parse({
      sessionId,
      repEmail: user.email,
      repUid: user.uid,
      repName: user.displayName || user.email,
      scenario: scenarioDoc.slug,
      agentId,
      status: "in_progress",
      startedAt: now,
      transcript: [],
      updatedAt: now
    });

    await db.collection("voiceCoachSessions").doc(sessionId).set(session);

    void logAudit(user, "create", "voiceCoachSession", sessionId, {
      scenario: scenarioDoc.slug,
      scenarioId
    });

    return jsonResponse({
      signedUrl,
      sessionId,
      agentId,
      dynamicVariables: {
        scenario_persona: scenarioDoc.persona,
        scenario_opening: scenarioDoc.opening,
        rep_name: user.displayName || user.email
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
