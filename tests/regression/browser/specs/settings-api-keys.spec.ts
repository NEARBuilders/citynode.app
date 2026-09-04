import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectCookies } from "../helpers/seeded";

test.describe("Settings → API Keys", () => {
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = collectErrors(page);
    await injectCookies(page);
  });

  test("api keys page loads for authenticated user", async ({ page }) => {
    await page.goto("/settings/api-keys", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await expect(page).toHaveURL(/\/settings\/api-keys/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "API Keys", exact: true })).toBeVisible({
      timeout: 10000,
    });

    expectNoHydrationFailure(pageErrors);
  });

  test("api keys tab visible in settings", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await page.waitForURL(/\/settings/, { timeout: 10000 });

    const apiKeysTab = page.getByText("API Keys", { exact: true });
    await expect(apiKeysTab).toBeVisible({ timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("can navigate to api keys from settings tab", async ({ page }) => {
    await page.goto("/settings/profile", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    const apiKeysTab = page.getByRole("tab", { name: "API Keys" });
    await expect(apiKeysTab).toBeVisible({ timeout: 10000 });
    await apiKeysTab.click();

    await page.waitForURL(/\/settings\/api-keys/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "API Keys", exact: true })).toBeVisible({
      timeout: 10000,
    });

    expectNoHydrationFailure(pageErrors);
  });
});
