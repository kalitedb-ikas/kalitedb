import { requireAuth } from "@/src/lib/auth";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request as never);
    return jsonResponse(user);
  } catch (error) {
    return handleRouteError(error);
  }
}

