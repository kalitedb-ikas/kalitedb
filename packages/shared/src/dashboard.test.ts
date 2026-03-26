import { describe, expect, it } from "vitest";

import { selectDefaultReportPeriod } from "./dashboard";
import type { ReportPeriod } from "./domain";

function buildPeriod(overrides: Partial<ReportPeriod> & Pick<ReportPeriod, "id" | "month" | "title">): ReportPeriod {
  return {
    id: overrides.id,
    month: overrides.month,
    title: overrides.title,
    status: overrides.status ?? "draft",
    createdAt: overrides.createdAt ?? "2026-03-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-01T00:00:00.000Z",
    ...(overrides.compareToPeriodId ? { compareToPeriodId: overrides.compareToPeriodId } : {}),
    ...(overrides.manualTotalCallCount !== undefined ? { manualTotalCallCount: overrides.manualTotalCallCount } : {}),
    ...(overrides.manualTotalChatMailCount !== undefined
      ? { manualTotalChatMailCount: overrides.manualTotalChatMailCount }
      : {}),
    ...(overrides.manualTotalTicketClosedCount !== undefined
      ? { manualTotalTicketClosedCount: overrides.manualTotalTicketClosedCount }
      : {}),
    ...(overrides.publishedAt ? { publishedAt: overrides.publishedAt } : {})
  };
}

describe("selectDefaultReportPeriod", () => {
  it("yayinlanmis donemi bos taslaklardan once secer", () => {
    const selected = selectDefaultReportPeriod([
      buildPeriod({
        id: "apr",
        month: "2026-04",
        title: "Nisan",
        status: "draft",
        updatedAt: "2026-04-10T00:00:00.000Z"
      }),
      buildPeriod({
        id: "feb",
        month: "2026-02",
        title: "Subat",
        status: "published",
        publishedAt: "2026-03-05T00:00:00.000Z",
        updatedAt: "2026-03-05T00:00:00.000Z"
      })
    ]);

    expect(selected?.id).toBe("feb");
  });

  it("yayinlanmis donem yoksa daha once yayinlanan donemi tercih eder", () => {
    const selected = selectDefaultReportPeriod([
      buildPeriod({
        id: "apr",
        month: "2026-04",
        title: "Nisan",
        updatedAt: "2026-04-10T00:00:00.000Z"
      }),
      buildPeriod({
        id: "feb",
        month: "2026-02",
        title: "Subat",
        publishedAt: "2026-03-05T00:00:00.000Z",
        updatedAt: "2026-03-25T00:00:00.000Z"
      })
    ]);

    expect(selected?.id).toBe("feb");
  });

  it("manuel toplam girilmis donemi tamamen bos taslaktan once secer", () => {
    const selected = selectDefaultReportPeriod([
      buildPeriod({
        id: "apr",
        month: "2026-04",
        title: "Nisan",
        updatedAt: "2026-04-10T00:00:00.000Z"
      }),
      buildPeriod({
        id: "mar",
        month: "2026-03",
        title: "Mart",
        manualTotalCallCount: 120,
        updatedAt: "2026-03-20T00:00:00.000Z"
      })
    ]);

    expect(selected?.id).toBe("mar");
  });
});
