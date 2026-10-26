import { expect, test } from "@playwright/test";
import {
  seedDiscoveryActivity,
  seedDiscoveryProfile,
  seedNode,
  seedNodeProposal,
  seedTenant,
} from "../../lib/seed-tenant.mjs";
import { seedCommunityJoins } from "../helpers/onboarding-seed";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { injectAdminCookies } from "../helpers/seeded";

const DAY = 86_400_000;

test.use({ trace: "on" });

test.describe("admin progress and needs action", () => {
  test("an admin follows a community from the overview to its page and reviews an application", async ({
    page,
  }) => {
    const pageErrors = collectErrors(page);
    const unique = `progress-${process.pid}-${Date.now().toString(36)}`;
    const { organizationId } = await seedCommunityJoins();
    const tenant = await seedTenant({
      subdomain: unique,
      name: `Progress ${unique}`,
      accountId: `${unique}.near`,
      orgId: organizationId,
    });
    const parentTenant = await seedTenant({
      subdomain: `${unique}-country`,
      name: `Country ${unique}`,
      accountId: `${unique}-country.near`,
    });
    const parent = await seedNode({
      tenantId: parentTenant.id,
      slug: `${unique}-country`,
      name: `Country ${unique}`,
      kind: "country",
    });
    const node = await seedNode({
      tenantId: tenant.id,
      slug: unique,
      name: `Progress City ${unique}`,
      parentId: parent.id,
    });
    await seedDiscoveryProfile({ nodeId: node.id, published: true, location: "Progress City" });
    const now = Date.now();
    await seedDiscoveryActivity({
      nodeId: node.id,
      title: "Past meetup",
      status: "published",
      publishedAt: new Date(now - 30 * DAY).toISOString(),
      startsAt: new Date(now - 10 * DAY).toISOString(),
      endsAt: new Date(now - 10 * DAY + 3_600_000).toISOString(),
    });
    await seedDiscoveryActivity({
      nodeId: node.id,
      title: "Next meetup",
      status: "published",
      publishedAt: new Date(now - DAY).toISOString(),
      startsAt: new Date(now + 5 * DAY).toISOString(),
      endsAt: new Date(now + 5 * DAY + 3_600_000).toISOString(),
    });
    const application = await seedNodeProposal({
      slug: `${unique}-apply`,
      name: `Applicant ${unique}`,
      parentId: node.id,
      submitterAccountId: "applicant.near",
    });
    await injectAdminCookies(page);

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByTestId("admin.section.manage")).toBeInViewport({ timeout: 15000 });
    await expect(page.getByTestId("admin.stat.tenants")).toHaveCount(0);

    const applicationItem = page.getByTestId(`admin-needs-action-application-${application.id}`);
    await expect(applicationItem).toBeVisible({ timeout: 15000 });

    const row = page.getByTestId(`admin-progress-row-${node.id}`);
    if (!(await row.isVisible())) await page.getByTestId("admin-progress-toggle").click();
    await expect(row.getByTestId("admin-progress-events")).toHaveText("1 upcoming · 1 past", {
      timeout: 15000,
    });
    await expect(row.getByTestId("admin-progress-staking")).toHaveText("No validator");

    await row.getByTestId("admin-progress-link").click();
    await page.waitForURL(new RegExp(`/admin/nodes/${node.id}`), { waitUntil: "commit" });
    await waitForApp(page);
    await expect(page.getByTestId("app-header-breadcrumb")).toContainText(node.name, {
      timeout: 15000,
    });
    await expect(page.getByTestId("admin-node-stat-events")).toContainText("1");
    await expect(page.getByTestId("admin-node-stat-events")).toContainText("1 past");
    await expect(page.getByTestId("admin-node-tab-management")).toHaveText("Node management");
    await expect(page.getByTestId("admin-node-technical")).toBeVisible();
    await expect(page.getByText(node.id, { exact: true })).toHaveCount(0);

    await page.getByTestId("admin-community-profile-edit").click();
    await expect(page.getByTestId("admin-community-editor")).toBeVisible();
    await page.getByTestId("discovery-profile-summary").fill(`Summary for ${unique}`);
    await page.getByTestId("admin-community-editor-name").fill(`Renamed ${unique}`);
    await page.getByTestId("admin-node-edit-save").click();
    await expect(page.getByTestId("admin-community-editor")).toBeHidden({ timeout: 15000 });
    await expect(page.getByTestId("admin-community-profile-summary")).toHaveText(
      `Summary for ${unique}`,
      { timeout: 15000 },
    );
    await expect(page.getByTestId("admin-node.heading")).toContainText(`Renamed ${unique}`);

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await page.getByTestId(`admin-needs-action-application-${application.id}`).click();
    await page.waitForURL(new RegExp(`/admin/proposals/${application.id}`), {
      waitUntil: "commit",
    });
    await waitForApp(page);
    const request = page.getByTestId("admin-proposal-request");
    await expect(request).toContainText(`Renamed ${unique}`, { timeout: 15000 });
    await expect(request).toContainText("applicant.near");
    await expect(request).not.toContainText(node.id);
    await expect(page.getByTestId("admin-proposal-approve")).toBeInViewport();
    await expect(page.getByText(application.id, { exact: true })).toHaveCount(0);
    await page.getByTestId("admin-proposal-technical").click();
    await expect(page.getByText(application.id, { exact: true })).toBeVisible();

    expectNoHydrationFailure(pageErrors);
  });
});
