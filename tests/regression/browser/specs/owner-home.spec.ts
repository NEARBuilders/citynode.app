import { expect, type Page, test } from "@playwright/test";
import {
  type DemoPersona,
  type DemoSeed,
  seedDemoCommunities,
  signInAsDemo,
} from "../helpers/demo";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

let seed: DemoSeed;

function reportMonth() {
  if (!seed.reportMonth) throw new Error("the demo seed has no reportable month for today");
  return seed.reportMonth;
}

function eventOf(community: keyof DemoSeed["communities"], key: string) {
  const event = seed.communities[community].events.find((candidate) => candidate.key === key);
  if (!event) throw new Error(`demo ${community} has no event ${key}`);
  return event;
}

function thisMonth(community: keyof DemoSeed["communities"]) {
  const month = new Date().toISOString().slice(0, 7);
  const now = Date.now();
  return seed.communities[community].events.filter(
    (event) =>
      event.status !== "cancelled" &&
      event.startsAt.startsWith(month) &&
      Date.parse(event.endsAt) <= now,
  );
}

async function openHome(page: Page, persona: DemoPersona) {
  await signInAsDemo(page, seed, persona);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await waitForApp(page);
}

test.describe.configure({ mode: "serial" });

test.describe("an owner's Home is their community's overview", () => {
  test.beforeAll(async () => {
    seed = await seedDemoCommunities();
  });

  test("Lagos's owner sees reports, what's waiting, events and onboarding", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const month = reportMonth();
    const lagos = seed.communities.lagos;
    await openHome(page, "ownerMature");

    const overview = page.getByTestId("home-owner.overview");
    await expect(overview).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("home.heading")).toContainText(lagos.name);

    await expect(page.getByTestId(`home-owner.reports-list-month-${month}-reviewed`)).toBeVisible({
      timeout: 15000,
    });
    const owed = page.getByTestId(
      `home-owner.reports-list-event-${eventOf("lagos", "community-call").id}`,
    );
    await expect(owed).toBeVisible();
    await expect(owed).toHaveAttribute(
      "href",
      `/nodes/${lagos.nodeId}/events/${eventOf("lagos", "community-call").id}/report`,
    );
    await expect(page.getByTestId("home-owner.open-reports")).toHaveAttribute("href", "/report");

    await expect(page.getByTestId("home-owner.team-requests")).toContainText(
      "1 team request waiting",
    );

    const recent = page.getByTestId("home-owner.events-recent");
    const call = eventOf("lagos", "community-call");
    await expect(recent.getByTestId(`report-status-${call.id}`)).toHaveText("Report missing");
    await expect(recent.getByTestId(`home-owner.event-${call.id}-check-ins`)).toHaveText(
      `${call.checkIns} check-ins`,
      { timeout: 15000 },
    );
    await expect(
      recent.getByTestId(`report-status-${eventOf("lagos", "payments-hack").id}`),
    ).toHaveText("Report in");
    await expect(
      page
        .getByTestId("home-owner.events-upcoming")
        .getByTestId(`home-owner.event-${eventOf("lagos", "stablecoins").id}`),
    ).toBeVisible();

    const held = thisMonth("lagos");
    await expect(page.getByTestId("home-owner.stat-events-held")).toContainText(
      String(held.length),
      { timeout: 15000 },
    );
    await expect(page.getByTestId("home-owner.stat-joins")).toContainText(
      String(held.reduce((sum, event) => sum + event.checkIns, 0)),
    );
    await expect(page.getByTestId("home-owner.setup")).toHaveCount(0);
    await expect(page.getByTestId("home-node-setup")).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });

  test("a new community's owner gets one setup line that opens My community", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await openHome(page, "ownerNew");

    await expect(page.getByTestId("home-owner.overview")).toBeVisible({ timeout: 15000 });
    const setup = page.getByTestId("home-owner.setup");
    await expect(setup).toBeVisible({ timeout: 15000 });
    await expect(setup).toContainText(seed.communities.nairobi.name);
    await page.getByTestId("home-owner.setup-open").click();
    await page.waitForURL(/\/dashboard\/node$/);
    await expect(page.getByTestId("dashboard-node.setup")).toBeVisible({ timeout: 15000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("Manila's owner sees the month's report and every event still owed", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const month = reportMonth();
    await openHome(page, "ownerNoReports");

    await expect(page.getByTestId(`home-owner.reports-list-month-${month}-open`)).toBeVisible({
      timeout: 15000,
    });
    const owed = seed.communities.manila.events.filter(
      (event) => !event.reported && Date.parse(event.endsAt) <= Date.now(),
    );
    expect(owed.length).toBeGreaterThan(0);
    for (const event of owed) {
      await expect(page.getByTestId(`home-owner.reports-list-event-${event.id}`)).toBeVisible();
    }

    expectNoHydrationFailure(pageErrors);
  });

  test("an organizer on the events team gets the overview too", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await openHome(page, "organizer");
    await expect(page.getByTestId("home-owner.overview")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("home-owner.reports")).toBeVisible();
    expectNoHydrationFailure(pageErrors);
  });

  for (const persona of ["member", "finance", "noCommunity"] as const) {
    test(`${persona} keeps the Home they had`, async ({ page }) => {
      const pageErrors = collectErrors(page);
      await openHome(page, persona);
      await expect(page.getByTestId("home-next-steps")).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId("home-owner.overview")).toHaveCount(0);
      expectNoHydrationFailure(pageErrors);
    });
  }

  test("a platform admin gets the platform overview, not a community's", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await openHome(page, "platformAdmin");
    await expect(page.getByTestId("home-admin-overview")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("home-owner.overview")).toHaveCount(0);
    expectNoHydrationFailure(pageErrors);
  });

  test("switching community switches the overview", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await openHome(page, "twoCommunities");
    await expect(page.getByTestId("home.heading")).toContainText(seed.communities.lisbon.name, {
      timeout: 15000,
    });
    await expect(page.getByTestId("home-owner.overview")).toBeVisible();

    await page.getByTestId("org-switcher").click();
    await page.getByRole("menuitem").filter({ hasText: seed.communities.lagos.name }).click();
    await expect(page.getByTestId("home.heading")).toContainText(seed.communities.lagos.name, {
      timeout: 15000,
    });
    await expect(
      page.getByTestId(`home-owner.reports-list-event-${eventOf("lagos", "community-call").id}`),
    ).toBeVisible({ timeout: 15000 });

    expectNoHydrationFailure(pageErrors);
  });
});
