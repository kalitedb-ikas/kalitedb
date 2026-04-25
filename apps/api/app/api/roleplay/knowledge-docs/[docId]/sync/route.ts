import { canManageRoleplayContent, requireAuth } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit-log";
import { syncKnowledgeDocAndAgent } from "@/src/lib/roleplay-knowledge-sync";
import { ApiError, handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const user = await requireAuth(request as never);
    if (!canManageRoleplayContent(user)) {
      throw new ApiError(403, "Senkronizasyon için role-play yöneticisi olmalısın.");
    }
    const { docId } = await params;

    const outcome = await syncKnowledgeDocAndAgent(docId);
    void logAudit(user, "update", "roleplayKnowledgeDoc", docId, {
      manualSync: true,
      success: outcome.success
    });
    return jsonResponse(outcome.doc);
  } catch (error) {
    return handleRouteError(error);
  }
}
