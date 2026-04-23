import { salesMeetingSchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const createSchema = z.object({
  date: z.string().optional(),
  qualityMember: z.string().min(1),
  salesRepresentative: z.string().min(1),
  customerName: z.string().min(1),
  status: z.enum(["devam_ediyor", "kapandi", "kaybedildi"]).optional(),
  licenseDetail: z.string().optional(),
  licenseAmount: z.number().nullable().optional(),
  lossReason: z.string().trim().max(60).optional(),
  lossNote: z.string().trim().max(500).optional()
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
      .collection("salesMeetings")
      .get();

    const meetings = snapshot.docs
      .map((doc) => salesMeetingSchema.safeParse({ id: doc.id, ...doc.data() }))
      .filter((r): r is { success: true; data: z.infer<typeof salesMeetingSchema> } => r.success)
      .map((r) => r.data)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

    return jsonResponse(meetings);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader", "team", "ceo"]);
    const { periodId } = await params;
    const body = await request.json();
    const entry = createSchema.parse(body);

    const db = getFirebaseAdminDb();
    const colRef = db.collection("reportPeriods").doc(periodId).collection("salesMeetings");
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    await colRef.doc(id).set({
      id,
      periodId,
      date: entry.date ?? null,
      qualityMember: entry.qualityMember,
      salesRepresentative: entry.salesRepresentative,
      customerName: entry.customerName,
      status: entry.status ?? "devam_ediyor",
      licenseDetail: entry.licenseDetail ?? null,
      licenseAmount: entry.licenseAmount ?? null,
      ...(entry.lossReason ? { lossReason: entry.lossReason } : {}),
      ...(entry.lossNote ? { lossNote: entry.lossNote } : {}),
      createdAt: now,
      updatedAt: now
    });

    return jsonResponse({ id, created: true });
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
    const entries = z.array(createSchema).parse(body);

    const db = getFirebaseAdminDb();
    const colRef = db.collection("reportPeriods").doc(periodId).collection("salesMeetings");
    const now = new Date().toISOString();

    // Mevcut kayıtları sil
    const existing = await colRef.get();
    const batch = db.batch();
    for (const doc of existing.docs) {
      batch.delete(doc.ref);
    }

    // Yeni kayıtları yaz
    for (const entry of entries) {
      const id = crypto.randomUUID();
      batch.set(colRef.doc(id), {
        id,
        periodId,
        date: entry.date ?? null,
        qualityMember: entry.qualityMember,
        salesRepresentative: entry.salesRepresentative,
        customerName: entry.customerName,
        status: entry.status ?? "devam_ediyor",
        licenseDetail: entry.licenseDetail ?? null,
        licenseAmount: entry.licenseAmount ?? null,
        ...(entry.lossReason ? { lossReason: entry.lossReason } : {}),
        ...(entry.lossNote ? { lossNote: entry.lossNote } : {}),
        createdAt: now,
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
    const docRef = db.collection("reportPeriods").doc(periodId).collection("salesMeetings").doc(id);
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
    const docRef = db.collection("reportPeriods").doc(periodId).collection("salesMeetings").doc(id);
    await docRef.delete();
    return jsonResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
