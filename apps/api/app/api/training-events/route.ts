import { trainingEventSchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const createSchema = z.object({
  title: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  color: z.string().default("#3b82f6"),
  participants: z.array(z.string()).default([]),
  trainer: z.string().optional(),
  department: z.enum(["cs", "sales"]).default("sales")
});

export async function GET(request: Request) {
  try {
    await requireAuth(request as never);
    const url = new URL(request.url);
    const month = url.searchParams.get("month");

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return jsonResponse([], { status: 200 });
    }

    const [yearStr, monthStr] = month.split("-");
    const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

    const db = getFirebaseAdminDb();
    const snapshot = await db
      .collection("trainingEvents")
      .where("date", ">=", startDate)
      .where("date", "<=", endDate)
      .orderBy("date", "asc")
      .get();

    const events = snapshot.docs
      .map((doc) => trainingEventSchema.safeParse({ id: doc.id, ...doc.data() }))
      .filter((r): r is { success: true; data: z.infer<typeof trainingEventSchema> } => r.success)
      .map((r) => r.data);

    return jsonResponse(events);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader", "team", "ceo"]);
    const body = await request.json();
    const input = createSchema.parse(body);

    const db = getFirebaseAdminDb();
    const now = new Date().toISOString();
    const docRef = db.collection("trainingEvents").doc();

    const data = {
      id: docRef.id,
      ...input,
      createdAt: now,
      updatedAt: now
    };

    await docRef.set(data);
    return jsonResponse(data, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
