import { isFirebaseAdminAvailable, getFirebaseAdminDb } from "./firebase-admin";
import type { AuthUser } from "./auth";

export type AuditAction = "login" | "create" | "update" | "delete" | "import" | "publish" | "reopen";

export async function logAudit(
  user: AuthUser,
  action: AuditAction,
  resource: string,
  resourceId?: string,
  details?: Record<string, unknown>
) {
  if (!isFirebaseAdminAvailable()) return;
  try {
    const db = getFirebaseAdminDb();
    await db.collection("auditLogs").add({
      action,
      resource,
      resourceId: resourceId ?? null,
      userEmail: user.email,
      userName: user.displayName,
      details: details ?? null,
      timestamp: new Date().toISOString()
    });
  } catch {
    // Audit log hatası API'yi kırmamalı
  }
}
