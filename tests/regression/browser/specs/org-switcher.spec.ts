import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHydrationFailure } from "../helpers/page-ready";
import { injectAdminCookies, loadAdminSeedData, verifyAuthenticated } from "../helpers/seeded";

test.use({ trace: "on" });

test.describe("orgSwitcher", () => {
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = collectErrors(page);
    await injectAdminCookies(page);
  });

  test("renders seeded organizations in the switcher", async ({ page }) => {
    const { orgAName, orgBName } = loadAdminSeedData();

    await verifyAuthenticated(page);

    const orgSwitcher = page.getByTestId("org-switcher");
    await expect(orgSwitcher).toBeVisible({ timeout: 10000 });

    await orgSwitcher.click();

    await expect(page.getByRole("menuitem").filter({ hasText: orgAName })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("menuitem").filter({ hasText: orgBName })).toBeVisible({
      timeout: 5000,
    });

    expectNoHydrationFailure(pageErrors);
  });

  test("keeps the active organization and membership visible across repeated reloads", async ({
    page,
  }) => {
    const { orgAName, orgBName } = loadAdminSeedData();
    await verifyAuthenticated(page);
    await page.getByTestId("org-switcher").click();
    await page.getByRole("menuitem").filter({ hasText: orgAName }).click();
    await expect(page.getByTestId("org-switcher")).toContainText(orgAName);

    for (let reload = 0; reload < 3; reload++) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("org-switcher")).toContainText(orgAName, { timeout: 5000 });
      await page.getByTestId("org-switcher").click();
      await expect(page.getByRole("menuitem").filter({ hasText: orgAName })).toBeVisible();
      await expect(page.getByRole("menuitem").filter({ hasText: orgBName })).toBeVisible();
      await page.keyboard.press("Escape");
    }
    expectNoHydrationFailure(pageErrors);
  });

  test("shows a retryable failure instead of an empty organization list", async ({ page }) => {
    const { orgAName } = loadAdminSeedData();
    await page.route("**/api/rpc/auth/listOrganizations**", (route) => route.abort("failed"));
    await verifyAuthenticated(page);
    await page.getByTestId("org-switcher").click();
    await expect(page.getByTestId("org-switcher-retry")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("menuitem", { name: "No organizations yet" })).toHaveCount(0);
    await page.unroute("**/api/rpc/auth/listOrganizations**");
    await page.getByTestId("org-switcher-retry").click();
    await expect(page.getByTestId("org-switcher-retry")).toBeHidden();
    await page.getByTestId("org-switcher").click();
    await expect(page.getByRole("menuitem").filter({ hasText: orgAName })).toBeVisible();
    expectNoHydrationFailure(pageErrors);
  });
});
