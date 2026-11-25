import { expect, type Page, test } from "@playwright/test";
import { DEMO_COMMUNITIES } from "../../fixtures/demo/demo-data.ts";
import {
  type DemoPersona,
  type DemoSeed,
  seedDemoCommunities,
  signInAsDemo,
} from "../helpers/demo";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

let seed: DemoSeed;

const lagos = `/n/${DEMO_COMMUNITIES.lagos.slug}`;

async function openCommunity(page: Page, persona: DemoPersona | null) {
  if (persona) await signInAsDemo(page, seed, persona);
  await page.goto(lagos, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { name: DEMO_COMMUNITIES.lagos.nodeName, level: 1 }),
  ).toBeVisible({
    timeout: 15000,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("each role sees only its actions on the community page and Home", () => {
  test.beforeAll(async () => {
    seed = await seedDemoCommunities();
  });

  test("a signed-out visitor gets the join hint and no admin or setup actions", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    await openCommunity(page, null);
    await expect(page.getByTestId("node-page.join-at-event")).toBeVisible();
    await expect(page.getByTestId("node-page.open-community")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-events")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-setup")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-admin")).toHaveCount(0);
    await expect(page.getByTestId("node-page.propose-homepage")).toHaveCount(0);
    expectNoHydrationFailure(pageErrors);
  });

  test("a signed-in visitor who is not a member still only sees the join hint", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    await openCommunity(page, "noCommunity");
    await expect(page.getByTestId("node-page.join-at-event")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("node-page.open-admin")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-setup")).toHaveCount(0);
    expectNoHydrationFailure(pageErrors);
  });

  test("a member opens the community and does not see setup or admin rows", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await openCommunity(page, "member");
    await expect(page.getByTestId("node-page.open-community")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("node-page.join-at-event")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-events")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-setup")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-admin")).toHaveCount(0);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("home-next-steps")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("home-admin-overview")).toHaveCount(0);
    await expect(page.getByTestId("home-owner.overview")).toHaveCount(0);
    await expect(page.getByTestId("home-owner.setup")).toHaveCount(0);

    await page.goto("/dashboard/node", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("dashboard-node.heading")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("dashboard-node.setup")).toHaveCount(0);
    await expect(page.getByTestId("dashboard-node.owner-actions")).toHaveCount(0);
    expectNoHydrationFailure(pageErrors);
  });

  test("an organizer opens events and not setup", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await openCommunity(page, "organizer");
    await expect(page.getByTestId("node-page.open-events")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("node-page.open-setup")).toHaveCount(0);
    await expect(page.getByTestId("node-page.join-at-event")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-admin")).toHaveCount(0);
    await page.getByTestId("node-page.open-events").click();
    await expect(page).toHaveURL(/\/nodes\/[^/]+\/content\?tab=events/);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("home-admin-overview")).toHaveCount(0);
    expectNoHydrationFailure(pageErrors);
  });

  test("a leader opens setup and not the admin list", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await openCommunity(page, "ownerMature");
    await expect(page.getByTestId("node-page.open-setup")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("node-page.open-admin")).toHaveCount(0);
    await expect(page.getByTestId("node-page.join-at-event")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-events")).toHaveCount(0);
    await page.getByTestId("node-page.open-setup").click();
    await expect(page).toHaveURL(/\/dashboard\/node/);
    await expect(page.getByTestId("dashboard-node.heading")).toBeVisible({ timeout: 15000 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("home-admin-overview")).toHaveCount(0);
    expectNoHydrationFailure(pageErrors);
  });

  test("a platform admin opens every community and not a member's setup", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await openCommunity(page, "platformAdminOnly");
    await expect(page.getByTestId("node-page.open-admin")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("node-page.join-at-event")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-setup")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-community")).toHaveCount(0);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("home-admin-overview")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("admin-progress")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("home-owner.setup")).toHaveCount(0);
    expectNoHydrationFailure(pageErrors);
  });
});
