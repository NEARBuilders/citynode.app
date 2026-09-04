import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

test.describe("Auth redirect", () => {
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = collectErrors(page);
  });

  test("unauthenticated /settings redirects to /login with a redirect target", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await page.waitForURL(/\/login/, { timeout: 15000 });

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("redirect"), "redirect param should point at /settings").toContain(
      "/settings",
    );

    const signInHeading = page.getByRole("heading", { name: "Sign in" });
    await expect(signInHeading).toBeVisible({ timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await page.waitForURL(/\/login/, { timeout: 15000 });

    const signInHeading = page.getByRole("heading", { name: "Sign in" });
    await expect(signInHeading).toBeVisible({ timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });
});
