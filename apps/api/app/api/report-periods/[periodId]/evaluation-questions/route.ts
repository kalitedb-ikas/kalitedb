import { salesEvaluationQuestionSchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const entrySchema = z.object({
  id: z.string().optional(),
  questionText: z.string().min(1),
  answer: z.string().default(""),
  score: z.number()
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never);
    const { periodId } = await params;
    const db = getFirebaseAdminDb();
    const snapshot = await db
      .collection("reportPeriods")
      .doc(periodId)
      .collection("evaluationQuestions")
      .get();

    const questions = snapshot.docs
      .map((doc) => salesEvaluationQuestionSchema.safeParse({ id: doc.id, ...doc.data() }))
      .filter((r): r is { success: true; data: z.infer<typeof salesEvaluationQuestionSchema> } => r.success)
      .map((r) => r.data);

    return jsonResponse(questions);
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
    const colRef = db.collection("reportPeriods").doc(periodId).collection("evaluationQuestions");
    const now = new Date().toISOString();

    // Mevcut kayıtları sil
    const existing = await colRef.get();
    const batch = db.batch();
    for (const doc of existing.docs) {
      batch.delete(doc.ref);
    }

    // Yeni kayıtları yaz
    for (const entry of entries) {
      const id = entry.id || crypto.randomUUID();
      const docRef = colRef.doc(id);
      batch.set(docRef, {
        id,
        questionText: entry.questionText,
        answer: entry.answer,
        score: entry.score,
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
    const { id, ...updates } = body as { id: string; [key: string]: unknown };
    if (!id) {
      return new Response(JSON.stringify({ error: "id gerekli" }), { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const docRef = db.collection("reportPeriods").doc(periodId).collection("evaluationQuestions").doc(id);
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
    const { id } = body as { id: string };
    if (!id) {
      return new Response(JSON.stringify({ error: "id gerekli" }), { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const docRef = db.collection("reportPeriods").doc(periodId).collection("evaluationQuestions").doc(id);
    await docRef.delete();
    return jsonResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
