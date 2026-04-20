import { timelineEventSchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const patchRepresentativeSchema = z.object({
  status: z.enum(["active", "departed", "department_changed"]).optional(),
  department: z.enum(["cs", "sales", "quality", "partner"]).optional(),
  displayName: z.string().min(1).optional(),
  statusNote: z.string().optional(),
  badges: z.array(z.string()).optional(),
  timeline: z.array(timelineEventSchema).optional()
});

export async function DELETE(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader"]);
    const { key } = await params;
    const repository = await getRepository();
    const existing = await repository.getRepresentative(key);
    if (!existing) {
      throw new ApiError(404, "Temsilci bulunamadı.");
    }
    await repository.deleteRepresentative(key);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader"]);
    const { key } = await params;
    const body = patchRepresentativeSchema.parse(await request.json());

    const repository = await getRepository();
    const existing = await repository.getRepresentative(key);
    if (!existing) {
      throw new ApiError(404, "Temsilci bulunamadı.");
    }

    const updated = await repository.upsertRepresentative({
      ...existing,
      ...(body.status != null ? { status: body.status } : {}),
      ...(body.department != null ? { department: body.department } : {}),
      ...(body.displayName != null ? { displayName: body.displayName } : {}),
      ...(body.statusNote != null ? { statusNote: body.statusNote } : {}),
      ...(body.badges != null ? { badges: body.badges } : {}),
      ...(body.timeline != null ? { timeline: body.timeline } : {}),
      updatedAt: new Date().toISOString()
    });

    return jsonResponse(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
