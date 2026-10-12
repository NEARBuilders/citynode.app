import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { seedNode, seedTenant } from "../../lib/seed-tenant.mjs";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { seedOrganizationRedemptions } from "../helpers/redemption-seed";

const { baseUrl } = computeRegressionEnv();
const FETCH_TIMEOUT_MS = 15_000;
const REDEMPTION_STATS = [
  "dashboard-node.stat-redeemed-this-month",
  "dashboard-node.stat-new-members-this-month",
  "dashboard-node.stat-redeemed-last-month",
  "dashboard-node.stat-new-members-last-month",
];

test.use({ trace: "on" });

async function authFetch(path: string, cookie: string, body?: unknown) {
  const response = await fetch(`${baseUrl}/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", origin: baseUrl, cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function signInAnonymously() {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`anonymous sign-in failed: ${response.status}`);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function refreshSessionCookies(cookie: string) {
  const response = await fetch(`${baseUrl}/api/auth/get-session?disableCookieCache=true`, {
    headers: { cookie, origin: baseUrl },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`session refresh failed: ${response.status}`);
  const jar = new Map(cookie.split("; ").map((pair) => [pair.slice(0, pair.indexOf("=")), pair]));
  for (const pair of response.headers.getSetCookie().map((value) => value.split(";")[0])) {
    const name = pair.slice(0, pair.indexOf("="));
    if (pair.slice(name.length + 1).length === 0) jar.delete(name);
    else jar.set(name, pair);
  }
  return [...jar.values()].join("; ");
}

async function useCookieHeader(page: Page, cookieHeader: string) {
  const url = new URL(baseUrl);
  await page.context().addCookies(
    cookieHeader.split("; ").map((pair) => {
      const index = pair.indexOf("=");
      return {
        name: pair.slice(0, index),
        value: pair.slice(index + 1),
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax" as const,
      };
    }),
  );
}

async function seedCommunity() {
  const suffix = `${process.pid}-${Date.now().toString(36)}`;
  const ownerCookie = await signInAnonymously();
  const organization = await (
    await authFetch("/organization/create", ownerCookie, {
      name: `redemptions-${suffix}`,
      slug: `redemptions-${suffix}`,
    })
  ).json();
  execFileSync("bun", ["tests/regression/lib/approve-test-organizations.ts", organization.id], {
    timeout: FETCH_TIMEOUT_MS,
  });
  const tenant = await seedTenant({
    subdomain: `redemptions-${suffix}`,
    name: `Redemptions ${suffix}`,
    accountId: `redemptions-${suffix}.testnet`,
    orgId: organization.id,
  });
  await seedNode({ tenantId: tenant.id, slug: `redemptions-${suffix}`, name: `Harbor ${suffix}` });
  await seedOrganizationRedemptions(organization.id);
  const team = await (
    await authFetch("/organization/create-team", ownerCookie, {
      name: "Treasury",
      organizationId: organization.id,
      metadata: JSON.stringify({ areas: ["finance"] }),
    })
  ).json();
  const memberCookie = await signInAnonymously();
  const memberSession = await (await authFetch("/get-session", memberCookie)).json();
  const invitation = await (
    await authFetch("/organization/invite-member", ownerCookie, {
      email: memberSession.user.email,
      role: "member",
      organizationId: organization.id,
      teamId: team.id,
    })
  ).json();
  await authFetch("/organization/accept-invitation", memberCookie, {
    invitationId: invitation.id,
  });
  for (const cookie of [ownerCookie, memberCookie]) {
    await authFetch("/organization/set-active", cookie, { organizationId: organization.id });
  }
  return {
    ownerCookie: await refreshSessionCookies(ownerCookie),
    memberCookie: await refreshSessionCookies(memberCookie),
  };
}

function watchRedemptionRequests(page: Page) {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (/getOnboardingRedemptions|onboarding\/redemptions/.test(request.url())) {
      urls.push(request.url());
    }
  });
  return urls;
}

test.describe("overview code redemptions", () => {
  let community: Awaited<ReturnType<typeof seedCommunity>>;

  test.beforeAll(async () => {
    community = await seedCommunity();
  });

  test("shows the owner this month's and last month's redemptions", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await useCookieHeader(page, community.ownerCookie);

    await page.goto("/dashboard/node", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("dashboard-node.stat-validators")).toBeVisible({
      timeout: 15000,
    });

    const expected = ["2", "1", "1", "1"];
    for (const [index, testId] of REDEMPTION_STATS.entries()) {
      await expect(page.getByTestId(testId).locator("dd")).toHaveText(expected[index]!, {
        timeout: 15000,
      });
    }
    await expect(page.getByTestId("dashboard-node.redemptions-error")).toHaveCount(0);
    expectNoHydrationFailure(pageErrors);
  });

  test("hides the figures from a member without the events area", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const requests = watchRedemptionRequests(page);
    await useCookieHeader(page, community.memberCookie);

    await page.goto("/dashboard/node", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("dashboard-node.stat-validators")).toBeVisible({
      timeout: 15000,
    });
    await page.waitForLoadState("networkidle");

    for (const testId of REDEMPTION_STATS) {
      await expect(page.getByTestId(testId)).toHaveCount(0);
    }
    expect(requests).toEqual([]);
    expectNoHydrationFailure(pageErrors);
  });
});
