import path from "node:path";
import { rm } from "node:fs/promises";

import {
  buildDashboardSnapshot,
  DEFAULT_THRESHOLDS,
  type AgentMetric,
  type QtManualEntry,
  type QtMetric,
  type QuestionPerformance
} from "@kalitedb/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { getRepository } from "../../apps/api/src/lib/repository";

const dataFile = path.join(process.cwd(), ".data", "local-db.json");

const agentMetric: AgentMetric = {
  id: "agent-1",
  period: "2026-02",
  agentKey: "ali-veli",
  agentName: "Ali Veli",
  auditScore: 91,
  previousAuditAccuracy: 88,
  missingQuestionsAccuracy: 95,
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
  totalEvaluatedCallCount: 130,
  totalEvaluatedChatMailCount: 248,
  feedbackCount: 57,
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
    await repository.replaceDataset(period.id, "question-performance", [questionMetric]);
    await repository.replaceDataset(period.id, "qt-metrics", [qtMetric]);

    const draftDetails = await repository.getPeriodDetails(period.id);
    expect(draftDetails?.datasets.agentMetrics).toHaveLength(1);
    expect(draftDetails?.datasets.questionPerformance[0]?.accuracyRate).toBe(73.53);

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
  });
});
