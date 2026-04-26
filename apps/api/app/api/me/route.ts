import { requireAuth } from "@/src/lib/auth";
import { getPlanLimits } from "@/src/lib/plan";
import { getPlanUsage } from "@/src/lib/plan-usage";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request as never);
    const [{ plan, limits }, usage] = await Promise.all([getPlanLimits(), getPlanUsage()]);
    return jsonResponse({ ...user, plan, limits, usage });
  } catch (error) {
    return handleRouteError(error);
  }
}
