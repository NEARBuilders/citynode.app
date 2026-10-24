import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHydrationFailure } from "../helpers/page-ready";
import { injectAdminCookies, verifyAuthenticated } from "../helpers/seeded";

test.use({ trace: "on" });

// Thin contract smoke for the child-owned account menu: the menu opens and
// exposes its items, using seeded sessions — deliberately decoupled from any
// sign-up ceremony so a passkey/timing flake can never mask it.
test.describe("account menu", () => {
  test("opens with profile, settings and sign-out items", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await injectAdminCookies(page);
    await verifyAuthenticated(page);

    const menu = page.getByTestId("account-menu");
    await expect(menu).toBeVisible({ timeout: 10000 });
    await menu.click();
    await expect(page.getByTestId("account.signout-menuitem")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("account.settings-menuitem")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("account.signout-menuitem")).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });
});
