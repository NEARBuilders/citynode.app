import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectCookies } from "../helpers/seeded";

test.describe("docs", () => {
  test("the overview is the docs home, with its tabs and paths", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/docs", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await expect(page.getByTestId("docs.heading")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("docs.nav-overview")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("docs.nav-group-guides")).toHaveCount(0);
    await expect(page.getByTestId("docs.guides")).toHaveCount(0);
    await expect(page.getByTestId("docs.nav-builders")).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("public-nav-docs")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("about.path-learn")).toBeVisible();
    await expect(page.getByTestId("about.path-build")).toBeVisible();
    await expect(page.getByTestId("about.path-grow")).toBeVisible();
    expectNoHydrationFailure(errors);
  });

  test("/about redirects to the docs overview", async ({ page }) => {
    await page.goto("/about", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByTestId("docs.heading")).toBeVisible({ timeout: 15000 });
  });

  test("the tabs move between Builders and the agent skill", async ({ page }) => {
    await page.goto("/docs", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await page.getByTestId("docs.nav-builders").click();
    await expect(page).toHaveURL(/\/docs\/build$/);
    await expect(page.getByTestId("docs.build-heading")).toBeVisible();
    await expect(page.getByTestId("docs.nav-builders")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("docs.nav-overview")).not.toHaveAttribute("aria-current", "page");

    await page.getByTestId("docs.nav-skill").click();
    await expect(page).toHaveURL(/\/skill$/);
    await expect(page.getByTestId("skill.heading")).toBeVisible();
    await expect(page.getByTestId("docs.nav-skill")).toHaveAttribute("aria-current", "page");
  });

  test("at 375px the tabs fit without page overflow and hide Guides when none exist", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/docs", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await expect(page.getByTestId("docs.heading")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("docs.tabs")).toBeVisible();
    await expect(page.getByTestId("docs.nav-skill")).toBeAttached();
    await expect(page.getByTestId("docs.nav-group-guides")).toHaveCount(0);
    await expect(page.getByTestId("docs.guides")).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("signed-in members reach the docs from the sidebar About item", async ({ page }) => {
    await injectCookies(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    const about = page.getByTestId("sidebar-nav-about");
    await expect(about).toBeVisible({ timeout: 15000 });
    await expect(about).toHaveAttribute("href", "/docs");
    await about.click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByTestId("docs.heading")).toBeVisible();
    await expect(page.getByTestId("sidebar-nav-about")).toHaveAttribute("data-active", "");
    await expect(page.getByTestId("docs.tabs")).toBeVisible();
    await expect(page.getByTestId("docs.nav-overview")).toHaveAttribute("aria-current", "page");
  });
});
