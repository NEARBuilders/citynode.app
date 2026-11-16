import { expect, test } from "@playwright/test";
import { seedNode, seedPlace, seedTenant } from "../../lib/seed-tenant.mjs";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectCookies, loadSeedData } from "../helpers/seeded";

test.describe("discovery profile save → Explore", () => {
  test("saving with Show on Explore publishes the community to list and map", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const unique = `${process.pid}-${Date.now().toString(36)}`;
    const location = `karachi-${unique}`;
    await seedPlace({
      slug: location,
      name: "Karachi",
      label: "city",
      latitude: 24.8607,
      longitude: 67.0011,
    });
    const tenant = await seedTenant({
      subdomain: location,
      name: `Karachi ${unique}`,
      accountId: `${location}.near`,
      orgId: loadSeedData().orgAID,
    });
    const node = await seedNode({
      tenantId: tenant.id,
      slug: location,
      name: `Karachi Explore ${unique}`,
    });

    await injectCookies(page);
    await page.goto(`/tenant/${tenant.id}`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await expect(page.getByTestId("tenant.heading")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("discovery-profile-form")).toBeVisible({ timeout: 15000 });

    const published = page.getByTestId("discovery-profile-published");
    await published.click();
    await expect(published).toHaveAttribute("data-checked", "", { timeout: 5000 });

    await page
      .getByTestId("discovery-profile-summary")
      .fill("A community by the sea for builders.");
    await page.getByTestId("discovery-profile-location").fill(location);
    await page.getByTestId("discovery-profile-region").fill("Pakistan");

    await page.getByTestId("discovery-profile-add-channel").click();
    await page.getByTestId("discovery-profile-channel-label-0").fill("Community");
    await page.getByTestId("discovery-profile-channel-url-0").fill("https://example.com/community");

    await page.getByTestId("discovery-profile-save").click();
    await expect(page.getByText("Profile saved and live on Explore")).toBeVisible({
      timeout: 15000,
    });

    await page.goto("/explore?view=list", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("explore.heading")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`discovery-node-${node.id}`)).toBeVisible({ timeout: 15000 });

    await page.getByTestId("explore-view-map").click();
    await expect(page.getByTestId(`discovery-node-${node.id}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`discovery-map-marker-${node.id}`)).toBeVisible({
      timeout: 20000,
    });

    expectNoHydrationFailure(pageErrors);
  });
});
