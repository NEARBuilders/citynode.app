import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectAdminCookies } from "../helpers/seeded";

test.describe("admin", () => {
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = collectErrors(page);
    await injectAdminCookies(page);
  });

  test("admin page is accessible without redirect", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Dashboard", { timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("admin dashboard loads with account stats", async ({ page }) => {
    await page.goto("/admin/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page.locator("h1")).toContainText("Dashboard", { timeout: 10000 });
    await expect(page.getByText("Signed in as", { exact: false })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Manage", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Organizations", { exact: true }).first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Settings", { exact: true }).first()).toBeVisible({
      timeout: 5000,
    });

    expectNoHydrationFailure(pageErrors);
  });

  test("admin system page renders runtime configuration", async ({ page }) => {
    await page.goto("/admin/system", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page.locator("h1")).toContainText("System", { timeout: 10000 });
    await expect(page.getByText("Runtime", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Deployment", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Endpoints", { exact: true })).toBeVisible({ timeout: 5000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("orgs page renders without email verification crash", async ({ page }) => {
    await page.goto("/orgs", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page.locator("h1")).toContainText("Organizations", { timeout: 10000 });
    await expect(page.getByText("Email verification required", { exact: false })).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });

  test("create organization as admin", async ({ page }) => {
    const name = `Admin Org ${Date.now()}`;
    const slug = `admin-org-${Date.now().toString().slice(-6)}`;

    await page.goto("/orgs/new", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await page.fill("#organization-name", name);
    await page.fill("#organization-slug", slug);
    await page.getByRole("button", { name: "create" }).click();

    await expect(page).toHaveURL(new RegExp(`/orgs/${slug}`), { timeout: 15000 });
    await expect(page.locator("h1")).toContainText(name, { timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });
});
