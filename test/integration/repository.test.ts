import path from "node:path";
import { rm } from "node:fs/promises";

import {
  buildDashboardSnapshot,
  DEFAULT_THRESHOLDS,
  type AgentMetric,
  type AuditMetric,
  type QtManualEntry,
  type QtMetric,
  type QuestionPerformance
} from "@kalitedb/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as DASHBOARD_GET } from "../../apps/api/app/api/dashboard/route";
import { GET as PERIOD_DETAILS_GET, PATCH } from "../../apps/api/app/api/report-periods/[periodId]/route";
import { GET as PERIODS_GET } from "../../apps/api/app/api/report-periods/route";
import { getRepository } from "../../apps/api/src/lib/repository";

const dataFile = path.join(process.cwd(), ".data", "local-db.json");

const agentMetric: AgentMetric = {
  id: "agent-1",
  period: "2026-02",
  agentKey: "ali-veli",
  agentName: "Ali Veli",
  auditScore: null,
  previousAuditAccuracy: null,
  totalCallCount: 100,
  totalChatMailCount: 40,
  totalTicketClosedCount: 3,
  totalConversationCount: 143,
  avgTalkDurationSeconds: 300,
  localCloseRate: 87,
  missedCalls: 2,
  callEvaluationAverage: 4.97,
  evaluationCount: 80
};

const auditMetric: AuditMetric = {
  id: "audit-1",
  period: "2026-02",
  agentKey: "ali-veli",
  agentName: "Ali Veli",
  auditScore: 91,
  previousAuditAccuracy: 88
};

const questionMetric: QuestionPerformance = {
  id: "question-1",
  period: "2026-02",
  topic: "Pazaryeri",
  questionText: "Trendyol onay bekliyor problemi nasil cozulur?",
  correctCount: 25,
  wrongCount: 9,
  accuracyRate: 73.53
};

const qtMetric: QtMetric = {
  id: "qt-1",
  period: "2026-02",
  representativeKey: "ayse-kalite",
  representativeName: "Ayşe Kalite",
  listenedCallCount: 40,
  listenedDurationSeconds: 54000,
  totalEvaluatedCallCount: 40,
  totalEvaluatedChatMailCount: 15,
  feedbackCount: 33,
  feedbackCoverage: 2.2
};

const qtManualEntry: QtManualEntry = {
  id: "qt-manual-1",
  periodId: "period-local",
  userKey: "dev-team",
  userEmail: "team@local.dev",
  userName: "Dev Team",
  totalListeningHours: 18.5,
  totalEvaluatedCallCount: 130,
  totalEvaluatedChatMailCount: 248,
  feedbackCount: 57,
  feedbackCoverage: 3.08,
  trainingCount: null,
  meetingCount: null,
  createdAt: new Date("2026-02-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-02-01T00:00:00.000Z").toISOString()
};

describe("file repository integration", () => {
  beforeEach(async () => {
    process.env.APP_DATA_DRIVER = "file";
    process.env.APP_AUTH_BYPASS = "true";
    await rm(dataFile, { force: true });
  });

  it("creates a draft period, imports datasets and publishes it", async () => {
    const repository = await getRepository();
    const period = await repository.createReportPeriod({
      month: "2026-02",
      title: "CS Şubat 2026"
    });

    await repository.replaceDataset(period.id, "agent-metrics", [agentMetric]);
    await repository.replaceDataset(period.id, "audit-metrics", [auditMetric]);
    await repository.replaceDataset(period.id, "question-performance", [questionMetric]);
    await repository.replaceDataset(period.id, "qt-metrics", [qtMetric]);

    const draftDetails = await repository.getPeriodDetails(period.id);
    expect(draftDetails?.datasets.agentMetrics).toHaveLength(1);
    expect(draftDetails?.datasets.auditMetrics).toHaveLength(1);
    expect(draftDetails?.datasets.questionPerformance[0]?.accuracyRate).toBe(73.53);

    const filteredDetails = await repository.getPeriodDetails(period.id, {
      datasetTypes: ["agent-metrics"],
      includeImportJobs: false
    });
    expect(filteredDetails?.datasets.agentMetrics).toHaveLength(1);
    expect(filteredDetails?.datasets.auditMetrics).toHaveLength(0);
    expect(filteredDetails?.datasets.questionPerformance).toHaveLength(0);

    const storedRecord = await repository.getDatasetRecord(period.id, "agent-metrics", agentMetric.id);
    expect(storedRecord?.agentName).toBe("Ali Veli");

    const published = await repository.publishPeriod(period.id);
    expect(published.status).toBe("published");

    const snapshot = buildDashboardSnapshot({
      period: published,
      datasets: draftDetails!.datasets,
      thresholds: structuredClone(DEFAULT_THRESHOLDS)
    });

    expect(snapshot.summary.auditAverage).toBe(91);
    expect(snapshot.summary.totalConversationCount).toBe(143);
    expect(snapshot.highlights.bestCsat?.label).toBe("Ali Veli");
  });

  it("stores and reads qt manual entries by user and period", async () => {
    const repository = await getRepository();
    const period = await repository.createReportPeriod({
      month: "2026-02",
      title: "CS Şubat 2026"
    });

    await repository.upsertQtManualEntry({
      ...qtManualEntry,
      periodId: period.id
    });

    const entry = await repository.getQtManualEntry(period.id, "dev-team");

    expect(entry?.feedbackCount).toBe(57);
    expect(entry?.totalEvaluatedChatMailCount).toBe(248);
    expect(entry?.totalListeningHours).toBe(18.5);
  });

  it("allows anonymous users to list periods and read period details", async () => {
    const repository = await getRepository();
    const period = await repository.createReportPeriod({
      month: "2026-02",
      title: "CS Şubat 2026"
    });

    await repository.replaceDataset(period.id, "audit-metrics", [auditMetric]);

    const periodsResponse = await PERIODS_GET(new Request("http://localhost/api/report-periods"));
    expect(periodsResponse.status).toBe(200);
    await expect(periodsResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: period.id,
          title: "CS Şubat 2026"
        })
      ])
    });

    const detailResponse = await PERIOD_DETAILS_GET(
      new Request(`http://localhost/api/report-periods/${period.id}?datasets=audit-metrics&includeImportJobs=false`),
      {
        params: Promise.resolve({ periodId: period.id })
      }
    );
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      data: {
        period: {
          id: period.id
        },
        datasets: {
          auditMetrics: [expect.objectContaining({ id: auditMetric.id })]
        }
      }
    });
  });

  it("allows anonymous users to load dashboard data for a draft period", async () => {
    const repository = await getRepository();
    const period = await repository.createReportPeriod({
      month: "2026-02",
      title: "CS Şubat 2026"
    });

    await repository.replaceDataset(period.id, "agent-metrics", [agentMetric]);
    await repository.replaceDataset(period.id, "audit-metrics", [auditMetric]);

    const response = await DASHBOARD_GET(
      new Request(`http://localhost/api/dashboard?periodId=${period.id}`)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        period: {
          id: period.id
        },
        summary: {
          auditAverage: 91,
          previousAuditAccuracyAverage: 88
        }
      }
    });
  });

  it("resets a selected dataset for the period without affecting other datasets", async () => {
    const repository = await getRepository();
    const period = await repository.createReportPeriod({
      month: "2026-02",
      title: "CS Şubat 2026"
    });

    await repository.replaceDataset(period.id, "agent-metrics", [agentMetric]);
    await repository.replaceDataset(period.id, "audit-metrics", [auditMetric]);

    const response = await PATCH(
      new Request(`http://localhost/api/report-periods/${period.id}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer dev-admin",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "reset-dataset",
          datasetType: "audit-metrics"
        })
      }),
      {
        params: Promise.resolve({ periodId: period.id })
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        periodId: period.id,
        datasetType: "audit-metrics",
        reset: true
      }
    });

    const details = await repository.getPeriodDetails(period.id);

    expect(details?.datasets.auditMetrics).toHaveLength(0);
    expect(details?.datasets.agentMetrics).toHaveLength(1);
  });

  it("stores manual csat summary totals on the selected period", async () => {
    const repository = await getRepository();
    const period = await repository.createReportPeriod({
      month: "2026-02",
      title: "CS Şubat 2026"
    });

    const response = await PATCH(
      new Request(`http://localhost/api/report-periods/${period.id}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer dev-admin",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          manualTotalCallCount: 3200,
          manualTotalChatMailCount: 870,
          manualTotalTicketClosedCount: 145
        })
      }),
      {
        params: Promise.resolve({ periodId: period.id })
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: period.id,
        manualTotalCallCount: 3200,
        manualTotalChatMailCount: 870,
        manualTotalTicketClosedCount: 145
      }
    });

    const details = await repository.getPeriodDetails(period.id);

    expect(details?.period.manualTotalCallCount).toBe(3200);
    expect(details?.period.manualTotalChatMailCount).toBe(870);
    expect(details?.period.manualTotalTicketClosedCount).toBe(145);
  });

  it("accepts localized manual csat totals with thousand separators", async () => {
    const repository = await getRepository();
    const period = await repository.createReportPeriod({
      month: "2026-02",
      title: "CS Şubat 2026"
    });

    const response = await PATCH(
      new Request(`http://localhost/api/report-periods/${period.id}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer dev-admin",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          manualTotalCallCount: "8.949",
          manualTotalChatMailCount: "14.731",
          manualTotalTicketClosedCount: "102"
        })
      }),
      {
        params: Promise.resolve({ periodId: period.id })
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: period.id,
        manualTotalCallCount: 8949,
        manualTotalChatMailCount: 14731,
        manualTotalTicketClosedCount: 102
      }
    });
  });

  it("returns null for previous audit accuracy when the selected period does not include that field", async () => {
    const repository = await getRepository();
    const january = await repository.createReportPeriod({
      month: "2026-01",
      title: "CS Ocak 2026"
    });

    await repository.replaceDataset(january.id, "audit-metrics", [
      {
        ...auditMetric,
        id: "audit-january-1",
        period: "2026-01",
        auditScore: 91,
        previousAuditAccuracy: null
      }
    ]);

    const response = await DASHBOARD_GET(
      new Request(`http://localhost/api/dashboard?periodId=${january.id}`, {
        headers: {
          Authorization: "Bearer dev-admin"
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        summary: {
          previousAuditAccuracyAverage: null
        }
      }
    });
  });

  it("uses the selected period's previous audit accuracy column average", async () => {
    const repository = await getRepository();
    const february = await repository.createReportPeriod({
      month: "2026-02",
      title: "CS Şubat 2026"
    });

    await repository.replaceDataset(february.id, "audit-metrics", [
      {
        ...auditMetric,
        id: "audit-february-1",
        period: "2026-02",
        auditScore: 91,
        previousAuditAccuracy: 82.4
      },
      {
        ...auditMetric,
        id: "audit-february-2",
        period: "2026-02",
        agentKey: "ayse-test",
        agentName: "Ayşe Test",
        auditScore: 87,
        previousAuditAccuracy: 77.6
      }
    ]);

    const response = await DASHBOARD_GET(
      new Request(`http://localhost/api/dashboard?periodId=${february.id}`, {
        headers: {
          Authorization: "Bearer dev-admin"
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        summary: {
          previousAuditAccuracyAverage: 80
        }
      }
    });
  });

  it("does not replace previous audit accuracy with the previous month's audit average", async () => {
    const repository = await getRepository();
    const january = await repository.createReportPeriod({
      month: "2026-01",
      title: "CS Ocak 2026"
    });
    const february = await repository.createReportPeriod({
      month: "2026-02",
      title: "CS Şubat 2026"
    });

    await repository.replaceDataset(january.id, "audit-metrics", [
      {
        ...auditMetric,
        id: "audit-january-1",
        period: "2026-01",
        auditScore: 99,
        previousAuditAccuracy: null
      }
    ]);
    await repository.replaceDataset(february.id, "audit-metrics", [
      {
        ...auditMetric,
        id: "audit-february-1",
        period: "2026-02",
        auditScore: 91,
        previousAuditAccuracy: 82.4
      }
    ]);

    const response = await DASHBOARD_GET(
      new Request(`http://localhost/api/dashboard?periodId=${february.id}`, {
        headers: {
          Authorization: "Bearer dev-admin"
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        summary: {
          previousAuditAccuracyAverage: 82.4
        }
      }
    });
  });
});
