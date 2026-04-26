import {
  PLANS,
  planSchema,
  type Plan,
  type PlanFeatureKey,
  type PlanLimits
} from "@kalitedb/shared";

import { getFirebaseAdminDb } from "./firebase-admin";
import { ApiError } from "./responses";

const SETTINGS_COLLECTION = "settings";
const SETTINGS_DOC = "billing";
const DEFAULT_PLAN: Plan = "starter";
const CACHE_TTL_MS = 30_000;

let cached: { plan: Plan; fetchedAt: number } | null = null;

export async function getCurrentPlan(): Promise<Plan> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.plan;

  try {
    const snap = await getFirebaseAdminDb().collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get();
    const raw = snap.exists ? snap.data()?.plan : undefined;
    const parsed = planSchema.safeParse(raw);
    const plan = parsed.success ? parsed.data : DEFAULT_PLAN;
    cached = { plan, fetchedAt: now };
    return plan;
  } catch {
    return DEFAULT_PLAN;
  }
}

export function invalidatePlanCache(): void {
  cached = null;
}

export async function getPlanLimits(): Promise<{ plan: Plan; limits: PlanLimits }> {
  const plan = await getCurrentPlan();
  return { plan, limits: PLANS[plan] };
}

export async function requireFeature(feature: PlanFeatureKey): Promise<void> {
  const { plan, limits } = await getPlanLimits();
  if (!limits.features[feature]) {
    throw new ApiError(402, `Bu özellik mevcut planında yok (${plan}). Yükseltme gerekli.`);
  }
}

export async function assertSeatLimit(): Promise<void> {
  const { plan, limits } = await getPlanLimits();
  if (limits.seats === null) return;
  const snap = await getFirebaseAdminDb().collection("users").count().get();
  const used = snap.data().count;
  if (used >= limits.seats) {
    throw new ApiError(402, `Koltuk limiti doldu: ${used}/${limits.seats} (${plan}).`);
  }
}

export async function assertScenarioLimit(): Promise<void> {
  const { plan, limits } = await getPlanLimits();
  if (limits.scenarios === null) return;
  const snap = await getFirebaseAdminDb()
    .collection("roleplayScenarios")
    .where("active", "==", true)
    .count()
    .get();
  const used = snap.data().count;
  if (used >= limits.scenarios) {
    throw new ApiError(402, `Senaryo limiti doldu: ${used}/${limits.scenarios} (${plan}).`);
  }
}

export async function assertMonthlyMinuteQuota(estimatedAdditionalSec = 0): Promise<void> {
  const { plan, limits } = await getPlanLimits();
  if (limits.monthlyMinutes === null) return;

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const snap = await getFirebaseAdminDb()
    .collection("voiceCoachSessions")
    .where("startedAt", ">=", periodStart)
    .get();

  const usedSec = snap.docs.reduce((sum, doc) => {
    const v = doc.data().durationSec;
    return typeof v === "number" ? sum + v : sum;
  }, 0);

  const projectedMinutes = (usedSec + estimatedAdditionalSec) / 60;
  if (projectedMinutes >= limits.monthlyMinutes) {
    throw new ApiError(
      402,
      `Aylık dakika kotası doldu: ${Math.round(usedSec / 60)}/${limits.monthlyMinutes} dk (${plan}).`
    );
  }
}

export async function assertVoiceAgentLimit(activeAgentCount: number): Promise<void> {
  const { plan, limits } = await getPlanLimits();
  if (limits.voiceAgents === null) return;
  if (activeAgentCount >= limits.voiceAgents) {
    throw new ApiError(
      402,
      `Ses agent limiti doldu: ${activeAgentCount}/${limits.voiceAgents} (${plan}).`
    );
  }
}
