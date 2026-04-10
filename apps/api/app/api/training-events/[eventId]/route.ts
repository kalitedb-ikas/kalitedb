import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  color: z.string().optional(),
  participants: z.array(z.string()).optional(),
  trainer: z.string().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader", "team", "ceo"]);
    const { eventId } = await params;
    const body = await request.json();
    const patch = patchSchema.parse(body);

    const db = getFirebaseAdminDb();
    const docRef = db.collection("trainingEvents").doc(eventId);
    const existing = await docRef.get();

    if (!existing.exists) {
      throw new ApiError(404, "Etkinlik bulunamadı.");
    }

    const updated = {
      ...existing.data(),
      ...patch,
      id: eventId,
      updatedAt: new Date().toISOString()
    };

    await docRef.set(updated);
    return jsonResponse(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader", "team", "ceo"]);
    const { eventId } = await params;

    const db = getFirebaseAdminDb();
    const docRef = db.collection("trainingEvents").doc(eventId);
    const existing = await docRef.get();

    if (!existing.exists) {
      throw new ApiError(404, "Etkinlik bulunamadı.");
    }

    await docRef.delete();
    return jsonResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
