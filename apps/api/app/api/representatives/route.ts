import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";
import { normalizeKey, representativeExclusionSurfaceSchema, representativeTableExclusionSchema, timelineEventSchema } from "@kalitedb/shared";

export const OPTIONS = optionsResponse;

const createRepresentativeSchema = z.object({
  displayName: z.string().min(1),
  department: z.enum(["cs", "sales", "quality", "partner"]),
  status: z.enum(["active", "departed", "department_changed"]).default("active"),
  statusNote: z.string().optional(),
  badges: z.array(z.string()).default([]),
  timeline: z.array(timelineEventSchema).default([]),
  exclusions: z.array(representativeExclusionSurfaceSchema).default([]),
  tableExclusions: z.array(representativeTableExclusionSchema).default([])
});

export async function GET(request: Request) {
  try {
    await requireAuth(request as never);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") as "active" | "departed" | "department_changed" | null;
    const department = url.searchParams.get("department") as "cs" | "sales" | "quality" | "partner" | null;

    const repository = await getRepository();
    const representatives = await repository.listRepresentatives({
      ...(status ? { status } : {}),
      ...(department ? { department } : {})
    });
    return jsonResponse(representatives);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader"]);
    const body = createRepresentativeSchema.parse(await request.json());
    const now = new Date().toISOString();

    const repository = await getRepository();
    const representative = await repository.upsertRepresentative({
      key: normalizeKey(body.displayName),
      displayName: body.displayName,
      department: body.department,
      status: body.status,
      statusNote: body.statusNote,
      badges: body.badges,
      timeline: body.timeline,
      exclusions: body.exclusions,
      tableExclusions: body.tableExclusions,
      createdAt: now,
      updatedAt: now
    });
    return jsonResponse(representative, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
