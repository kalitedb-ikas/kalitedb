import { voiceCoachSessionSchema } from "@kalitedb/shared";

import { requireAuth } from "@/src/lib/auth";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireAuth(request as never);
    const { sessionId } = await params;

    const db = getFirebaseAdminDb();
    const doc = await db.collection("voiceCoachSessions").doc(sessionId).get();
    if (!doc.exists) {
      throw new ApiError(404, "Oturum bulunamadı.");
    }

    const session = voiceCoachSessionSchema.parse(doc.data());

    const isManager = ["admin", "manager", "team_leader", "team", "ceo"].includes(user.role);
    if (!isManager && session.repEmail !== user.email) {
      throw new ApiError(403, "Bu oturuma erişiminiz yok.");
    }

    return jsonResponse(session);
  } catch (error) {
    return handleRouteError(error);
  }
}
