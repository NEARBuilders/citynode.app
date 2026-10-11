import { expect, type Page, test } from "@playwright/test";
import { type OrganizerCommunity, seedOrganizerCommunity } from "../helpers/organizer-seed";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

test.use({ trace: "on" });

async function startFromOnboardTab(page: Page, community: OrganizerCommunity) {
  await page.goto(`/orgs/${community.organizationSlug}?tab=onboard`, {
    waitUntil: "domcontentloaded",
  });
  await waitForApp(page);
  await expect(page.getByTestId("onboard.event-picker")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("onboard.start-station")).toBeDisabled();

  await page.getByTestId("onboard.event-select").click();
  await page.getByTestId(`onboard.event-option-${community.eventId}`).click();
  await page.getByTestId("onboard.start-station").click();

  await page.waitForURL(/\/onboarding\/station\//, { timeout: 15000, waitUntil: "commit" });
  await expect(page.getByTestId("station.event-name")).toHaveText(community.eventTitle, {
    timeout: 15000,
  });
}

test.describe("organizer onboarding stations", () => {
  let community: OrganizerCommunity;
  let pageErrors: string[];

  test.beforeAll(async () => {
    community = await seedOrganizerCommunity();
  });

  test.beforeEach(({ page }) => {
    pageErrors = collectErrors(page);
  });

  test("an events-team member starts a station from Organization → Onboard", async ({ page }) => {
    await page.context().addCookies(community.cookies.organizer);

    await startFromOnboardTab(page, community);

    expectNoHydrationFailure(pageErrors);
  });

  test("an events-team member with the team active starts one from My community", async ({
    page,
  }) => {
    await page.context().addCookies(community.cookies.organizerWithTeamActive);

    await page.goto(`/dashboard/node?nodeId=${community.nodeId}`, {
      waitUntil: "domcontentloaded",
    });
    await waitForApp(page);
    await expect(page).not.toHaveURL(/restricted=/);
    await expect(page.getByTestId("dashboard-node.heading")).toBeVisible({ timeout: 15000 });

    await page.goto(`/nodes/${community.nodeId}/content`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("discovery-new-event")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("discovery-new-social")).toHaveCount(0);

    await page.getByTestId("content-tab-onboarding").click();
    await page.waitForURL(/tab=onboarding/, { waitUntil: "commit" });
    await page.getByTestId(`discovery-start-onboarding-${community.eventId}`).click();

    await page.waitForURL(/\/onboarding\/station\//, { timeout: 15000, waitUntil: "commit" });
    await expect(page.getByTestId("station.event-name")).toHaveText(community.eventTitle, {
      timeout: 15000,
    });
    expectNoHydrationFailure(pageErrors);
  });

  test("an owner starts a station from Organization → Onboard", async ({ page }) => {
    await page.context().addCookies(community.cookies.owner);

    await startFromOnboardTab(page, community);

    expectNoHydrationFailure(pageErrors);
  });

  test("a member without the events area can't manage events or start a station", async ({
    page,
  }) => {
    await page.context().addCookies(community.cookies.member);

    await page.goto(`/orgs/${community.organizationSlug}?tab=onboard`, {
      waitUntil: "domcontentloaded",
    });
    await waitForApp(page);
    await expect(page.getByTestId("orgs-tab-members")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("orgs-tab-onboard")).toHaveCount(0);
    await expect(page.getByTestId("onboard.event-picker")).toHaveCount(0);

    await page.goto(`/nodes/${community.nodeId}/content`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("community-cannot-edit")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("discovery-new-event")).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });
});
