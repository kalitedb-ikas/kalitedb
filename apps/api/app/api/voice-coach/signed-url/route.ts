import { voiceCoachScenarioSchema, voiceCoachSessionSchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { SCENARIO_BRIEFS, canStartSession, createSignedUrl } from "@/src/lib/elevenlabs";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const bodySchema = z.object({
  scenario: voiceCoachScenarioSchema
});

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request as never);
    const entitlement = canStartSession(user);
    if (!entitlement.allowed) {
      throw new ApiError(403, entitlement.reason ?? "Bu işlem için yetkin yok.");
    }
    const { scenario } = bodySchema.parse(await request.json());

    const { signedUrl, agentId } = await createSignedUrl();
    const brief = SCENARIO_BRIEFS[scenario];

    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const session = voiceCoachSessionSchema.parse({
      sessionId,
      repEmail: user.email,
      repUid: user.uid,
      repName: user.displayName || user.email,
      scenario,
      agentId,
      status: "in_progress",
      startedAt: now,
      transcript: [],
      updatedAt: now
    });

    const db = getFirebaseAdminDb();
    await db.collection("voiceCoachSessions").doc(sessionId).set(session);

    void logAudit(user, "create", "voiceCoachSession", sessionId, { scenario });

    return jsonResponse({
      signedUrl,
      sessionId,
      agentId,
      dynamicVariables: {
        scenario_persona: brief.persona,
        scenario_opening: brief.opening,
        rep_name: user.displayName || user.email
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
