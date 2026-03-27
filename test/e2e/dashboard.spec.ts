import { expect, test, type Page } from "@playwright/test";

async function mockCommonRoutes(page: Page, role: "admin" | "team" | "ceo") {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      json: {
        data: {
          uid: `dev-${role}`,
          email: `${role}@local.dev`,
          displayName: role === "ceo" ? "Dev CEO" : role === "team" ? "Dev Team" : "Dev Admin",
          role
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
            previousAuditAccuracyAverage: 88,
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
            auditMetrics: [],
            questionPerformance: [],
            qtMetrics: []
          },
          thresholds: {}
        }
      }
    });
  });
}

test("dashboard renders the new hero with mocked api data", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("kalitedb.devToken", "dev-admin");
  });

  await mockCommonRoutes(page, "admin");

  await page.goto("/");
  await expect(page.getByText("Audit ortalaması").first()).toBeVisible();
  await expect(page.getByText("Ocak 2026 audit doğruluk oranı").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Yönetim" })).toBeVisible();
});

test("guest users can browse dashboard data without logging in", async ({ page }) => {
  await mockCommonRoutes(page, "admin");

  await page.goto("/");
  await expect(page.getByText("Audit ortalaması").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Audit" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Giriş" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ay filtresi" })).toBeVisible();
});

test("non-admin users are redirected away from admin and do not see the admin nav", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("kalitedb.devToken", "dev-ceo");
  });

  await mockCommonRoutes(page, "ceo");

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Yönetim" })).toHaveCount(0);
  await expect(page.getByText("Audit ortalaması").first()).toBeVisible();
});
