import { expect, test } from "@playwright/test";
import { createAuthTestInstance } from "../../lib/auth-test-instance";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { waitForApp } from "../helpers/page-ready";
import { injectAdminCookies } from "../helpers/seeded";

test.use({ trace: "on" });

for (const decision of ["approve", "reject"] as const) {
  test(`organization request stays pending until admins ${decision} it`, async ({
    page,
    browser,
  }) => {
    const env = computeRegressionEnv();
    const fixture = await createAuthTestInstance({
      authDatabaseUrl: env.dbUrls.AUTH_DATABASE_URL,
      secret: env.authSecret,
    });
    const unique = `${decision}-${Date.now()}`;
    const slug = `approval-${unique}`;
    try {
      const requester = await fixture.test.saveUser(
        fixture.test.createUser({
          email: `${unique}@example.com`,
          name: "Organization requester",
          role: "user",
          emailVerified: true,
        }),
      );
      await page
        .context()
        .addCookies(await fixture.test.getCookies({ userId: requester.id, domain: "localhost" }));
      await page.goto("/orgs/new", { waitUntil: "domcontentloaded" });
      await waitForApp(page);
      await page.getByPlaceholder("My Team").fill(`Requested ${unique}`);
      await page.getByPlaceholder("my-team").fill(slug);
      await page.getByTestId("orgs.new.submit").click();
      await expect(page).toHaveURL(new RegExp(`/orgs/${slug}`), {
        waitUntil: "commit",
        timeout: 15000,
      });
      await expect(page.getByTestId("orgs-request-status")).toContainText("Pending approval");
      await expect(page.getByTestId("org-make-active")).toHaveCount(0);
      await expect(page.getByTestId("orgs-tab-members")).toHaveCount(0);
      await page.goto("/admin/organizations", { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/admin\//, { waitUntil: "commit" });
      await expect(page.getByTestId("admin-organizations.heading")).toHaveCount(0);
      await page.goto(`/orgs/${slug}`, { waitUntil: "domcontentloaded" });

      const adminContext = await browser.newContext();
      try {
        const adminPage = await adminContext.newPage();
        await injectAdminCookies(adminPage);
        await adminPage.goto("/admin", { waitUntil: "domcontentloaded" });
        await adminPage.getByTestId("admin.heading.organizations").click();
        await expect(adminPage.getByTestId("admin-organizations.heading")).toBeVisible();
        const request = adminPage.getByTestId(`admin-org-request-${slug}`);
        await expect(request).toBeVisible();
        if (decision === "reject") {
          await expect(request.getByTestId("admin-org-reject")).toBeDisabled();
          await request
            .getByTestId("admin-org-rejection-reason")
            .fill("Please explain the organization's purpose.");
        }
        await request.getByTestId(`admin-org-${decision}`).click();
        await expect(request).toHaveCount(0);
      } finally {
        await adminContext.close();
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      if (decision === "approve") {
        await expect(page.getByTestId("orgs-tab-members")).toBeVisible();
        await expect(page.getByTestId("org-badges")).toContainText("Owner");
        await page.getByTestId("org-make-active").click();
        await expect(page.getByTestId("org-badges")).toContainText("Active");
      } else {
        await expect(page.getByTestId("orgs-request-status")).toContainText("Request rejected");
        await expect(page.getByTestId("orgs-request-reason")).toHaveText(
          "Please explain the organization's purpose.",
        );
        await page.goto("/orgs", { waitUntil: "domcontentloaded" });
        const card = page.getByTestId(`orgs-card-${slug}`);
        await expect(card.getByTestId("orgs-rejected")).toBeVisible();
        await expect(card.getByTestId("orgs-rejection-reason")).toHaveText(
          "Please explain the organization's purpose.",
        );
        await expect(card.getByRole("button", { name: "Make active" })).toHaveCount(0);
      }
    } finally {
      await fixture.close();
    }
  });
}
