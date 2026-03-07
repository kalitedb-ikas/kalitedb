import { roleSchema, userRoleAssignmentSchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const upsertRoleSchema = z.object({
  uid: z.string().optional(),
  email: z.string().email(),
  role: roleSchema
});

export async function GET(request: Request) {
  try {
    await requireAuth(request as never, ["admin"]);
    const repository = await getRepository();
    const roles = await repository.listUserRoles();
    return jsonResponse(roles);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth(request as never, ["admin"]);
    const body = upsertRoleSchema.parse(await request.json());
    const repository = await getRepository();
    const now = new Date().toISOString();
    const roleAssignment = userRoleAssignmentSchema.parse({
      ...body,
      createdAt: now,
      updatedAt: now
    });
    const result = await repository.upsertUserRole(roleAssignment);
    return jsonResponse(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
