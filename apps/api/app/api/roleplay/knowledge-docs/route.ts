import {
  roleplayKnowledgeDocInputSchema,
  roleplayKnowledgeDocSchema,
  type RoleplayKnowledgeDoc
} from "@kalitedb/shared";

import { canManageRoleplayContent, requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import {
  syncKnowledgeDocAndAgent,
  type SyncOutcome
} from "@/src/lib/roleplay-knowledge-sync";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function GET(request: Request) {
  try {
    await requireAuth(request as never);
    const db = getFirebaseAdminDb();
    const snapshot = await db
      .collection("roleplayKnowledgeDocs")
      .orderBy("createdAt", "desc")
      .get();

    const docs: RoleplayKnowledgeDoc[] = [];
    for (const doc of snapshot.docs) {
      const parsed = roleplayKnowledgeDocSchema.safeParse({ id: doc.id, ...doc.data() });
      if (parsed.success) docs.push(parsed.data);
    }
    return jsonResponse(docs);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request as never);
    if (!canManageRoleplayContent(user)) {
      throw new ApiError(403, "Bilgi bankası dokümanı eklemek için role-play yöneticisi olmalısın.");
    }

    const input = roleplayKnowledgeDocInputSchema.parse(await request.json());

    const db = getFirebaseAdminDb();
    const docRef = db.collection("roleplayKnowledgeDocs").doc();
    const now = new Date().toISOString();

    const initial = roleplayKnowledgeDocSchema.parse({
      id: docRef.id,
      title: input.title,
      category: input.category,
      body: input.body,
      active: input.active ?? true,
      syncStatus: "pending",
      createdAt: now,
      updatedAt: now,
      createdBy: user.email
    });

    await docRef.set(initial);
    void logAudit(user, "create", "roleplayKnowledgeDoc", docRef.id, { title: initial.title });

    const outcome: SyncOutcome = await syncKnowledgeDocAndAgent(docRef.id);
    return jsonResponse(outcome.doc, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
