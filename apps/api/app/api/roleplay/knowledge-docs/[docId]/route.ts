import {
  roleplayKnowledgeDocInputSchema,
  roleplayKnowledgeDocSchema
} from "@kalitedb/shared";

import { canManageRoleplayContent, requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { deleteKnowledgeDocById, syncAgentKnowledgeBase } from "@/src/lib/elevenlabs-kb";
import {
  collectActiveKnowledgeEntries,
  syncKnowledgeDocAndAgent
} from "@/src/lib/roleplay-knowledge-sync";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const patchSchema = roleplayKnowledgeDocInputSchema.partial();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    await requireAuth(request as never);
    const { docId } = await params;
    const db = getFirebaseAdminDb();
    const doc = await db.collection("roleplayKnowledgeDocs").doc(docId).get();
    if (!doc.exists) {
      throw new ApiError(404, "Doküman bulunamadı.");
    }
    const parsed = roleplayKnowledgeDocSchema.parse({ id: doc.id, ...doc.data() });
    return jsonResponse(parsed);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const user = await requireAuth(request as never);
    if (!canManageRoleplayContent(user)) {
      throw new ApiError(403, "Doküman güncellemek için role-play yöneticisi olmalısın.");
    }
    const { docId } = await params;
    const patch = patchSchema.parse(await request.json());

    const db = getFirebaseAdminDb();
    const docRef = db.collection("roleplayKnowledgeDocs").doc(docId);
    const existing = await docRef.get();
    if (!existing.exists) {
      throw new ApiError(404, "Doküman bulunamadı.");
    }

    const merged = roleplayKnowledgeDocSchema.parse({
      ...existing.data(),
      ...patch,
      id: docId,
      updatedAt: new Date().toISOString(),
      // İçerik veya başlık değiştiyse yeniden sync gerekir.
      syncStatus: "pending",
      syncError: undefined
    });

    await docRef.set(merged);
    void logAudit(user, "update", "roleplayKnowledgeDoc", docId, { title: merged.title });

    const outcome = await syncKnowledgeDocAndAgent(docId);
    return jsonResponse(outcome.doc);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const user = await requireAuth(request as never);
    if (!canManageRoleplayContent(user)) {
      throw new ApiError(403, "Doküman silmek için role-play yöneticisi olmalısın.");
    }
    const { docId } = await params;
    const db = getFirebaseAdminDb();
    const docRef = db.collection("roleplayKnowledgeDocs").doc(docId);
    const existing = await docRef.get();
    if (!existing.exists) {
      throw new ApiError(404, "Doküman bulunamadı.");
    }

    const data = existing.data() as { elevenlabsDocId?: string };
    if (data.elevenlabsDocId) {
      try {
        await deleteKnowledgeDocById(data.elevenlabsDocId);
      } catch (err) {
        console.error("[roleplay-kb] ElevenLabs sil hatası:", err);
      }
    }

    await docRef.delete();
    void logAudit(user, "delete", "roleplayKnowledgeDoc", docId);

    try {
      const entries = await collectActiveKnowledgeEntries();
      await syncAgentKnowledgeBase(entries);
    } catch (err) {
      console.error("[roleplay-kb] Agent sync hatası (silme sonrası):", err);
    }

    return jsonResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
