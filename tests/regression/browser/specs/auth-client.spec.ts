import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

test.describe("authClient", () => {
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = collectErrors(page);
  });

  test("login page renders with auth options", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "connect with NEAR" })).toBeVisible({
      timeout: 10000,
    });

    expectNoHydrationFailure(pageErrors);
  });

  test("anonymous sign in works from browser", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    const status = await page.evaluate(async () => {
      const response = await fetch("/api/auth/sign-in/anonymous", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      return response.status;
    });
    expect(status).toBe(200);

    const sessionStatus = await page.evaluate(async () => {
      const response = await fetch("/api/auth/get-session", { credentials: "include" });
      return response.status;
    });
    expect(sessionStatus).toBe(200);

    expectNoHydrationFailure(pageErrors);
  });
});
