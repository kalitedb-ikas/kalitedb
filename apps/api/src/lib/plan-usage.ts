import { ZERO_PLAN_USAGE, type PlanUsage } from "@kalitedb/shared";

import { getFirebaseAdminDb } from "./firebase-admin";

export async function getPlanUsage(): Promise<PlanUsage> {
  try {
    const db = getFirebaseAdminDb();
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [seatSnap, scenarioSnap, sessionSnap] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("roleplayScenarios").where("active", "==", true).count().get(),
      db.collection("voiceCoachSessions").where("startedAt", ">=", periodStart).get()
    ]);

    const minutesUsedThisMonth = Math.round(
      sessionSnap.docs.reduce((sum, doc) => {
        const v = doc.data().durationSec;
        return typeof v === "number" ? sum + v : sum;
      }, 0) / 60
    );

    return {
      seatCount: seatSnap.data().count,
      scenarioCount: scenarioSnap.data().count,
      minutesUsedThisMonth,
      voiceAgentCount: 1
    };
  } catch {
    return ZERO_PLAN_USAGE;
  }
}
