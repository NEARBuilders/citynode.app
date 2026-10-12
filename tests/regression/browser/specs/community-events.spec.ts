import { expect, test } from "@playwright/test";
import { seedNode, seedTenant } from "../../lib/seed-tenant.mjs";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectAdminCookies, injectCookies } from "../helpers/seeded";

test.use({ trace: "on" });

async function seedCommunity(label: string) {
  const unique = `${label}-${process.pid}-${Date.now().toString(36)}`;
  const tenant = await seedTenant({
    subdomain: unique,
    name: `Events ${unique}`,
    accountId: `${unique}.near`,
  });
  return seedNode({ tenantId: tenant.id, slug: unique, name: `Events City ${unique}` });
}

test.describe("community events", () => {
  let pageErrors: string[];

  test.beforeEach(({ page }) => {
    pageErrors = collectErrors(page);
  });

  test("a signed-in user without access sees the locked state, not a connection error", async ({
    page,
  }) => {
    const node = await seedCommunity("events-locked");
    await injectCookies(page);

    await page.goto(`/nodes/${node.id}/content`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await expect(page.getByTestId("community-cannot-edit")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("discovery-new-event")).toHaveCount(0);
    await expect(page.getByTestId("content-not-published")).toHaveCount(0);

    await page.getByTestId("community-cannot-edit-overview").click();
    await page.waitForURL(/\/dashboard\/node/, { waitUntil: "commit" });

    expectNoHydrationFailure(pageErrors);
  });

  test("a platform admin reaches a community's events from the admin page", async ({ page }) => {
    const node = await seedCommunity("events-admin");
    await injectAdminCookies(page);

    await page.goto(`/admin/nodes/${node.id}`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("admin-node.heading")).toBeVisible({ timeout: 15000 });

    await page.getByTestId("admin-node-events").click();
    await page.waitForURL(new RegExp(`/nodes/${node.id}/content`), { waitUntil: "commit" });

    await expect(page.getByTestId("content.heading")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("content-not-published")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("discovery-new-event")).toBeVisible({ timeout: 15000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("the hidden notice is shown with the events list, not after it", async ({ page }) => {
    const node = await seedCommunity("events-notice");
    await injectAdminCookies(page);
    await page.route("**/*getDiscoveryProfile*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.goto(`/nodes/${node.id}/content`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await expect(page.getByTestId("discovery-new-event")).toBeVisible({ timeout: 15000 });
    expect(await page.getByTestId("content-not-published").isVisible()).toBe(true);

    expectNoHydrationFailure(pageErrors);
  });
});
