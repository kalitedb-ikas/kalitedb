import { departmentSchema, roleSchema, userRoleAssignmentSchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { getRepository } from "@/src/lib/repository";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const upsertRoleSchema = z
  .object({
    uid: z.string().optional(),
    email: z.string().email(),
    role: roleSchema,
    departments: z.array(departmentSchema).default([]),
    representativeKey: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.role === "representative" && !value.representativeKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["representativeKey"],
        message: "Temsilci rolü için temsilci eşleşmesi zorunludur."
      });
    }
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
    const user = await requireAuth(request as never, ["admin"]);
    const body = upsertRoleSchema.parse(await request.json());
    const repository = await getRepository();
    const now = new Date().toISOString();
    const roleAssignment = userRoleAssignmentSchema.parse({
      ...body,
      createdAt: now,
      updatedAt: now
    });
    const result = await repository.upsertUserRole(roleAssignment);
    void logAudit(user, "update", "userRole", body.email, {
      role: body.role,
      departments: body.departments,
      representativeKey: body.representativeKey ?? null
    });
    return jsonResponse(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
