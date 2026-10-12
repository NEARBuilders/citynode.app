import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { seedDiscoveryProfile, seedNode, seedTenant } from "../../lib/seed-tenant.mjs";
import {
  authFetch,
  FETCH_TIMEOUT_MS,
  markEmailVerified,
  signInAnonymously,
  useCookieHeader,
} from "../helpers/auth-session";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectAdminCookies } from "../helpers/seeded";

test.use({ trace: "on" });

const { baseUrl } = computeRegressionEnv();
type Profile = { published: boolean; latitude?: number; longitude?: number };

async function seedCommunity(
  ownerCookie: string,
  label: string,
  status: "active" | "suspended",
  profile: Profile,
) {
  const unique = `map-${label}-${process.pid}-${Date.now().toString(36)}`;
  const org = await (
    await authFetch("/organization/create", ownerCookie, { name: unique, slug: unique })
  ).json();
  execFileSync("bun", ["tests/regression/lib/approve-test-organizations.ts", org.id], {
    timeout: FETCH_TIMEOUT_MS,
  });
  const tenant = await seedTenant({
    subdomain: unique,
    name: `Map ${unique}`,
    accountId: `${unique}.near`,
    orgId: org.id,
    status,
  });
  const node = await seedNode({ tenantId: tenant.id, slug: unique, name: `Map City ${unique}` });
  await seedDiscoveryProfile({ nodeId: node.id, ...profile });
  return { orgId: org.id as string, tenantId: tenant.id as string, nodeId: node.id as string };
}

async function openOverview(page: Page, organizationId: string, nodeId: string) {
  const activated = await page.request.post("/api/auth/organization/set-active", {
    data: { organizationId },
    headers: { origin: baseUrl },
  });
  expect(activated.ok(), await activated.text()).toBe(true);
  await page.goto(`/dashboard/node?nodeId=${nodeId}`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await expect(page.getByTestId("dashboard-node.heading")).toBeVisible({ timeout: 15000 });
}

test.describe("community map status", () => {
  test("Overview says why a community is not on the map, and only managers get the fix", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const pageErrors = collectErrors(page);
    const ownerCookie = await signInAnonymously();
    const suspended = await seedCommunity(ownerCookie, "suspended", "suspended", {
      published: true,
      latitude: 38.72,
      longitude: -9.14,
    });
    const hidden = await seedCommunity(ownerCookie, "hidden", "active", { published: false });
    const noPin = await seedCommunity(ownerCookie, "nopin", "active", { published: true });
    const onMap = await seedCommunity(ownerCookie, "onmap", "active", {
      published: true,
      latitude: 38.72,
      longitude: -9.14,
    });
    await useCookieHeader(page.context(), ownerCookie);

    const status = page.getByTestId("dashboard-node.map-status");
    const action = page.getByTestId("dashboard-node.map-status-action");
    const viewExplore = page.getByTestId("community-header.view-explore");

    await openOverview(page, suspended.orgId, suspended.nodeId);
    await expect(status).toHaveAttribute("data-state", "inactive", { timeout: 15000 });
    await expect(status).toHaveAttribute("data-tenant-status", "suspended");
    await expect(action).toBeVisible();
    await expect(viewExplore).toHaveCount(0);
    await action.click();
    await page.waitForURL(
      (url) =>
        url.pathname === `/tenant/${suspended.tenantId}` &&
        url.searchParams.get("nodeId") === suspended.nodeId,
      { waitUntil: "commit" },
    );
    await expect(page.getByTestId("tenant.danger-zone")).toBeVisible({ timeout: 15000 });

    const eventsStatus = page.getByTestId("content-map-status");
    await page.goto(`/nodes/${suspended.nodeId}/content`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(eventsStatus).toHaveAttribute("data-state", "inactive", { timeout: 15000 });
    await expect(eventsStatus).toHaveAttribute("data-tenant-status", "suspended");
    await expect(page.getByTestId("content-map-status-action")).toBeVisible();

    const adminContext = await browser.newContext({ baseURL: baseUrl });
    const adminPage = await adminContext.newPage();
    await injectAdminCookies(adminPage);
    await adminPage.goto(`/nodes/${suspended.nodeId}/content`, { waitUntil: "domcontentloaded" });
    await waitForApp(adminPage);
    await expect(adminPage.getByTestId("content-map-status")).toHaveAttribute(
      "data-tenant-status",
      "suspended",
      { timeout: 15000 },
    );
    await adminContext.close();

    await openOverview(page, hidden.orgId, hidden.nodeId);
    await expect(status).toHaveAttribute("data-state", "hidden", { timeout: 15000 });
    await expect(action).toBeVisible();
    await expect(viewExplore).toHaveCount(0);

    await page.setViewportSize({ width: 360, height: 780 });
    await expect(status).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await status.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(360);
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto(`/nodes/${hidden.nodeId}/content`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(eventsStatus).toHaveAttribute("data-state", "hidden", { timeout: 15000 });
    await expect(page.getByTestId("content-map-status-action")).toBeVisible();
    await expect(viewExplore).toHaveCount(0);

    await openOverview(page, noPin.orgId, noPin.nodeId);
    await expect(status).toHaveAttribute("data-state", "noPin", { timeout: 15000 });
    await expect(action).toBeVisible();
    await expect(viewExplore).toBeVisible();

    await openOverview(page, onMap.orgId, onMap.nodeId);
    await expect(viewExplore).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("dashboard-node.stat-events")).toBeVisible();
    await expect(status).toHaveCount(0);

    const memberCookie = await signInAnonymously();
    const session = await (await authFetch("/get-session", memberCookie)).json();
    markEmailVerified(session.user.id);
    const invitation = await (
      await authFetch("/organization/invite-member", ownerCookie, {
        email: session.user.email,
        role: "member",
        organizationId: hidden.orgId,
      })
    ).json();
    await authFetch("/organization/accept-invitation", memberCookie, {
      invitationId: invitation.id,
    });
    const memberContext = await browser.newContext({ baseURL: baseUrl });
    await useCookieHeader(memberContext, memberCookie);
    const memberPage = await memberContext.newPage();
    await openOverview(memberPage, hidden.orgId, hidden.nodeId);
    await expect(memberPage.getByTestId("dashboard-node.map-status")).toHaveAttribute(
      "data-state",
      "hidden",
      { timeout: 15000 },
    );
    await expect(memberPage.getByTestId("dashboard-node.map-status-action")).toHaveCount(0);
    await memberContext.close();

    expectNoHydrationFailure(pageErrors);
  });
});
