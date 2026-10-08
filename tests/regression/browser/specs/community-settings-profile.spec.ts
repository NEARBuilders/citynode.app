import { expect, test } from "@playwright/test";
import { seedNode, seedTenant } from "../../lib/seed-tenant.mjs";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectCookies, loadSeedData } from "../helpers/seeded";

test.use({ trace: "on" });

test.describe("community settings profile", () => {
  test("an owner edits each community's own profile in a multi-community tenant", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    const unique = `profiles-${process.pid}-${Date.now().toString(36)}`;
    const tenant = await seedTenant({
      subdomain: unique,
      name: `Profiles ${unique}`,
      accountId: `${unique}.near`,
      orgId: loadSeedData().orgAID,
    });
    const first = await seedNode({
      tenantId: tenant.id,
      slug: `${unique}-first`,
      name: `First ${unique}`,
    });
    const second = await seedNode({
      tenantId: tenant.id,
      slug: `${unique}-second`,
      name: `Second ${unique}`,
    });
    await injectCookies(page);

    await page.goto(`/nodes/${second.id}/content`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await page.getByTestId("content-open-profile").click();
    await page.waitForURL(
      (url) =>
        url.pathname === `/tenant/${tenant.id}` && url.searchParams.get("nodeId") === second.id,
      { waitUntil: "commit" },
    );

    await expect(page.getByTestId("tenant.heading")).toContainText(second.name, {
      timeout: 15000,
    });
    await page.getByTestId("discovery-profile-summary").fill("Second community summary");
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("saveDiscoveryProfile") && response.request().method() === "POST",
    );
    await page.getByTestId("discovery-profile-save").click();
    expect((await saved).ok()).toBe(true);

    await page.getByTestId("community-switcher").click();
    await page.getByRole("option", { name: first.name, exact: true }).click();
    await page.waitForURL(
      (url) =>
        url.pathname === `/tenant/${tenant.id}` && url.searchParams.get("nodeId") === first.id,
      { waitUntil: "commit" },
    );
    await expect(page.getByTestId("tenant.heading")).toContainText(first.name, { timeout: 15000 });
    await expect(page.getByTestId("discovery-profile-summary")).toHaveValue("");

    await page.goto(`/tenant/${tenant.id}?nodeId=${second.id}`, {
      waitUntil: "domcontentloaded",
    });
    await waitForApp(page);
    await expect(page.getByTestId("discovery-profile-summary")).toHaveValue(
      "Second community summary",
      { timeout: 15000 },
    );

    await page.goto(`/tenant/${tenant.id}?nodeId=00000000-0000-4000-8000-000000000000`, {
      waitUntil: "domcontentloaded",
    });
    await waitForApp(page);
    await expect(page).toHaveURL(new RegExp(`nodeId=${first.id}`), { timeout: 15000 });
    await expect(page.getByTestId("tenant.heading")).toContainText(first.name);

    expectNoHydrationFailure(pageErrors);
  });
});
