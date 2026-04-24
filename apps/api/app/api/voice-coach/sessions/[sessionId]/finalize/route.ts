import {
  voiceCoachCoachingSchema,
  voiceCoachSessionSchema,
  voiceCoachTranscriptTurnSchema
} from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { fetchConversationAudio } from "@/src/lib/elevenlabs";
import { getFirebaseAdminDb, getFirebaseAdminStorage } from "@/src/lib/firebase-admin";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const finalizeSchema = z.object({
  transcript: z.array(voiceCoachTranscriptTurnSchema).default([]),
  elevenlabsConversationId: z.string().optional(),
  durationSec: z.number().int().nonnegative().optional(),
  status: z.enum(["completed", "failed"]).default("completed"),
  coaching: voiceCoachCoachingSchema.optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireAuth(request as never);
    const { sessionId } = await params;
    const body = finalizeSchema.parse(await request.json());

    const db = getFirebaseAdminDb();
    const ref = db.collection("voiceCoachSessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new ApiError(404, "Oturum bulunamadı.");
    }

    const current = voiceCoachSessionSchema.parse(snap.data());
    if (current.repEmail !== user.email && !["admin", "manager", "team_leader", "team", "ceo"].includes(user.role)) {
      throw new ApiError(403, "Bu oturumu güncelleyemezsiniz.");
    }

    const now = new Date().toISOString();
    const merged = voiceCoachSessionSchema.parse({
      ...current,
      transcript: body.transcript.length ? body.transcript : current.transcript,
      elevenlabsConversationId: body.elevenlabsConversationId ?? current.elevenlabsConversationId,
      durationSec: body.durationSec ?? current.durationSec,
      status: body.status,
      coaching: body.coaching ?? current.coaching,
      endedAt: current.endedAt ?? now,
      updatedAt: now
    });

    await ref.set(merged);

    if (merged.status === "completed" && merged.elevenlabsConversationId && !merged.audioStoragePath) {
      try {
        const audio = await fetchConversationAudio(merged.elevenlabsConversationId);
        const storagePath = `voice-coach/${sessionId}.mp3`;
        const bucket = getFirebaseAdminStorage().bucket();
        const file = bucket.file(storagePath);
        await file.save(audio, {
          contentType: "audio/mpeg",
          metadata: {
            metadata: {
              sessionId,
              repEmail: merged.repEmail,
              scenario: merged.scenario
            }
          }
        });
        const [signedUrl] = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + 1000 * 60 * 60 * 24 * 365
        });
        const enriched = voiceCoachSessionSchema.parse({
          ...merged,
          audioStoragePath: storagePath,
          audioUrl: signedUrl,
          updatedAt: new Date().toISOString()
        });
        await ref.set(enriched);

        void logAudit(user, "update", "voiceCoachSession", sessionId, {
          status: enriched.status,
          transcriptTurns: enriched.transcript.length,
          audioStored: true
        });

        return jsonResponse(enriched);
      } catch (audioError) {
        console.warn("voice-coach audio store failed", audioError);
      }
    }

    void logAudit(user, "update", "voiceCoachSession", sessionId, {
      status: merged.status,
      transcriptTurns: merged.transcript.length
    });

    return jsonResponse(merged);
  } catch (error) {
    return handleRouteError(error);
  }
}
