import { expect, type Page, test } from "@playwright/test";
import { type DemoSeed, seedDemoCommunities, signInAsDemo } from "../helpers/demo";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

let seed: DemoSeed;

function reportMonth() {
  if (!seed.reportMonth) throw new Error("the demo seed has no reportable month for today");
  return seed.reportMonth;
}

function lagosEvent(key: string) {
  const event = seed.communities.lagos.events.find((candidate) => candidate.key === key);
  if (!event) throw new Error(`demo Lagos has no event ${key}`);
  return event;
}

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
}

async function fillEventReport(page: Page) {
  await page.locator('label[for="report-format-irl"]').click();
  await page.getByTestId("report-socialLinks").fill("https://t.me/citynode_lagos_demo");
  await page.locator('label[for="report-focus-crypto"]').click();
  await page.locator('label[for="report-audience-general"]').click();
  await page.getByTestId("report-theme").fill("Planning Demo Day and the year-end social");
  await page.getByTestId("report-attendees").fill("21");
  await page.locator("#report-kpi-1").fill("21 people on the call");
  await page.locator("#report-kpi-2").fill("Demo Day schedule agreed");
  await page.getByTestId("report-wentWell").fill("People who never came in person joined.");
  await page.getByTestId("report-improvements").fill("Share the agenda a day earlier.");
  await page.getByTestId("report-talentAfter").fill("Two people offered to run check-in.");
  await page.getByTestId("report-talentDuring").fill("A member took notes for everyone.");
  await page.locator('label[for="report-partners-no"]').click();
  await page.getByTestId("report-nextActions").fill("Book the Yaba hub and confirm speakers.");
}

test.describe.configure({ mode: "serial" });

test.describe("owners and organizers report from one link", () => {
  test.beforeAll(async () => {
    seed = await seedDemoCommunities();
  });

  test("an owner opens /report signed out, signs in and lands on their reports", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    const month = reportMonth();

    await page.goto("/report", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login\?redirect=%2Freport$/);

    await signInAsDemo(page, seed, "ownerMature");
    await open(page, page.url());
    await page.waitForURL(/\/report$/);

    await expect(page.getByTestId("report.heading")).toContainText(seed.communities.lagos.name);
    const monthRow = page.getByTestId(`report.list-month-${month}`);
    await expect(monthRow).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`report.list-month-${month}-reviewed`)).toBeVisible();
    await expect(
      page.getByTestId(`report.list-event-${lagosEvent("community-call").id}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`report.list-event-${lagosEvent("payments-hack").id}`),
    ).toHaveCount(0);
    await expect(page.getByTestId("app-header-breadcrumb")).toHaveText("Reports");

    expectNoHydrationFailure(pageErrors);
  });

  test("an owner edits the reviewed monthly report and reports the last event", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    const month = reportMonth();
    const lagos = seed.communities.lagos;
    await signInAsDemo(page, seed, "ownerMature");

    await open(page, "/report");
    await page.getByTestId(`report.list-month-${month}-open`).click();
    await page.waitForURL(new RegExp(`/nodes/${lagos.nodeId}/reports/${month}$`));
    await expect(page.getByTestId("monthly-report.reviewed-on")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("monthly-report.stats")).toBeVisible();
    const notes = page.getByTestId("monthly-report.notes-input");
    await expect(notes).toHaveValue(/payments hack afternoon/);
    await notes.fill("Updated after the community call: Demo Day is confirmed for the 22nd.");
    await page.getByTestId("monthly-report.submit").click();

    await page.waitForURL(/\/report(\?community=lagos-demo)?$/);
    await expect(page.getByTestId(`report.list-month-${month}`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`report.list-month-${month}-reviewed`)).toHaveCount(0);
    await expect(page.getByTestId(`report.list-month-${month}`)).toContainText("Report in");

    const event = lagosEvent("community-call");
    await page.getByTestId(`report.list-event-${event.id}`).click();
    await page.waitForURL(new RegExp(`/nodes/${lagos.nodeId}/events/${event.id}/report$`));
    await expect(page.getByTestId("report-submit")).toBeVisible({ timeout: 15000 });
    await fillEventReport(page);
    await page.getByTestId("report-submit").click();

    await page.waitForURL(/\/report(\?community=lagos-demo)?$/);
    await expect(page.getByTestId(`report.list-month-${month}`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`report.list-event-${event.id}`)).toHaveCount(0);
    await expect(page.getByTestId("report.list-events-done")).toBeVisible();

    await open(page, "/dashboard/node");
    await expect(page.getByTestId(`dashboard-node.reports-list-month-${month}`)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId(`dashboard-node.reports-list-event-${event.id}`)).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });

  test("an owner without a report this month starts it from Home and submits it", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    const month = reportMonth();
    const manila = seed.communities.manila;
    await signInAsDemo(page, seed, "ownerNoReports");

    await open(page, "/dashboard");
    const monthRow = page.getByTestId(`home-owner.reports-list-month-${month}`);
    await expect(monthRow).toBeVisible({ timeout: 15000 });
    await expect(monthRow).not.toContainText("Report in");
    await page.getByTestId(`home-owner.reports-list-month-${month}-open`).click();
    await page.waitForURL(new RegExp(`/nodes/${manila.nodeId}/reports/${month}$`));
    await expect(page.getByTestId("monthly-report.stats")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("monthly-report.submit").click();
    await expect(page.getByText("Required", { exact: true })).toBeVisible();

    await page
      .getByTestId("monthly-report.notes-input")
      .fill("Short month: one caravan and the mixer. More in the next report.");
    await page.getByTestId("monthly-report.submit").click();
    await page.waitForURL(/\/report(\?community=manila-demo)?$/);
    await expect(page.getByTestId(`report.list-month-${month}`)).toContainText("Report in", {
      timeout: 15000,
    });

    await open(page, "/dashboard");
    await expect(page.getByTestId(`home-owner.reports-list-month-${month}`)).toContainText(
      "Report in",
      { timeout: 15000 },
    );

    expectNoHydrationFailure(pageErrors);
  });

  test("someone who reports for two communities picks one and the choice stays in the link", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    const month = reportMonth();
    await signInAsDemo(page, seed, "twoCommunities");

    await open(page, "/report");
    await expect(page.getByTestId("report.choose")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("report.community-lagos-demo")).toBeVisible();
    await page.getByTestId("report.community-lisbon-demo").click();
    await page.waitForURL(/\/report\?community=lisbon-demo$/);
    await expect(page.getByTestId("report.heading")).toContainText(seed.communities.lisbon.name, {
      timeout: 15000,
    });
    await expect(page.getByTestId(`report.list-month-${month}`)).toContainText("Report in");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("report.heading")).toContainText(seed.communities.lisbon.name, {
      timeout: 15000,
    });

    await page.getByTestId("report.switch").click();
    await page.waitForURL(/\/report$/);
    await expect(page.getByTestId("report.choose")).toBeVisible();

    expectNoHydrationFailure(pageErrors);
  });

  test("a new community is asked only for the months since it started", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const month = (offset: number) => {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
        .toISOString()
        .slice(0, 7);
    };
    const started = seed.communities.nairobi.activatedAt.slice(0, 7);
    const firstMonth = started > "2026-11" ? started : "2026-11";
    await signInAsDemo(page, seed, "ownerNew");

    await open(page, "/report");
    await expect(page.getByTestId(`report.list-month-${month(0)}`)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId(`report.list-month-${month(-1)}`)).toHaveCount(
      month(-1) >= firstMonth ? 1 : 0,
    );

    expectNoHydrationFailure(pageErrors);
  });

  test("an organizer reports for their community", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await signInAsDemo(page, seed, "organizer");

    await open(page, "/report");
    await expect(page.getByTestId("report.heading")).toContainText(seed.communities.lagos.name, {
      timeout: 15000,
    });
    await expect(page.getByTestId(`report.list-month-${reportMonth()}-open`)).toBeVisible();

    expectNoHydrationFailure(pageErrors);
  });

  test("people who don't report are told why instead of seeing an error", async ({ page }) => {
    const pageErrors = collectErrors(page);

    await signInAsDemo(page, seed, "member");
    await open(page, "/report");
    await expect(page.getByText("Reports come from owners and organizers")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("report.none-action")).toHaveAttribute("href", "/dashboard/node");

    await page.context().clearCookies();
    await signInAsDemo(page, seed, "noCommunity");
    await open(page, "/report");
    await expect(page.getByText("You're not in a community yet")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("report.none-action")).toHaveAttribute("href", "/explore");
    await expect(page.getByTestId("report.retry")).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });
});
