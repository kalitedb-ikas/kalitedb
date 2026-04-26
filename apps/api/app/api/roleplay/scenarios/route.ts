import {
  roleplayScenarioInputSchema,
  roleplayScenarioSchema,
  type RoleplayScenario
} from "@kalitedb/shared";

import { canManageRoleplayContent, requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function GET(request: Request) {
  try {
    await requireAuth(request as never);
    const db = getFirebaseAdminDb();
    const snapshot = await db
      .collection("roleplayScenarios")
      .orderBy("sortOrder", "asc")
      .get();

    const scenarios: RoleplayScenario[] = [];
    for (const doc of snapshot.docs) {
      const parsed = roleplayScenarioSchema.safeParse({ id: doc.id, ...doc.data() });
      if (parsed.success) scenarios.push(parsed.data);
    }
    return jsonResponse(scenarios);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request as never);
    if (!canManageRoleplayContent(user)) {
      throw new ApiError(403, "Senaryo eklemek için role-play yöneticisi olmalısın.");
    }

    const body = await request.json();
    const input = roleplayScenarioInputSchema.parse(body);

    const db = getFirebaseAdminDb();
    const slug = input.slug.trim();

    const conflict = await db
      .collection("roleplayScenarios")
      .where("slug", "==", slug)
      .limit(1)
      .get();
    if (!conflict.empty) {
      throw new ApiError(409, `Bu slug zaten kullanımda: ${slug}`);
    }

    const docRef = db.collection("roleplayScenarios").doc();
    const now = new Date().toISOString();
    const scenario = roleplayScenarioSchema.parse({
      id: docRef.id,
      slug,
      title: input.title,
      description: input.description,
      difficulty: input.difficulty,
      persona: input.persona,
      opening: input.opening,
      context: input.context ?? "",
      goals: input.goals ?? [],
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
      createdBy: user.email
    });

    await docRef.set(scenario);
    void logAudit(user, "create", "roleplayScenario", docRef.id, { slug });

    return jsonResponse(scenario, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
