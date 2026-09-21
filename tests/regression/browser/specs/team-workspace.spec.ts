import { expect, type Page, test } from "@playwright/test";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

const { baseUrl } = computeRegressionEnv();

async function authFetch(path: string, cookie: string, body?: unknown) {
  const response = await fetch(`${baseUrl}/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", origin: baseUrl, cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  });
  if (!response.ok) throw new Error(`anonymous sign-in failed: ${response.status}`);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function seedTeamMember() {
  const suffix = `${process.pid}-${Date.now()}`;
  const ownerCookie = await signInAnonymously();
  const org = await (
    await authFetch("/organization/create", ownerCookie, {
      name: `team-workspace-${suffix}`,
      slug: `team-workspace-${suffix}`,
    })
  ).json();
  const team = await (
    await authFetch("/organization/create-team", ownerCookie, {
      name: "Stake Desk",
      organizationId: org.id,
      metadata: JSON.stringify({ areas: ["stake"] }),
    })
  ).json();

  const memberCookie = await signInAnonymously();
  const session = await (await authFetch("/get-session", memberCookie)).json();
  const invitation = await (
    await authFetch("/organization/invite-member", ownerCookie, {
      email: session.user.email,
      role: "member",
      organizationId: org.id,
      teamId: team.id,
    })
  ).json();
  await authFetch("/organization/accept-invitation", memberCookie, {
    invitationId: invitation.id,
  });
  return { memberCookie, teamName: team.name as string };
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

test.describe("team workspace", () => {
  test("switching teams filters navigation and guards restricted routes", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const { memberCookie, teamName } = await seedTeamMember();
    await useCookieHeader(page, memberCookie);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    const switcher = page.getByTestId("team-switcher");
    await expect(switcher).toContainText(teamName, { timeout: 10000 });
    await expect(page.getByTestId("workspace-active-team")).toContainText(teamName);
    await expect(page.getByTestId("sidebar-nav-stake")).toBeVisible();
    await expect(page.getByTestId("sidebar-nav-things")).toHaveCount(0);

    await page.goto("/things", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/dashboard\?restricted=things/, {
      timeout: 10000,
      waitUntil: "commit",
    });
    await expect(page.getByTestId("workspace-restricted-notice")).toBeVisible({ timeout: 10000 });

    await switcher.click();
    await page.getByTestId("team-switcher-item-all").click();
    await expect(switcher).toContainText("All areas", { timeout: 10000 });
    await expect(page.getByTestId("sidebar-nav-things")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("workspace-active-team")).toHaveCount(0);

    await page.getByTestId("sidebar-nav-things").click();
    await page.waitForURL(/\/things/, { timeout: 10000, waitUntil: "commit" });

    expectNoHydrationFailure(pageErrors);
  });
});
