import { expect, type Page, test } from "@playwright/test";
import { seedNode } from "../../lib/seed-tenant.mjs";
import { type DemoSeed, seedDemoCommunities, signInAsDemo } from "../helpers/demo";
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

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
}

async function captureClipboard(page: Page) {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { __copied: copied });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copied.push(text);
        },
      },
    });
  });
  return () => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
}

test.describe.configure({ mode: "serial" });

test.describe("platform admins review reports from Home", () => {
  test.beforeAll(async () => {
    seed = await seedDemoCommunities();
  });

  test("Home is the overview: reports, needs action, events and onboarding", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const month = reportMonth();
    const { lagos, lisbon, manila } = seed.communities;
    const copied = await captureClipboard(page);
    await signInAsDemo(page, seed, "platformAdmin");

    await open(page, "/dashboard");
    await expect(page.getByTestId("home-admin-overview")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`home-admin.month-${month}`)).toBeVisible();
    await expect(page.getByTestId(`home-admin.missing-${month}`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("home-admin.to-review")).not.toContainText("—");
    const reviewList = page.getByTestId("home-admin.review-list");
    await expect(
      reviewList.getByTestId(`home-admin.review-monthly-${lisbon.nodeId}-${month}`),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      reviewList.getByTestId(`home-admin.review-event-${eventOf("lagos", "payments-hack").id}`),
    ).toBeVisible();
    await expect(
      reviewList.getByTestId(`home-admin.review-monthly-${lagos.nodeId}-${month}`),
    ).toHaveCount(0);

    for (const column of ["recent", "upcoming"]) {
      await expect(
        page
          .getByTestId(`home-admin.events-${column}`)
          .locator('[data-testid^="home-admin.event-"]'),
      ).not.toHaveCount(0);
    }
    await expect(page.getByTestId("admin.stat.redeemed")).toBeVisible();
    await expect(page.getByTestId("admin.stat.new-members")).toBeVisible();
    await expect(page.getByTestId("admin.stat.returning")).toBeVisible();
    await expect(page.getByTestId("admin-joins-chart")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("admin-progress")).toBeVisible();

    const chase = page.getByTestId(`admin-needs-action-reports-${manila.organizationId}`);
    await expect(chase).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`admin-needs-action-copy-${manila.organizationId}`).click();
    await expect.poll(copied).toEqual([expect.stringMatching(/\/report\?community=manila-demo$/)]);

    expectNoHydrationFailure(pageErrors);
  });

  test("an admin reads a monthly and an event report, marks them reviewed, and the owner sees it", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    const month = reportMonth();
    const { lagos, lisbon } = seed.communities;
    const event = eventOf("lagos", "payments-hack");
    await signInAsDemo(page, seed, "platformAdmin");

    await open(page, "/dashboard");
    await page
      .getByTestId(`home-admin.review-monthly-${lisbon.nodeId}-${month}`)
      .getByRole("link")
      .click();
    await page.waitForURL(new RegExp(`/nodes/${lisbon.nodeId}/reports/${month}$`));
    await expect(page.getByTestId("monthly-report.notes")).toContainText("Meetup #15", {
      timeout: 15000,
    });
    await expect(page.getByTestId("monthly-report.notes-input")).toHaveCount(0);
    await expect(page.getByTestId("monthly-report.stats")).toBeVisible();
    await page.getByTestId("monthly-report.review").click();
    await expect(page.getByTestId("monthly-report.reviewed-on")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("monthly-report.back").click();
    await page.waitForURL(/\/admin\/reports/);
    await expect(page.getByTestId(`admin-report-status-${lisbon.nodeId}`)).toHaveText("Reviewed", {
      timeout: 15000,
    });

    await open(page, `/nodes/${lagos.nodeId}/events/${event.id}/report`);
    await expect(page.getByTestId("report-answers")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("report-submit")).toHaveCount(0);
    await page.getByTestId("report.review").click();
    await expect(page.getByTestId("report.reviewed-on")).toBeVisible({ timeout: 15000 });

    await page.context().clearCookies();
    await signInAsDemo(page, seed, "ownerSecondMature");
    await open(page, "/report");
    await expect(page.getByTestId(`report.list-month-${month}-reviewed`)).toBeVisible({
      timeout: 15000,
    });

    await page.context().clearCookies();
    await signInAsDemo(page, seed, "organizer");
    await open(page, `/nodes/${lagos.nodeId}/events/${event.id}/report`);
    await expect(page.getByTestId("report.reviewed-on")).toBeVisible({ timeout: 15000 });

    await open(page, "/dashboard");
    await expect(
      page.getByTestId("home-owner.events-recent").getByTestId(`report-status-${event.id}`),
    ).toHaveText("Reviewed", { timeout: 15000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("Admin → Reports picks a month, filters and copies a community's link", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const month = reportMonth();
    const { lagos, manila } = seed.communities;
    const copied = await captureClipboard(page);
    await signInAsDemo(page, seed, "platformAdmin");

    await open(page, `/admin/reports?month=${month}`);
    await expect(page.getByTestId("admin-reports-summary")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("admin-reports-month")).toContainText(
      new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    );
    await expect(page.getByTestId(`admin-report-status-${lagos.nodeId}`)).toHaveText("Reviewed");
    await expect(page.getByTestId(`admin-report-read-${lagos.nodeId}`)).toHaveAttribute(
      "href",
      `/nodes/${lagos.nodeId}/reports/${month}`,
    );

    await page.getByTestId("admin-reports-filter-missing").click();
    await page.waitForURL(/show=missing/);
    await expect(page.getByTestId(`admin-report-${manila.nodeId}`)).toBeVisible();
    await expect(page.getByTestId(`admin-report-${lagos.nodeId}`)).toHaveCount(0);
    await page.getByTestId(`admin-report-copy-${manila.nodeId}`).click();
    await expect.poll(copied).toEqual([expect.stringMatching(/\/report\?community=manila-demo$/)]);

    await page.getByTestId("admin-reports-filter-review").click();
    await page.waitForURL(/show=review/);
    await expect(page.getByTestId(`admin-report-${manila.nodeId}`)).toHaveCount(0);
    await expect(page.getByTestId(`admin-report-${lagos.nodeId}`)).toHaveCount(0);

    await page.getByTestId("admin-reports-filter-all").click();
    await expect(page.getByTestId(`admin-report-${lagos.nodeId}`)).toBeVisible();

    await open(page, "/admin/events");
    await expect(page.getByTestId("admin-events-review")).toBeVisible({ timeout: 15000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("/admin goes to Home; /report is a platform admin's own community, or Admin → Reports", async ({
    page,
  }) => {
    await signInAsDemo(page, seed, "platformAdmin");

    await open(page, "/admin");
    await page.waitForURL(/\/dashboard$/);
    await expect(page.getByTestId("home-admin-overview")).toBeVisible({ timeout: 15000 });

    await open(page, "/report");
    await expect(page.getByTestId("report.heading")).toContainText(seed.communities.nairobi.name, {
      timeout: 15000,
    });
    await expect(page.getByTestId("report.desk")).toBeVisible();
    await page.getByTestId("report.admin-reports").click();
    await page.waitForURL(/\/admin\/reports/);

    await page.context().clearCookies();
    await signInAsDemo(page, seed, "platformAdminOnly");
    await open(page, "/report");
    await page.waitForURL(/\/admin\/reports/);
    await expect(page.getByTestId("admin-reports.heading")).toBeVisible({ timeout: 15000 });
  });

  test("a report stays with its community when a node that sorts first is added", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    const month = reportMonth();
    const { lagos } = seed.communities;
    const annex = await seedNode({
      tenantId: lagos.tenantId,
      slug: `aardvark-annex-${process.pid}`,
      name: "Aardvark Annex",
    });

    await signInAsDemo(page, seed, "ownerMature");
    await open(page, "/report");
    await expect(page.getByTestId(`report.list-month-${month}-reviewed`)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId(`report.list-month-${month}-open`)).toHaveAttribute(
      "href",
      `/nodes/${annex.id}/reports/${month}`,
    );

    await page.context().clearCookies();
    await signInAsDemo(page, seed, "platformAdmin");
    await open(page, `/admin/reports?month=${month}`);
    await expect(page.getByTestId(`admin-report-status-${annex.id}`)).toHaveText("Reviewed", {
      timeout: 15000,
    });
    await expect(page.getByTestId(`admin-report-${lagos.nodeId}`)).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });
});
