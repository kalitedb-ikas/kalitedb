import {
  roleplayKnowledgeDocSchema,
  type RoleplayKnowledgeDoc
} from "@kalitedb/shared";

import {
  syncAgentKnowledgeBase,
  upsertKnowledgeDoc,
  type KnowledgeBaseEntry
} from "./elevenlabs-kb";
import { getFirebaseAdminDb } from "./firebase-admin";
import { ApiError } from "./responses";

const COLLECTION = "roleplayKnowledgeDocs";

export type SyncOutcome = {
  doc: RoleplayKnowledgeDoc;
  success: boolean;
  error?: string;
};

export async function collectActiveKnowledgeEntries(): Promise<KnowledgeBaseEntry[]> {
  const db = getFirebaseAdminDb();
  const snapshot = await db.collection(COLLECTION).where("active", "==", true).get();
  const entries: KnowledgeBaseEntry[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as { elevenlabsDocId?: string; title?: string };
    if (!data.elevenlabsDocId) continue;
    entries.push({
      id: data.elevenlabsDocId,
      name: data.title ?? doc.id,
      usageMode: "auto"
    });
  }
  return entries;
}

/**
 * Tek bir doc'u ElevenLabs'a upsert eder, sonra agent'ı tüm aktif KB'lerle
 * yeniden senkronize eder. Hata olursa doc'a `syncStatus='error'` yazar ve
 * outcome.success=false döner — request'i kırmaz.
 */
export async function syncKnowledgeDocAndAgent(docId: string): Promise<SyncOutcome> {
  const db = getFirebaseAdminDb();
  const docRef = db.collection(COLLECTION).doc(docId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new ApiError(404, "Doküman bulunamadı.");
  }

  const current = roleplayKnowledgeDocSchema.parse({ id: snapshot.id, ...snapshot.data() });
  const now = new Date().toISOString();

  try {
    let elevenlabsDocId = current.elevenlabsDocId;

    if (current.active) {
      const upserted = await upsertKnowledgeDoc({
        title: current.title,
        category: current.category,
        body: current.body,
        elevenlabsDocId
      });
      elevenlabsDocId = upserted.documentationId;
    } else if (elevenlabsDocId) {
      // Pasifleştirildi: ElevenLabs tarafından kaldır.
      const { deleteKnowledgeDocById } = await import("./elevenlabs-kb");
      await deleteKnowledgeDocById(elevenlabsDocId);
      elevenlabsDocId = undefined;
    }

    const updated = roleplayKnowledgeDocSchema.parse({
      ...current,
      elevenlabsDocId,
      syncStatus: "synced",
      syncError: undefined,
      syncedAt: now,
      updatedAt: now
    });
    await docRef.set(updated);

    const entries = await collectActiveKnowledgeEntries();
    await syncAgentKnowledgeBase(entries);

    return { doc: updated, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    const failed = roleplayKnowledgeDocSchema.parse({
      ...current,
      syncStatus: "error",
      syncError: message.slice(0, 500),
      updatedAt: now
    });
    await docRef.set(failed);
    return { doc: failed, success: false, error: message };
  }
}
