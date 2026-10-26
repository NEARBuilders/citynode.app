import { expect, test } from "@playwright/test";
import { seedNode, seedTenant } from "../../lib/seed-tenant.mjs";
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

    await expect(page).toHaveURL(/\/admin/, { timeout: 10000, waitUntil: "commit" });
    await expect(page.getByRole("button", { name: new RegExp(adminName) }).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("admin.section.manage")).toBeVisible({ timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("admin dashboard loads with account stats", async ({ page }) => {
    await page.goto("/admin/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page.getByTestId("admin.stat.pending-proposals")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("admin.stat.tenants")).toHaveCount(0);
    await expect(page.getByTestId("admin.section.needs-action")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("admin.section.progress")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("admin.section.manage")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("admin.section.manage")).toBeInViewport();

    const appInfo = page.getByTestId("app-info-trigger");
    await appInfo.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app-info-platform-account")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("app-info-version")).toBeVisible();
    await expect(page.getByTestId("admin.heading.nodes")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("admin.heading.tenants")).toBeVisible({ timeout: 5000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("admin system page renders runtime configuration", async ({ page }) => {
    await page.goto("/admin/system", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page.getByTestId("admin.heading.runtime")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("admin.heading.deployment")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("admin.heading.endpoints")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("citynode.app", { exact: false }).first()).toBeVisible({
      timeout: 5000,
    });

    expectNoHydrationFailure(pageErrors);
  });

  test("orgs page renders without crash", async ({ page }) => {
    await page.goto("/orgs", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page.getByTestId("orgs.heading")).toBeVisible({ timeout: 10000 });

    expectNoHydrationFailure(pageErrors);
  });

  test("create organization as admin", async ({ page }) => {
    const name = `Admin Org ${Date.now()}`;
    const slug = `admin-org-${Date.now().toString().slice(-6)}`;

    await page.goto("/orgs/new", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await page.getByTestId("orgs.new.heading").waitFor({ state: "visible", timeout: 10000 });
    await page.getByPlaceholder("My Team").fill(name);
    await page.getByPlaceholder("my-team").fill(slug);
    await page.getByTestId("orgs.new.submit").click();

    await expect(page).toHaveURL(new RegExp(`/orgs/${slug}`), {
      timeout: 15000,
      waitUntil: "commit",
    });
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("orgs-request-status")).toContainText("Pending approval");

    expectNoHydrationFailure(pageErrors);
  });

  test("relayer page asks for a wallet before funding", async ({ page }) => {
    await page.goto("/admin/relayer", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForApp(page);

    await expect(page.getByTestId("admin-relayer.heading")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("admin-relayer-status")).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId("admin-relayer-connect")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("admin-relayer-fund")).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });

  test.skip("fund button is disabled for an invalid amount once a wallet is connected", async ({
    page,
  }) => {
    await page.goto("/admin/relayer", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await page.getByTestId("admin-relayer-connect").click();

    await expect(page.getByTestId("admin-relayer-fund")).toBeVisible();
    await page.getByLabel("Amount").fill("bad");
    await expect(page.getByTestId("admin-relayer-fund")).toBeDisabled();
  });

  test("community page keeps old tab and edit links working", async ({ page }) => {
    const unique = `admin-node-${process.pid}-${Date.now().toString(36)}`;
    const tenant = await seedTenant({
      subdomain: unique,
      name: unique,
      accountId: `${unique}.near`,
    });
    const node = await seedNode({
      tenantId: tenant.id,
      slug: unique,
      name: `Admin City ${unique}`,
    });

    await page.goto(`/admin/nodes/${node.id}?tab=sequence`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("admin-node-tab-management")).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 15000 },
    );
    await expect(page.getByTestId("admin-node.stat-events")).toBeVisible();
    await expect(page.getByTestId("admin-node-profile")).toBeVisible();

    await page.goto(`/admin/nodes/${node.id}/edit`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("admin-node-editor")).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(new RegExp(`/admin/nodes/${node.id}\\?edit=true`));

    expectNoHydrationFailure(pageErrors);
  });
});
