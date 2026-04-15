import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebase";

export type AuditAction = "login" | "logout" | "create" | "update" | "delete" | "import" | "publish" | "reopen";

export async function logAudit(params: {
  action: AuditAction;
  resource: string;
  resourceId?: string | undefined;
  userEmail: string;
  userName?: string | undefined;
  details?: Record<string, unknown> | undefined;
}) {
  if (!firebaseDb) return;
  try {
    await addDoc(collection(firebaseDb, "auditLogs"), {
      ...params,
      timestamp: serverTimestamp()
    });
  } catch {
    // Audit log hatası uygulamayı kırmamalı
  }
}
