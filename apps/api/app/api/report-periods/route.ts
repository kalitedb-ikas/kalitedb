import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { getRepository } from "@/src/lib/repository";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const createPeriodSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  title: z.string().min(1),
  department: z.enum(["cs", "sales"]).default("cs"),
  compareToPeriodId: z.string().optional()
});

export async function GET() {
  try {
    const repository = await getRepository();
    const periods = await repository.listReportPeriods();
    return jsonResponse(periods);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request as never, ["admin", "team", "manager", "team_leader"]);
    const body = createPeriodSchema.parse(await request.json());
    const repository = await getRepository();
    const period = await repository.createReportPeriod({
      month: body.month,
      title: body.title,
      department: body.department,
      ...(body.compareToPeriodId ? { compareToPeriodId: body.compareToPeriodId } : {})
    });
    void logAudit(user, "create", "reportPeriod", period.id, { month: body.month, department: body.department });
    return jsonResponse(period, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
