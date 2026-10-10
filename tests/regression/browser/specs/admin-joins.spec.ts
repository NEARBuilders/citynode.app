import { expect, test } from "@playwright/test";
import { seedNode, seedTenant } from "../../lib/seed-tenant.mjs";
import { seedCommunityJoins } from "../helpers/onboarding-seed";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectAdminCookies } from "../helpers/seeded";

test.use({ trace: "on" });

test.describe("admin overview joins", () => {
  test("shows people who redeemed a code and new members per community", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const { organizationId } = await seedCommunityJoins();
    const unique = `joins-${process.pid}-${Date.now().toString(36)}`;
    const tenant = await seedTenant({
      subdomain: unique,
      name: `Joins ${unique}`,
      accountId: `${unique}.near`,
      orgId: organizationId,
    });
    await seedNode({ tenantId: tenant.id, slug: unique, name: `Joins City ${unique}` });
    await injectAdminCookies(page);

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("admin.section.joins")).toBeVisible({ timeout: 15000 });

    for (const [testId, atLeast] of [
      ["admin.stat.redeemed", 2],
      ["admin.stat.new-members", 1],
    ] as const) {
      const figure = page.getByTestId(testId);
      await expect(figure).toBeVisible();
      await expect
        .poll(async () => Number((await figure.innerText()).match(/\d+/)?.[0] ?? 0), {
          timeout: 15000,
        })
        .toBeGreaterThanOrEqual(atLeast);
    }

    await expect(page.getByTestId("admin-joins")).toBeVisible({ timeout: 15000 });
    const row = page.getByTestId(`admin-joins-row-${tenant.id}`);
    if (!(await row.isVisible())) await page.getByTestId("admin-joins-toggle").click();

    await expect(row.getByTestId("admin-joins-this-month")).toHaveText("2", { timeout: 15000 });
    await expect(row.getByTestId("admin-joins-new-this-month")).toHaveText("1");
    await expect(row.getByTestId("admin-joins-last-month")).toHaveText("1");
    await expect(row.getByTestId("admin-joins-new-last-month")).toHaveText("1");

    await row.getByTestId("admin-joins-link").click();
    await page.waitForURL(new RegExp(`/tenant/${tenant.id}`), { waitUntil: "commit" });

    expectNoHydrationFailure(pageErrors);
  });
});
