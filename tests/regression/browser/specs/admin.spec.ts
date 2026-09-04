import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectAdminCookies, loadAdminSeedData } from "../helpers/seeded";

test.describe("admin", () => {
  let pageErrors: string[];
  let adminName: string;

  test.beforeEach(async ({ page }) => {
    pageErrors = collectErrors(page);
    await injectAdminCookies(page);
    adminName = loadAdminSeedData().adminName;
  });

  test("admin page is accessible without redirect", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });
    await expect(page.getByRole("button", { name: new RegExp(adminName) }).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("heading", { name: "Manage" })).toBeVisible({ timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("admin dashboard loads with account stats", async ({ page }) => {
    await page.goto("/admin/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page.getByText("Role", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.locator("div").filter({ hasText: /^admin$/ })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Platform account", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("heading", { name: "Manage" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Nodes" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible({ timeout: 5000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("admin system page renders runtime configuration", async ({ page }) => {
    await page.goto("/admin/system", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page.getByRole("heading", { name: "Runtime" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Deployment" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("heading", { name: "Endpoints" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("citynode.app", { exact: false }).first()).toBeVisible({
      timeout: 5000,
    });

    expectNoHydrationFailure(pageErrors);
  });

  test("orgs page renders without email verification crash", async ({ page }) => {
    await page.goto("/orgs", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Email verification required", { exact: false })).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });

  test("create organization as admin", async ({ page }) => {
    const name = `Admin Org ${Date.now()}`;
    const slug = `admin-org-${Date.now().toString().slice(-6)}`;

    await page.goto("/orgs/new", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await page.getByPlaceholder("My Team").fill(name);
    await page.getByPlaceholder("my-team").fill(slug);
    await page.getByRole("button", { name: "create" }).click();

    await expect(page).toHaveURL(new RegExp(`/orgs/${slug}`), { timeout: 15000 });
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible({ timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });
});
