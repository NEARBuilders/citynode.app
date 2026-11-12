import { expect, type Page, test } from "@playwright/test";
import {
  type DemoPersona,
  type DemoSeed,
  seedDemoCommunities,
  signInAsDemo,
} from "../helpers/demo";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

let seed: DemoSeed;

const EVERYONE = ["dashboard", "explore", "stake"];
const REMOVED = ["organization", "orgs", "workspace", "admin-overview", "admin-dashboard"];
const ADMIN_ITEMS = ["admin-nodes", "admin-events", "admin-reports", "admin-proposals", "discover"];
const PLATFORM_ITEMS = ["admin-stations", "admin-tenants", "admin-relayer", "admin-system"];

const nav = (page: Page, slug: string) => page.getByTestId(`sidebar-nav-${slug}`);

async function openSidebar(page: Page, mobile: boolean) {
  if (!mobile) return;
  await page.locator('[data-sidebar="trigger"]').first().click();
  await expect(page.locator('[data-mobile="true"]').first()).toBeVisible();
}

async function expectTopLevel(page: Page, shown: string[], hidden: string[]) {
  for (const slug of shown) await expect(nav(page, slug)).toBeVisible({ timeout: 15000 });
  for (const slug of [...hidden, ...REMOVED]) await expect(nav(page, slug)).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test.describe("each person sees the few places they use", () => {
  test.beforeAll(async () => {
    seed = await seedDemoCommunities();
  });

  for (const mobile of [false, true]) {
    const size = mobile ? "mobile" : "desktop";

    test.describe(size, () => {
      test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });

      test("signed out", async ({ page }) => {
        const pageErrors = collectErrors(page);
        await page.goto("/explore", { waitUntil: "domcontentloaded" });
        await waitForApp(page);
        await expect(page.getByText("Sign in", { exact: true }).first()).toBeVisible({
          timeout: 15000,
        });
        await expect(page.locator('[data-testid^="sidebar-nav-"]')).toHaveCount(0);
        expectNoHydrationFailure(pageErrors);
      });

      const people: Array<[DemoPersona, string[], string[]]> = [
        ["noCommunity", [...EVERYONE, "start-community"], ["my-node", "admin"]],
        ["member", [...EVERYONE, "my-node"], ["start-community", "admin"]],
        ["ownerMature", [...EVERYONE, "my-node"], ["start-community", "admin"]],
        ["organizer", [...EVERYONE, "my-node"], ["start-community", "admin"]],
      ];
      for (const [persona, shown, hidden] of people) {
        test(persona, async ({ page }) => {
          const pageErrors = collectErrors(page);
          await signInAsDemo(page, seed, persona);
          await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
          await waitForApp(page);
          await openSidebar(page, mobile);
          await expectTopLevel(page, shown, hidden);
          expectNoHydrationFailure(pageErrors);
        });
      }

      test("platform admin", async ({ page }) => {
        const pageErrors = collectErrors(page);
        await signInAsDemo(page, seed, "platformAdmin");
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
        await waitForApp(page);
        await openSidebar(page, mobile);
        await expectTopLevel(page, [...EVERYONE, "my-node", "admin"], ["start-community"]);

        const adminToggle = nav(page, "admin-toggle");
        if ((await adminToggle.getAttribute("aria-expanded")) !== "true") {
          await adminToggle.click();
        }
        for (const slug of ADMIN_ITEMS) await expect(nav(page, slug)).toBeVisible();
        for (const slug of PLATFORM_ITEMS) await expect(nav(page, slug)).toBeHidden();

        await nav(page, "admin-platform").click();
        for (const slug of PLATFORM_ITEMS) await expect(nav(page, slug)).toBeVisible();

        await nav(page, "admin-reports").click();
        await page.waitForURL(/\/admin\/reports/);
        await expect(page.getByTestId("admin-reports.heading")).toBeVisible({ timeout: 15000 });
        expectNoHydrationFailure(pageErrors);
      });
    });
  }

  test("an owner reaches Organization from My community, and old organization links still open", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    await signInAsDemo(page, seed, "ownerMature");
    await page.goto("/dashboard/node", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await page.getByTestId("community-header.organization").click();
    await page.waitForURL(/\/orgs\/lagos-demo/);
    await expect(page.getByTestId("orgs-tab-members")).toBeVisible({ timeout: 15000 });

    await page.goto("/orgs/lagos-demo", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("orgs-tab-members")).toBeVisible({ timeout: 15000 });
    await expect(nav(page, "my-node")).toBeVisible();
    expectNoHydrationFailure(pageErrors);
  });
});
