import { describe, expect, it } from "vitest";

import { buildDashboardSnapshot, selectDefaultReportPeriod } from "./dashboard";
import type { AgentMetric, ReportDatasets, ReportPeriod } from "./domain";

function buildPeriod(overrides: Partial<ReportPeriod> & Pick<ReportPeriod, "id" | "month" | "title">): ReportPeriod {
  return {
    id: overrides.id,
    month: overrides.month,
    title: overrides.title,
    status: overrides.status ?? "draft",
    department: overrides.department ?? "cs",
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

function buildAgentMetric(
  overrides: Partial<AgentMetric> & Pick<AgentMetric, "id" | "agentKey" | "agentName">
): AgentMetric {
  return {
    id: overrides.id,
    period: overrides.period ?? "2026-02",
    agentKey: overrides.agentKey,
    agentName: overrides.agentName,
    auditScore: overrides.auditScore ?? 80,
    previousAuditAccuracy: overrides.previousAuditAccuracy ?? 78,
    totalCallCount: overrides.totalCallCount ?? 100,
    totalChatMailCount: overrides.totalChatMailCount ?? 10,
    totalTicketClosedCount: overrides.totalTicketClosedCount ?? 5,
    totalConversationCount:
      overrides.totalConversationCount ??
      (overrides.totalCallCount ?? 100) + (overrides.totalChatMailCount ?? 10) + (overrides.totalTicketClosedCount ?? 5),
    avgTalkDurationSeconds: overrides.avgTalkDurationSeconds ?? 240,
    localCloseRate: overrides.localCloseRate ?? 82,
    missedCalls: overrides.missedCalls ?? 3,
    callEvaluationAverage: overrides.callEvaluationAverage ?? null,
    evaluationCount: overrides.evaluationCount ?? 20
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

describe("buildDashboardSnapshot", () => {
  it("csat liderliginde esit puanli temsilcileri birlikte gosterir", () => {
    const datasets: ReportDatasets = {
      agentMetrics: [
        buildAgentMetric({
          id: "seda",
          agentKey: "seda",
          agentName: "Seda",
          callEvaluationAverage: 4.93
        }),
        buildAgentMetric({
          id: "tugay",
          agentKey: "tugay",
          agentName: "Tugay",
          callEvaluationAverage: 4.93
        }),
        buildAgentMetric({
          id: "ece",
          agentKey: "ece",
          agentName: "Ece",
          callEvaluationAverage: 4.88
        })
      ],
      auditMetrics: [],
      questionPerformance: [],
      qtMetrics: []
    };

    const snapshot = buildDashboardSnapshot({
      period: buildPeriod({
        id: "feb",
        month: "2026-02",
        title: "Subat",
        status: "published",
        publishedAt: "2026-03-05T00:00:00.000Z"
      }),
      datasets
    });

    expect(snapshot.highlights.bestCsat?.label).toBe("Seda ve Tugay");
    expect(snapshot.highlights.bestCsat?.value).toBe(4.93);
  });
});
