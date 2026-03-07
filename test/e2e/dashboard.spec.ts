import { expect, test } from "@playwright/test";

test("dashboard renders with mocked api data", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("kalitedb.devToken", "dev-admin");
  });

  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      json: {
        data: {
          uid: "dev-admin",
          email: "admin@local.dev",
          displayName: "Dev Admin",
          role: "admin"
        }
      }
    });
  });

  await page.route("**/api/report-periods", async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            id: "period-1",
            month: "2026-02",
            title: "CS Şubat 2026",
            status: "published",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      }
    });
  });

  await page.route("**/api/dashboard**", async (route) => {
    await route.fulfill({
      json: {
        data: {
          period: {
            id: "period-1",
            month: "2026-02",
            title: "CS Şubat 2026",
            status: "published",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          summary: {
            auditAverage: 91,
            missingQuestionsAverage: 88,
            csatAverage: 4.97,
            qtCoverageAverage: 1.1,
            totalConversationCount: 143,
            agentCount: 1,
            questionCount: 1,
            qtRepresentativeCount: 1
          },
          highlights: {
            bestAudit: { id: "agent-1", label: "Ali Veli", value: 91 },
            lowestAudit: { id: "agent-1", label: "Ali Veli", value: 91 },
            bestCsat: { id: "agent-1", label: "Ali Veli", value: 4.97 }
          },
          rankings: {
            auditTop: [{ id: "agent-1", label: "Ali Veli", value: 91 }],
            auditBottom: [{ id: "agent-1", label: "Ali Veli", value: 91 }],
            csatTop: [{ id: "agent-1", label: "Ali Veli", value: 4.97 }],
            csatBottom: [{ id: "agent-1", label: "Ali Veli", value: 4.97 }],
            risers: [],
            fallers: [],
            weakestQuestions: [],
            strongestQuestions: [],
            qtCoverage: []
          },
          datasets: {
            agentMetrics: [],
            questionPerformance: [],
            qtMetrics: []
          },
          thresholds: {}
        }
      }
    });
  });

  await page.goto("/");
  await expect(page.getByText("Audit ortalaması")).toBeVisible();
  await expect(page.getByText("91,00%")).toBeVisible();
});
