import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { getRepository } from "@/src/lib/repository";
import { handleRouteError, jsonResponse, optionsResponse } from "@/src/lib/responses";

export const OPTIONS = optionsResponse;

const createPeriodSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  title: z.string().min(1),
  compareToPeriodId: z.string().optional()
});

export async function GET() {
  try {
    const repository = await getRepository();
    const periods = await repository.listReportPeriods();
    return jsonResponse(periods);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth(request as never, ["admin", "team"]);
    const body = createPeriodSchema.parse(await request.json());
    const repository = await getRepository();
    const period = await repository.createReportPeriod({
      month: body.month,
      title: body.title,
      ...(body.compareToPeriodId ? { compareToPeriodId: body.compareToPeriodId } : {})
    });
    return jsonResponse(period, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
