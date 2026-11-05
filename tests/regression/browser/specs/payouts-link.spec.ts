import { expect, type Page, test } from "@playwright/test";
import { type OrganizerCommunity, seedOrganizerCommunity } from "../helpers/organizer-seed";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectSessionCookies } from "../helpers/seeded";

test.use({ viewport: { width: 1280, height: 600 } });

async function expectTeamStakeInView(page: Page) {
  await expect(page.getByTestId("dashboard-node.team-stake")).toBeInViewport({ timeout: 15000 });
}

async function expectNavigatedToPayouts(page: Page) {
  await page.waitForURL(/\/dashboard\/node.*#payouts$/, { timeout: 15000, waitUntil: "commit" });
  await expectTeamStakeInView(page);
}

test.describe("payouts link", () => {
  let community: OrganizerCommunity;
  let pageErrors: string[];

  test.beforeAll(async () => {
    community = await seedOrganizerCommunity();
  });

  test.beforeEach(({ page }) => {
    pageErrors = collectErrors(page);
  });

  for (const role of ["owner", "member"] as const) {
    test(`Home's payouts step puts the Team stake card in view for the ${role === "owner" ? "owner" : "Finance member"}`, async ({
      page,
    }) => {
      await injectSessionCookies(page, community.cookies[role]);
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await waitForApp(page);

      await page
        .getByTestId("home-step-payouts")
        .locator("xpath=descendant-or-self::a")
        .first()
        .click();
      await expectNavigatedToPayouts(page);
      expectNoHydrationFailure(pageErrors);
    });
  }

  test("Owner actions' payouts shortcut puts the Team stake card in view", async ({ page }) => {
    await injectSessionCookies(page, community.cookies.owner);
    await page.goto(`/dashboard/node?nodeId=${community.nodeId}`, {
      waitUntil: "domcontentloaded",
    });
    await waitForApp(page);

    await page.getByTestId("dashboard-node.action-payouts").click();
    await expectNavigatedToPayouts(page);
    expectNoHydrationFailure(pageErrors);
  });

  test("a direct load of #payouts puts the Team stake card in view", async ({ page }) => {
    await injectSessionCookies(page, community.cookies.member);
    await page.goto(`/dashboard/node?nodeId=${community.nodeId}#payouts`, {
      waitUntil: "domcontentloaded",
    });
    await waitForApp(page);

    await expectTeamStakeInView(page);
    expectNoHydrationFailure(pageErrors);
  });
});
