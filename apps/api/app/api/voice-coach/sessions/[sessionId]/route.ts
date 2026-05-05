import { voiceCoachSessionSchema } from "@kalitedb/shared";

import { requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { getFirebaseAdminDb, getFirebaseAdminStorage } from "@/src/lib/firebase-admin";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

const SUPER_ADMIN_EMAILS = new Set([
  "zafer.coban@ikas.com",
  "cagrican.gumustepe@ikas.com",
  "yavuz.yalcin@ikas.com",
  "sercan.ari@ikas.com",
  "baturay.cetinel@ikas.com"
]);

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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireAuth(request as never);
    if (!SUPER_ADMIN_EMAILS.has(user.email.toLowerCase())) {
      throw new ApiError(403, "Bu oturumu silme yetkin yok.");
    }

    const { sessionId } = await params;
    const db = getFirebaseAdminDb();
    const ref = db.collection("voiceCoachSessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new ApiError(404, "Oturum bulunamadı.");
    }

    const session = voiceCoachSessionSchema.parse(snap.data());

    if (session.audioStoragePath) {
      try {
        const bucket = getFirebaseAdminStorage().bucket();
        await bucket.file(session.audioStoragePath).delete({ ignoreNotFound: true });
      } catch (storageError) {
        console.warn("voice-coach audio delete failed", storageError);
      }
    }

    await ref.delete();

    void logAudit(user, "delete", "voiceCoachSession", sessionId, {
      repEmail: session.repEmail,
      audioRemoved: Boolean(session.audioStoragePath)
    });

    return jsonResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
