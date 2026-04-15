import { requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { getRepository } from "@/src/lib/repository";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function POST(
  request: Request,
  context: { params: Promise<{ periodId: string }> }
) {
  try {
    const user = await requireAuth(request as never, ["admin", "team", "manager", "team_leader"]);
    const { periodId } = await context.params;
    const repository = await getRepository();
    const period = await repository.publishPeriod(periodId);
    void logAudit(user, "publish", "reportPeriod", periodId);
    return jsonResponse(period);
  } catch (error) {
    return handleRouteError(error);
  }
}
