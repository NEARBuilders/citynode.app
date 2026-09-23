import { expect, test } from "@playwright/test";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

const { baseUrl } = computeRegressionEnv();

// A wedged server endpoint must fail the test with a named error instead of
// hanging the suite for minutes — every regression fetch carries a deadline.
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Anonymous sign-in via the API produces a real session cookie pair (the
 * session token, plus the signed session_data cookie in production mode) that
 * can be injected into a browser context to emulate a signed-in visitor.
 */
async function signInAnonymouslyCookies(): Promise<Array<{ name: string; value: string }>> {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`anonymous sign-in failed: ${response.status}`);
  return response.headers.getSetCookie().map((cookie) => {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    return { name: pair.slice(0, index), value: pair.slice(index + 1) };
  });
}

test.describe("Auth redirect", () => {
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = collectErrors(page);
  });

  test("unauthenticated /settings redirects to /login with a redirect target", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await page.waitForURL(/\/login/, { timeout: 15000, waitUntil: "commit" });

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("redirect"), "redirect param should point at /settings").toContain(
      "/settings",
    );

    const signInHeading = page.getByTestId("login.heading");
    await expect(signInHeading).toBeVisible({ timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await page.waitForURL(/\/login/, { timeout: 15000, waitUntil: "commit" });

    const signInHeading = page.getByTestId("login.heading");
    await expect(signInHeading).toBeVisible({ timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });

  // Regression: the login route redirected authed visitors to the redirect
  // target while the authed guard, reading a stale (signed-out) session cache
  // via ensureQueryData, bounced them straight back — ping-ponging past the
  // router's redirect limit into "Too many redirects" on the root boundary.
  test("authenticated /login lands on the redirect target without a redirect loop", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const cookies = await signInAnonymouslyCookies();
    await page.context().addCookies(cookies.map((cookie) => ({ ...cookie, url: baseUrl })));

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/dashboard/, { timeout: 15000, waitUntil: "commit" });
    await waitForApp(page);

    await expect(page.getByText("Application error")).toHaveCount(0);
    await expect(
      page.getByText("Something went wrong before the app layout could render."),
    ).toHaveCount(0);
    expect(consoleErrors.join("\n")).not.toContain("Too many redirects");
    expect(consoleErrors.join("\n")).not.toContain("Error in route match");
    expectNoHydrationFailure(pageErrors);
  });
});
