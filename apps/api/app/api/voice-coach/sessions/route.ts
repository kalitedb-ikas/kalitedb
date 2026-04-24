import { voiceCoachSessionSchema } from "@kalitedb/shared";

import { requireAuth } from "@/src/lib/auth";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request as never);
    const url = new URL(request.url);
    const repEmailFilter = url.searchParams.get("repEmail");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);

    const db = getFirebaseAdminDb();
    let query: FirebaseFirestore.Query = db.collection("voiceCoachSessions");

    const isManager = ["admin", "manager", "team_leader", "team", "ceo"].includes(user.role);
    if (!isManager) {
      query = query.where("repEmail", "==", user.email);
    } else if (repEmailFilter) {
      query = query.where("repEmail", "==", repEmailFilter);
    }

    const snapshot = await query.get();
    const sessions = snapshot.docs
      .map((doc) => voiceCoachSessionSchema.safeParse(doc.data()))
      .filter((r): r is { success: true; data: ReturnType<typeof voiceCoachSessionSchema.parse> } => r.success)
      .map((r) => r.data)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);

    return jsonResponse(sessions);
  } catch (error) {
    return handleRouteError(error);
  }
}
