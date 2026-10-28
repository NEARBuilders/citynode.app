import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { seedNode, seedTenant } from "../../lib/seed-tenant.mjs";
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

async function activate(page: Page, organizationId: string) {
  const activated = await page.request.post("/api/auth/organization/set-active", {
    data: { organizationId },
    headers: { origin: baseUrl },
  });
  expect(activated.ok(), await activated.text()).toBe(true);
}

test.describe("community settings merge", () => {
  test("old Organization config tabs send owners to Community settings and keep members on Members", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const pageErrors = collectErrors(page);
    await page.route(/(rpc\.(mainnet|testnet)\.|fastnear\.com|near\.org)/, (route) =>
      route.abort(),
    );

    const ownerCookie = await signInAnonymously();
    const unique = `settings-merge-${process.pid}-${Date.now().toString(36)}`;
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
      name: `Settings ${unique}`,
      accountId: `${unique}.near`,
      orgId: org.id,
    });
    await seedNode({ tenantId: tenant.id, slug: unique, name: `Settings City ${unique}` });

    await useCookieHeader(page.context(), ownerCookie);
    await activate(page, org.id);

    for (const tab of ["node-config", "homepage"]) {
      await page.goto(`/orgs/${unique}?tab=${tab}`, { waitUntil: "domcontentloaded" });
      await waitForApp(page);
      await page.waitForURL(
        (url) => url.pathname === `/tenant/${tenant.id}` && url.hash === "#published-config",
        { waitUntil: "commit", timeout: 15000 },
      );
      await expect(page.getByTestId("tenant.section.published-config")).toBeVisible({
        timeout: 15000,
      });
    }
    await expect(page.getByTestId("tenant-published-config-title")).toBeEnabled();

    await page.goto(`/orgs/${unique}`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("orgs-tab-members")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("orgs-tab-node-config")).toHaveCount(0);
    await expect(page.getByTestId("orgs-tab-homepage")).toHaveCount(0);
    const settingsLink = page.getByTestId("org-community-settings");
    await expect(settingsLink).toBeVisible({ timeout: 15000 });
    await settingsLink.click();
    await page.waitForURL((url) => url.pathname === `/tenant/${tenant.id}`, {
      waitUntil: "commit",
    });
    await expect(page.getByTestId("tenant.section.published-config")).toBeVisible({
      timeout: 15000,
    });

    const memberCookie = await signInAnonymously();
    const session = await (await authFetch("/get-session", memberCookie)).json();
    markEmailVerified(session.user.id);
    const invitation = await (
      await authFetch("/organization/invite-member", ownerCookie, {
        email: session.user.email,
        role: "member",
        organizationId: org.id,
      })
    ).json();
    await authFetch("/organization/accept-invitation", memberCookie, {
      invitationId: invitation.id,
    });
    const memberContext = await browser.newContext({ baseURL: baseUrl });
    await useCookieHeader(memberContext, memberCookie);
    const memberPage = await memberContext.newPage();
    await activate(memberPage, org.id);

    await memberPage.goto(`/orgs/${unique}?tab=homepage`, { waitUntil: "domcontentloaded" });
    await waitForApp(memberPage);
    await expect(memberPage.getByTestId("org-badges")).toBeVisible({ timeout: 15000 });
    await expect(memberPage.getByTestId("orgs-tabs-loading")).toHaveCount(0, { timeout: 15000 });
    await expect(memberPage.getByRole("tablist")).toHaveCount(0);
    await expect(memberPage.getByTestId("orgs-tab-members")).toHaveCount(0);
    expect(new URL(memberPage.url()).pathname).toBe(`/orgs/${unique}`);
    await expect(memberPage.getByTestId("org-community-settings")).toHaveCount(0);

    await memberPage.goto(`/tenant/${tenant.id}`, { waitUntil: "domcontentloaded" });
    await memberPage.waitForURL((url) => url.pathname === "/dashboard", {
      waitUntil: "commit",
      timeout: 15000,
    });
    await waitForApp(memberPage);
    await expect(memberPage.getByTestId("tenant.section.published-config")).toHaveCount(0);
    await memberContext.close();

    expectNoHydrationFailure(pageErrors);
  });
});
