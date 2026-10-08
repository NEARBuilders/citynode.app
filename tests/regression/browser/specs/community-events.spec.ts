import { expect, test } from "@playwright/test";
import { seedNode, seedTenant } from "../../lib/seed-tenant.mjs";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectAdminCookies } from "../helpers/seeded";

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
});
