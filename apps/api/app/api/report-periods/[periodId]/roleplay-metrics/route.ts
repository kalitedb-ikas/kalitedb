import { normalizeKey, roleplayMetricSchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const entrySchema = z.object({
  agentKey: z.string().optional(),
  agentName: z.string().min(1),
  rolePlayCount: z.number().int().nonnegative(),
  revOpsCount: z.number().int().nonnegative().nullable(),
  note: z.string().optional()
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never);
    const { periodId } = await params;
    const db = getFirebaseAdminDb();
    const snapshot = await db.collection("reportPeriods").doc(periodId).collection("roleplayMetrics").get();

    const metrics = snapshot.docs
      .map((doc) => roleplayMetricSchema.safeParse(doc.data()))
      .filter((r): r is { success: true; data: z.infer<typeof roleplayMetricSchema> } => r.success)
      .map((r) => r.data)
      .sort((a, b) => a.agentName.localeCompare(b.agentName, "tr"));

    return jsonResponse(metrics);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader", "team", "ceo"]);
    const { periodId } = await params;
    const body = await request.json();
    const entries = z.array(entrySchema).parse(body);

    const db = getFirebaseAdminDb();
    const colRef = db.collection("reportPeriods").doc(periodId).collection("roleplayMetrics");
    const now = new Date().toISOString();

    // Mevcut kayitlari sil
    const existing = await colRef.get();
    const batch = db.batch();
    for (const doc of existing.docs) {
      batch.delete(doc.ref);
    }

    // Yeni kayitlari yaz
    for (const entry of entries) {
      const agentKey = entry.agentKey || normalizeKey(entry.agentName);
      const docRef = colRef.doc(agentKey);
      batch.set(docRef, {
        agentKey,
        agentName: entry.agentName,
        rolePlayCount: entry.rolePlayCount,
        revOpsCount: entry.revOpsCount,
        ...(entry.note ? { note: entry.note } : {}),
        updatedAt: now
      });
    }

    await batch.commit();
    return jsonResponse({ saved: entries.length });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader", "team", "ceo"]);
    const { periodId } = await params;
    const body = await request.json();
    const { agentKey, ...updates } = body as { agentKey: string; [key: string]: unknown };
    if (!agentKey) {
      return new Response(JSON.stringify({ error: "agentKey gerekli" }), { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const docRef = db.collection("reportPeriods").doc(periodId).collection("roleplayMetrics").doc(agentKey);
    const existing = await docRef.get();
    if (!existing.exists) {
      return new Response(JSON.stringify({ error: "Kayıt bulunamadı" }), { status: 404 });
    }

    await docRef.update({ ...updates, updatedAt: new Date().toISOString() });
    return jsonResponse({ updated: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader", "team", "ceo"]);
    const { periodId } = await params;
    const body = await request.json();
    const { agentKey } = body as { agentKey: string };
    if (!agentKey) {
      return new Response(JSON.stringify({ error: "agentKey gerekli" }), { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const docRef = db.collection("reportPeriods").doc(periodId).collection("roleplayMetrics").doc(agentKey);
    await docRef.delete();
    return jsonResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
