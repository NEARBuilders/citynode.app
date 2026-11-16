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

test.use({ trace: "on" });

const { baseUrl } = computeRegressionEnv();

async function seedCommunity(ownerCookie: string, label: string) {
  const unique = `map-${label}-${process.pid}-${Date.now().toString(36)}`;
  const org = await (
    await authFetch("/organization/create", ownerCookie, { name: unique, slug: unique })
  ).json();
  execFileSync(
    "pnpm",
    ["exec", "tsx", "tests/regression/lib/approve-test-organizations.ts", org.id],
    {
      timeout: FETCH_TIMEOUT_MS,
    },
  );
  const tenant = await seedTenant({
    subdomain: unique,
    name: `Map ${unique}`,
    accountId: `${unique}.near`,
    orgId: org.id,
  });
  const node = await seedNode({ tenantId: tenant.id, slug: unique, name: `Map City ${unique}` });
  await seedDiscoveryProfile({
    nodeId: node.id,
    published: true,
    latitude: 38.72,
    longitude: -9.14,
  });
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
  test("Overview tells a manager when the place is not a community yet", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const pageErrors = collectErrors(page);
    const ownerCookie = await signInAnonymously();
    const community = await seedCommunity(ownerCookie, "unactivated");
    await useCookieHeader(page.context(), ownerCookie);

    const status = page.getByTestId("dashboard-node.map-status");
    await openOverview(page, community.orgId, community.nodeId);
    await expect(status).toHaveAttribute("data-state", "unactivated", { timeout: 15000 });
    await expect(page.getByTestId("dashboard-node.map-status-action")).toHaveCount(0);

    await page.setViewportSize({ width: 360, height: 780 });
    await expect(status).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto(`/nodes/${community.nodeId}/content`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("content-map-status")).toHaveAttribute(
      "data-state",
      "unactivated",
      {
        timeout: 15000,
      },
    );

    const memberCookie = await signInAnonymously();
    const session = await (await authFetch("/get-session", memberCookie)).json();
    markEmailVerified(session.user.id);
    const invitation = await (
      await authFetch("/organization/invite-member", ownerCookie, {
        email: session.user.email,
        role: "member",
        organizationId: community.orgId,
      })
    ).json();
    await authFetch("/organization/accept-invitation", memberCookie, {
      invitationId: invitation.id,
    });
    const memberContext = await browser.newContext({ baseURL: baseUrl });
    await useCookieHeader(memberContext, memberCookie);
    const memberPage = await memberContext.newPage();
    await openOverview(memberPage, community.orgId, community.nodeId);
    await expect(memberPage.getByTestId("dashboard-node.heading")).toBeVisible({ timeout: 15000 });
    await expect(memberPage.getByTestId("dashboard-node.map-status")).toHaveCount(0);
    await memberContext.close();

    expectNoHydrationFailure(pageErrors);
  });
});
