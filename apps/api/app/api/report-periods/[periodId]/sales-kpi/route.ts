import { normalizeKey, salesKpiDataSchema, licenseSummarySchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getFirebaseAdminDb } from "@/src/lib/firebase-admin";
import { getRepository } from "@/src/lib/repository";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

/** Satış temsilcilerini representatives koleksiyonuna otomatik kaydet */
async function autoRegisterSalesAgents(agents: Array<{ agentKey: string; agentName: string }>) {
  try {
    const repository = await getRepository();
    const now = new Date().toISOString();
    for (const agent of agents) {
      const key = agent.agentKey || normalizeKey(agent.agentName);
      if (!key) continue;
      const existing = await repository.getRepresentative(key);
      if (!existing) {
        await repository.upsertRepresentative({
          key,
          displayName: agent.agentName,
          department: "sales",
          status: "active",
          createdAt: now,
          updatedAt: now
        });
      }
    }
  } catch { /* Temsilci kaydı başarısız olursa KPI işlemini engelleme */ }
}

export const OPTIONS = optionsResponse;

const agentSchema = z.object({
  agentKey: z.string().optional(),
  agentName: z.string().min(1),
  perfScore: z.number().nullable(),
  salesAmount: z.number(),
  licenseCount: z.number(),
  avgLicensePrice: z.number(),
  talkDurationSeconds: z.number(),
  callAttempts: z.number(),
  conversionRate: z.number(),
  scaleCount: z.number().default(0),
  scalePlusCount: z.number().default(0),
  scaleConversion: z.number().default(0),
  scalePlusConversion: z.number().default(0),
  totalConversion: z.number().default(0)
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update-agent"),
    agentKey: z.string(),
    updates: z.record(z.unknown())
  }),
  z.object({
    action: z.literal("delete-agent"),
    agentKey: z.string()
  }),
  z.object({
    action: z.literal("add-agent"),
    agent: agentSchema
  }),
  z.object({
    action: z.literal("update-targets"),
    targets: z.record(z.unknown())
  }),
  z.object({
    action: z.literal("reset-agents")
  }),
  z.object({
    action: z.literal("update-license-summary"),
    licenseSummary: licenseSummarySchema
  })
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never);
    const { periodId } = await params;
    const db = getFirebaseAdminDb();
    const docRef = db.collection("reportPeriods").doc(periodId).collection("salesKpiData").doc("main");
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return jsonResponse(null);
    }

    const parsed = salesKpiDataSchema.safeParse(snapshot.data());
    return jsonResponse(parsed.success ? parsed.data : null);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader", "team", "ceo"]);
    const { periodId } = await params;
    const body = await request.json();
    const data = salesKpiDataSchema.parse(body);

    const db = getFirebaseAdminDb();
    const docRef = db.collection("reportPeriods").doc(periodId).collection("salesKpiData").doc("main");
    await docRef.set(data);
    await autoRegisterSalesAgents(data.agents);
    return jsonResponse({ saved: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> }
) {
  try {
    await requireAuth(request as never, ["admin", "manager", "team_leader", "team", "ceo"]);
    const { periodId } = await params;
    const body = await request.json();
    const payload = patchSchema.parse(body);

    const db = getFirebaseAdminDb();
    const docRef = db.collection("reportPeriods").doc(periodId).collection("salesKpiData").doc("main");
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return new Response(JSON.stringify({ error: "KPI verisi bulunamadı" }), { status: 404 });
    }

    const current = salesKpiDataSchema.parse(snapshot.data());
    const now = new Date().toISOString();

    if (payload.action === "update-agent") {
      const idx = current.agents.findIndex((a) => a.agentKey === payload.agentKey);
      if (idx === -1) {
        return new Response(JSON.stringify({ error: "Temsilci bulunamadı" }), { status: 404 });
      }
      current.agents[idx] = { ...current.agents[idx], ...payload.updates } as typeof current.agents[number];
      current.updatedAt = now;
      await docRef.set(current);
      return jsonResponse({ updated: true });
    }

    if (payload.action === "delete-agent") {
      current.agents = current.agents.filter((a) => a.agentKey !== payload.agentKey);
      current.updatedAt = now;
      await docRef.set(current);
      return jsonResponse({ deleted: true });
    }

    if (payload.action === "reset-agents") {
      current.agents = [];
      current.updatedAt = now;
      await docRef.set(current);
      return jsonResponse({ reset: true });
    }

    if (payload.action === "add-agent") {
      const agentKey = payload.agent.agentKey || normalizeKey(payload.agent.agentName);
      current.agents.push({ ...payload.agent, agentKey });
      current.updatedAt = now;
      await docRef.set(current);
      await autoRegisterSalesAgents([{ agentKey, agentName: payload.agent.agentName }]);
      return jsonResponse({ added: true, agentKey });
    }

    if (payload.action === "update-targets") {
      current.targets = { ...current.targets, ...payload.targets } as typeof current.targets;
      current.updatedAt = now;
      await docRef.set(current);
      return jsonResponse({ updated: true });
    }

    if (payload.action === "update-license-summary") {
      (current as Record<string, unknown>).licenseSummary = payload.licenseSummary;
      current.updatedAt = now;
      await docRef.set(current);
      return jsonResponse({ updated: true });
    }

    return new Response(JSON.stringify({ error: "Geçersiz action" }), { status: 400 });
  } catch (error) {
    return handleRouteError(error);
  }
}
