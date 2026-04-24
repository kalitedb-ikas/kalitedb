import { requireAuth } from "@/src/lib/auth";
import { canStartSession } from "@/src/lib/elevenlabs";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request as never);
    const result = canStartSession(user);
    return jsonResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
