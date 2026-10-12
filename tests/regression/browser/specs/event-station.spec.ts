import { expect, type Page, test } from "@playwright/test";
import {
  type EventStationCommunity,
  seedEventStationCommunity,
} from "../helpers/event-station-seed";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

test.use({ trace: "on" });

const STATION_URL = /\/onboarding\/station\/([^/?#]+)/;

async function stationId(page: Page, community: EventStationCommunity) {
  await page.waitForURL(STATION_URL, { timeout: 15000, waitUntil: "commit" });
  await expect(page.getByTestId("station.event-name")).toHaveText(community.eventTitle, {
    timeout: 15000,
  });
  return STATION_URL.exec(page.url())?.[1];
}

async function openOverview(page: Page, community: EventStationCommunity) {
  await page.goto(`/dashboard/node?nodeId=${community.nodeId}`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await expect(page.getByTestId("dashboard-node.heading")).toBeVisible({ timeout: 15000 });
}

async function openContentTab(page: Page, community: EventStationCommunity, tab: string) {
  await page.goto(`/nodes/${community.nodeId}/content?tab=${tab}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForApp(page);
}

test.describe("an event's onboarding button opens its station", () => {
  let community: EventStationCommunity;
  let pageErrors: string[];

  test.beforeAll(async () => {
    community = await seedEventStationCommunity();
  });

  test.beforeEach(({ page }) => {
    pageErrors = collectErrors(page);
  });

  test("an owner reaches the same live station from Overview and the Events tab", async ({
    page,
  }) => {
    await page.context().addCookies(community.cookies.owner);
    const button = page.getByTestId(`dashboard-node.open-station-${community.eventId}`);

    await openOverview(page, community);
    await button.click();
    const first = await stationId(page, community);
    expect(first).toBeTruthy();

    await openOverview(page, community);
    await button.click();
    expect(await stationId(page, community)).toBe(first);

    await openContentTab(page, community, "events");
    await page.getByRole("button", { name: `More for ${community.eventTitle}` }).click();
    await page.getByTestId(`activity-editor.start-onboarding-${community.eventId}`).click();
    expect(await stationId(page, community)).toBe(first);

    await openContentTab(page, community, "onboarding");
    await page.getByTestId(`discovery-start-onboarding-${community.eventId}`).click();
    const another = await stationId(page, community);
    expect(another).toBeTruthy();
    expect(another).not.toBe(first);

    await openOverview(page, community);
    await button.click();
    expect(await stationId(page, community)).toBe(another);

    expectNoHydrationFailure(pageErrors);
  });

  test("a platform admin who isn't a member sees the event without its onboarding button", async ({
    page,
  }) => {
    await page.context().addCookies(community.cookies.platformAdmin);

    await openOverview(page, community);
    await expect(page.getByText(community.eventTitle)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`dashboard-node.open-station-${community.eventId}`)).toHaveCount(
      0,
    );

    await openContentTab(page, community, "events");
    await expect(page.getByTestId(`discovery-edit-activity-${community.eventId}`)).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByRole("button", { name: `More for ${community.eventTitle}` }),
    ).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });

  test("an organizer of another organization gets no Events-tab menu for this community", async ({
    page,
  }) => {
    await page.context().addCookies(community.cookies.otherOrganizer);

    await openContentTab(page, community, "events");
    await expect(page.getByTestId(`discovery-edit-activity-${community.eventId}`)).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByRole("button", { name: `More for ${community.eventTitle}` }),
    ).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });
});
