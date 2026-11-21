import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { seedPlace } from "../../lib/seed-tenant.mjs";
import { FETCH_TIMEOUT_MS, signInAnonymously, useCookieHeader } from "../helpers/auth-session";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

const { baseUrl } = computeRegressionEnv();

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
}

test.describe("starting a community", () => {
  test("its owner reaches My community and /report", async ({ page }) => {
    test.setTimeout(120_000);
    const pageErrors = collectErrors(page);
    const unique = `start-${process.pid}-${Date.now().toString(36)}`;
    const name = `Start ${unique}`;
    await seedPlace({ slug: unique, name });
    await useCookieHeader(page.context(), await signInAnonymously());

    const started = await page.request.post("/api/places/activate", {
      data: { place: unique },
      headers: { origin: baseUrl },
    });
    expect(started.ok(), await started.text()).toBe(true);
    const { organizationId, nodeId } = (await started.json()) as {
      organizationId: string;
      nodeId: string;
    };
    execFileSync(
      "pnpm",
      ["exec", "tsx", "tests/regression/lib/approve-test-organizations.ts", organizationId],
      { timeout: FETCH_TIMEOUT_MS },
    );
    const activated = await page.request.post("/api/auth/organization/set-active", {
      data: { organizationId },
      headers: { origin: baseUrl },
    });
    expect(activated.ok(), await activated.text()).toBe(true);

    await open(page, `/dashboard/node?nodeId=${nodeId}`);
    await expect(page.getByTestId("dashboard-node.heading")).toBeVisible({ timeout: 15000 });

    await open(page, "/report");
    await expect(page.getByTestId("report.heading")).toContainText(name, { timeout: 15000 });
    await expect(page.getByTestId(`report.list-month-${currentMonth()}`)).toBeVisible();

    expectNoHydrationFailure(pageErrors);
  });
});
