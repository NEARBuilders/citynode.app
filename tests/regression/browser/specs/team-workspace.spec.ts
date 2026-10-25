import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import {
  authFetch,
  FETCH_TIMEOUT_MS,
  markEmailVerified,
  refreshSessionCookies,
  signInAnonymously,
  useCookieHeader,
} from "../helpers/auth-session";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

async function seedTeamMember(teamName = "Stake Desk", areas: string[] = ["stake"]) {
  const suffix = `${process.pid}-${Date.now()}`;
  const ownerCookie = await signInAnonymously();
  const org = await (
    await authFetch("/organization/create", ownerCookie, {
      name: `team-workspace-${suffix}`,
      slug: `team-workspace-${suffix}`,
    })
  ).json();
  execFileSync(
    "pnpm",
    ["exec", "tsx", "tests/regression/lib/approve-test-organizations.ts", org.id],
    {
      timeout: FETCH_TIMEOUT_MS,
    },
  );
  const team = await (
    await authFetch("/organization/create-team", ownerCookie, {
      name: teamName,
      organizationId: org.id,
      metadata: JSON.stringify({ areas }),
    })
  ).json();

  const memberCookie = await signInAnonymously();
  const session = await (await authFetch("/get-session", memberCookie)).json();
  markEmailVerified(session.user.id);
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
  return { memberCookie: await refreshSessionCookies(memberCookie), teamName: team.name as string };
}

test.describe("team workspace", () => {
  test("team membership, rename and deletion refresh the mounted workspace", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const ownerCookie = await signInAnonymously();
    const session = await (await authFetch("/get-session", ownerCookie)).json();
    const suffix = `${process.pid}-${Date.now()}`;
    const org = await (
      await authFetch("/organization/create", ownerCookie, {
        name: `workspace-refresh-${suffix}`,
        slug: `workspace-refresh-${suffix}`,
      })
    ).json();
    execFileSync(
      "pnpm",
      ["exec", "tsx", "tests/regression/lib/approve-test-organizations.ts", org.id],
      {
        timeout: FETCH_TIMEOUT_MS,
      },
    );
    const team = await (
      await authFetch("/organization/create-team", ownerCookie, {
        name: "Finance",
        organizationId: org.id,
        metadata: JSON.stringify({ areas: ["finance"] }),
      })
    ).json();
    await authFetch("/organization/set-active", ownerCookie, { organizationId: org.id });
    await useCookieHeader(page.context(), ownerCookie);
    await page.goto(`/orgs/${org.slug}?tab=teams`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("orgs-tab-teams")).toHaveAttribute("aria-selected", "true");

    const addMember = async () => {
      await page.getByTestId(`teams-tab-add-member-${team.id}`).click();
      await page.getByTestId(`teams-tab-add-member-option-${team.id}-${session.user.id}`).click();
      await page.getByTestId(`teams-tab-add-member-button-${team.id}`).click();
      await expect(page.getByTestId("team-switcher")).toBeVisible();
      await page.getByTestId("team-switcher").click();
      await page.getByTestId(`team-switcher-item-${team.id}`).click();
      await expect(page.getByTestId("workspace-active-team")).toBeVisible();
    };
    await addMember();
    await page.getByTestId(`teams-tab-menu-${team.id}`).click();
    await page.getByTestId(`teams-tab-rename-${team.id}`).click();
    await page.getByTestId(`teams-tab-rename-input-${team.id}`).fill("Treasury");
    await page.getByTestId(`teams-tab-rename-save-${team.id}`).click();
    await expect(page.getByTestId("workspace-active-team")).toContainText("Treasury");
    await expect(page.getByTestId("team-switcher")).toContainText("Treasury");

    await page.getByTestId(`teams-tab-remove-member-${team.id}-${session.user.id}`).click();
    await expect(page.getByTestId("workspace-active-team")).toHaveCount(0);
    await expect(page.getByTestId("team-switcher")).toHaveCount(0);
    await expect(page.getByTestId("orgs-tab-teams")).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/[?&]tab=teams/);
    await addMember();
    await page.getByTestId(`teams-tab-menu-${team.id}`).click();
    await page.getByTestId(`teams-tab-delete-${team.id}`).click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("workspace-active-team")).toHaveCount(0);
    await expect(page.getByTestId("team-switcher")).toHaveCount(0);
    await expect(page.getByTestId(`teams-tab-team-${team.id}`)).toHaveCount(0);
    expectNoHydrationFailure(pageErrors);
  });

  test("switching teams keeps member destinations and guards work-area routes", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    const { memberCookie, teamName } = await seedTeamMember();
    await useCookieHeader(page.context(), memberCookie);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    const switcher = page.getByTestId("team-switcher");
    await expect(switcher).toContainText(teamName, { timeout: 10000 });
    await expect(page.getByTestId("workspace-active-team")).toContainText(teamName);
    await expect(page.getByTestId("sidebar-nav-stake")).toBeVisible();
    await expect(page.getByTestId("sidebar-nav-my-node")).toBeVisible();

    for (const path of ["/dashboard/node", "/dashboard/node/proposals", "/stake"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForApp(page);
      await expect.poll(() => new URL(page.url()).pathname).toBe(path);
      await expect(page.getByTestId("workspace-restricted-notice")).toHaveCount(0);
    }

    await page.goto("/tenant/00000000-0000-4000-8000-000000000398", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL(/\/dashboard\?restricted=node-operations/, {
      timeout: 10000,
      waitUntil: "commit",
    });
    await expect(page.getByTestId("workspace-restricted-notice")).toBeVisible({ timeout: 10000 });

    await switcher.click();
    await page.getByTestId("team-switcher-item-all").click();
    await expect(switcher).toContainText("All areas", { timeout: 10000 });
    await expect(page.getByTestId("workspace-active-team")).toHaveCount(0);

    await page.getByTestId("sidebar-nav-my-node").click();
    await page.waitForURL(/\/dashboard\/node/, { timeout: 10000, waitUntil: "commit" });

    expectNoHydrationFailure(pageErrors);
  });

  test("a selected team without areas falls back to All areas and is cleared", async ({ page }) => {
    const pageErrors = collectErrors(page);
    const { memberCookie } = await seedTeamMember("Event Team", []);
    await useCookieHeader(page.context(), memberCookie);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    await expect(page.getByTestId("sidebar-nav-my-node")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("sidebar-nav-stake")).toBeVisible();
    await expect(page.getByTestId("team-switcher")).toHaveCount(0);
    await expect(page.getByTestId("workspace-active-team")).toHaveCount(0);
    await expect
      .poll(
        async () => {
          const session = await (
            await authFetch("/get-session?disableCookieCache=true", memberCookie)
          ).json();
          return session.session.activeTeamId ?? null;
        },
        { timeout: 10000 },
      )
      .toBeNull();

    await page.getByTestId("sidebar-nav-my-node").click();
    await page.waitForURL(/\/dashboard\/node/, { timeout: 10000, waitUntil: "commit" });
    await expect(page.getByTestId("workspace-restricted-notice")).toHaveCount(0);

    expectNoHydrationFailure(pageErrors);
  });
});
