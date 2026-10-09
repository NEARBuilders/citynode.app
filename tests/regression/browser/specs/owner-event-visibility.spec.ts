import { expect, type Page, test } from "@playwright/test";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import {
  seedDiscoveryActivity,
  seedDiscoveryProfile,
  seedNode,
  seedTenant,
} from "../../lib/seed-tenant.mjs";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectCookies, loadSeedData, seedDiscoveryNode } from "../helpers/seeded";

test.use({ trace: "on" });

const { baseUrl } = computeRegressionEnv();
const day = 86_400_000;

function eventWindow(offsetDays: number) {
  const start = Date.now() + offsetDays * day;
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 2 * 3_600_000).toISOString(),
  };
}

async function seedEventStates(nodeId: string) {
  return {
    live: await seedDiscoveryActivity({
      nodeId,
      title: "Published meetup",
      status: "published",
      ...eventWindow(3),
    }),
    draft: await seedDiscoveryActivity({
      nodeId,
      title: "Draft meetup",
      status: "draft",
      ...eventWindow(4),
    }),
    hiddenImport: await seedDiscoveryActivity({
      nodeId,
      title: "Imported meetup",
      status: "draft",
      luma: { available: true, hidden: true },
      ...eventWindow(5),
    }),
    removed: await seedDiscoveryActivity({
      nodeId,
      title: "Withdrawn meetup",
      status: "draft",
      luma: { available: false, hidden: false },
      ...eventWindow(6),
    }),
    scheduled: await seedDiscoveryActivity({
      nodeId,
      title: "Scheduled meetup",
      status: "published",
      publishedAt: new Date(Date.now() + day).toISOString(),
      ...eventWindow(7),
    }),
    cancelled: await seedDiscoveryActivity({
      nodeId,
      title: "Cancelled meetup",
      status: "cancelled",
      ...eventWindow(8),
    }),
    ended: await seedDiscoveryActivity({
      nodeId,
      title: "Ended meetup",
      status: "published",
      ...eventWindow(-3),
    }),
  };
}

async function openEvents(page: Page, nodeId: string, search = "") {
  await page.goto(`/nodes/${nodeId}/content${search}`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await expect(page.getByTestId("content.heading")).toBeVisible({ timeout: 15000 });
}

test.describe("owner event visibility", () => {
  test("an owner sees whether visitors can see each event and fixes it", async ({
    page,
    browser,
  }) => {
    const pageErrors = collectErrors(page);
    const unique = `${process.pid}-${Date.now().toString(36)}`;
    const tenant = await seedTenant({
      subdomain: `visibility-${unique}`,
      name: `Visibility ${unique}`,
      accountId: `visibility-${unique}.near`,
      orgId: loadSeedData().orgAID,
    });
    const node = await seedNode({
      tenantId: tenant.id,
      slug: `visibility-${unique}`,
      name: `Visibility City ${unique}`,
    });
    await seedDiscoveryProfile({ nodeId: node.id, published: false });
    const events = await seedEventStates(node.id);
    await injectCookies(page);

    await page.goto(`/nodes/${node.id}/events/new`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("activity-form.heading")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#activity-status")).toContainText("Published on Explore");
    await page.locator("#activity-title").fill("Form meetup");
    await page.locator("#activity-url").fill(`https://example.com/form-${unique}`);
    await page.locator("#activity-source").fill("Regression");
    await page.locator("#activity-startsAt").fill("2030-01-01T18:00");
    await page.locator("#activity-endsAt").fill("2030-01-01T20:00");
    await page.locator("#activity-venue").fill("Online");
    await page.getByTestId("discovery-activity-save").click();
    await expect(
      page.getByText("Saved. Visitors will see it once your community is on Explore."),
    ).toBeVisible({ timeout: 15000 });
    await page.waitForURL(new RegExp(`/nodes/${node.id}/content`), { waitUntil: "commit" });

    await expect(page.getByTestId("content-not-published")).toBeVisible({ timeout: 15000 });
    const badge = (id: string) => page.getByTestId(`event-visibility-${id}`);
    await expect(badge(events.live.id)).toHaveAttribute("data-state", "published");
    await expect(badge(events.draft.id)).toHaveAttribute("data-state", "draft");
    await expect(badge(events.hiddenImport.id)).toHaveAttribute("data-state", "hiddenImport");
    await expect(badge(events.removed.id)).toHaveAttribute("data-state", "removed");
    await expect(badge(events.removed.id)).toHaveText("Removed from Luma");
    await expect(badge(events.scheduled.id)).toHaveAttribute("data-state", "published");
    await expect(badge(events.cancelled.id)).toHaveAttribute("data-state", "cancelled");

    const waiting = page.getByTestId("activity-editor.imports-waiting");
    await expect(waiting).toContainText("1 imported event waiting");
    await page.getByTestId("activity-editor.imports-waiting-review").click();
    await page.waitForURL(/review=imports/, { waitUntil: "commit" });
    await expect(page.getByTestId("activity-editor.reviewing-imports")).toBeVisible();
    await expect(badge(events.hiddenImport.id)).toBeVisible();
    await expect(badge(events.draft.id)).toHaveCount(0);
    await page.getByTestId(`activity-editor.luma-visibility-${events.hiddenImport.id}`).click();
    await expect(page.getByText("Shown on the calendar")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("activity-editor.show-all").click();
    await expect(badge(events.draft.id)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("activity-editor.imports-waiting")).toHaveCount(0);

    await seedDiscoveryProfile({ nodeId: node.id, published: true });
    await openEvents(page, node.id);
    await expect(page.getByTestId("content-not-published")).toHaveCount(0);
    await expect(badge(events.live.id)).toHaveAttribute("data-state", "live", { timeout: 15000 });
    await expect(badge(events.hiddenImport.id)).toHaveAttribute("data-state", "live");
    await expect(badge(events.draft.id)).toHaveAttribute("data-state", "draft");
    await expect(badge(events.scheduled.id)).toHaveAttribute("data-state", "scheduled");
    await expect(badge(events.cancelled.id)).toHaveAttribute("data-state", "cancelled");
    await expect(badge(events.removed.id)).toHaveAttribute("data-state", "removed");

    await page.getByTestId("activity-editor.tab-past").click();
    await expect(badge(events.ended.id)).toHaveAttribute("data-state", "ended", {
      timeout: 15000,
    });
    await page.getByTestId("activity-editor.tab-upcoming").click();

    await badge(events.live.id).click();
    await page.waitForURL(new RegExp(`/activity/${events.live.id}`), { waitUntil: "commit" });
    await expect(page.getByText("Published meetup").first()).toBeVisible({ timeout: 15000 });

    const visitor = await browser.newContext({ baseURL: baseUrl });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/activity/${events.live.id}`, { waitUntil: "domcontentloaded" });
    await waitForApp(visitorPage);
    await expect(visitorPage.getByText("Published meetup").first()).toBeVisible({
      timeout: 15000,
    });
    await visitor.close();

    expectNoHydrationFailure(pageErrors);
  });

  test("Overview counts only live events and opens the new-event form", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const node = await seedDiscoveryNode();
    await seedDiscoveryProfile({ nodeId: node.id, published: true });
    const events = await seedEventStates(node.id);
    await injectCookies(page);
    const activated = await page.request.post("/api/auth/organization/set-active", {
      data: { organizationId: loadSeedData().orgAID },
      headers: { origin: baseUrl },
    });
    expect(activated.ok(), await activated.text()).toBe(true);

    await page.goto(`/dashboard/node?nodeId=${node.id}`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("dashboard-node.stat-events").locator("dd")).toHaveText("1", {
      timeout: 15000,
    });
    const badge = (id: string) => page.getByTestId(`event-visibility-${id}`);
    await expect(badge(events.live.id)).toHaveAttribute("data-state", "live");
    await expect(badge(events.draft.id)).toHaveAttribute("data-state", "draft");
    await expect(badge(events.hiddenImport.id)).toHaveAttribute("data-state", "hiddenImport");
    await expect(page.getByTestId("dashboard-node.imports-waiting")).toContainText(
      "1 imported event waiting",
    );

    await page.getByTestId("dashboard-node.add-event").click();
    await page.waitForURL(new RegExp(`/nodes/${node.id}/events/new`), { waitUntil: "commit" });
    await expect(page.getByTestId("activity-form.heading")).toBeVisible({ timeout: 15000 });

    expectNoHydrationFailure(pageErrors);
  });
});
