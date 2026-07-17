import { roleplayScenarioInputSchema, roleplayScenarioSchema } from "@kalitedb/shared";

import { canManageRoleplayContent, requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const patchSchema = roleplayScenarioInputSchema.partial();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  try {
    await requireAuth(request as never);
    const { scenarioId } = await params;
    const db = getFirebaseAdminDb();
    const doc = await db.collection("roleplayScenarios").doc(scenarioId).get();
    if (!doc.exists) {
      throw new ApiError(404, "Senaryo bulunamadı.");
    }
    const parsed = roleplayScenarioSchema.parse({ id: doc.id, ...doc.data() });
    return jsonResponse(parsed);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  try {
    const user = await requireAuth(request as never);
    if (!canManageRoleplayContent(user)) {
      throw new ApiError(403, "Senaryo güncellemek için role-play yöneticisi olmalısın.");
    }
    const { scenarioId } = await params;
    const patch = patchSchema.parse(await request.json());

    const db = getFirebaseAdminDb();
    const docRef = db.collection("roleplayScenarios").doc(scenarioId);
    const existing = await docRef.get();
    if (!existing.exists) {
      throw new ApiError(404, "Senaryo bulunamadı.");
    }

    if (patch.slug) {
      const conflict = await db
        .collection("roleplayScenarios")
        .where("slug", "==", patch.slug)
        .limit(1)
        .get();
      const conflictDoc = conflict.docs[0];
      if (conflictDoc && conflictDoc.id !== scenarioId) {
        throw new ApiError(409, `Bu slug zaten kullanımda: ${patch.slug}`);
      }
    }

    const merged = roleplayScenarioSchema.parse({
      ...existing.data(),
      ...patch,
      id: scenarioId,
      updatedAt: new Date().toISOString()
    });

    await docRef.set(merged);
    void logAudit(user, "update", "roleplayScenario", scenarioId, { slug: merged.slug });
    return jsonResponse(merged);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  try {
    const user = await requireAuth(request as never);
    if (!canManageRoleplayContent(user)) {
      throw new ApiError(403, "Senaryo silmek için role-play yöneticisi olmalısın.");
    }
    const { scenarioId } = await params;
    const db = getFirebaseAdminDb();
    const docRef = db.collection("roleplayScenarios").doc(scenarioId);
    const existing = await docRef.get();
    if (!existing.exists) {
      throw new ApiError(404, "Senaryo bulunamadı.");
    }
    await docRef.delete();
    void logAudit(user, "delete", "roleplayScenario", scenarioId);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
