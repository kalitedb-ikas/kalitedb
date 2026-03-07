import { kpiMetricKeySchema, thresholdConfigSchema } from "@kalitedb/shared";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const patchThresholdSchema = z.record(kpiMetricKeySchema, thresholdConfigSchema.partial());

export async function GET(request: Request) {
  try {
    await requireAuth(request as never, ["admin", "team", "ceo"]);
    const repository = await getRepository();
    const thresholds = await repository.getThresholds();
    return jsonResponse(thresholds);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAuth(request as never, ["admin"]);
    const body = patchThresholdSchema.parse(await request.json());
    const repository = await getRepository();
    const current = await repository.getThresholds();

    const next = Object.fromEntries(
      Object.entries(body).map(([metric, patch]) => [metric, { ...current[metric as keyof typeof current], ...patch }])
    );

    const thresholds = await repository.updateThresholds(next);
    return jsonResponse(thresholds);
  } catch (error) {
    return handleRouteError(error);
  }
}

