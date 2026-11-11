import { expect, test } from "@playwright/test";
import { createAuthTestInstance } from "../../lib/auth-test-instance";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { waitForApp } from "../helpers/page-ready";
import { injectSessionCookies } from "../helpers/seeded";

test.use({ trace: "on" });

test("passkey signup creates an active personal organization and can sign in again", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("login.create-account-link").click();
    await page.getByTestId("login.create-account-button").click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000, waitUntil: "commit" });
    const signedUp = await (await context.request.get("/api/auth/get-session")).json();
    expect(signedUp.user.id).toBeTruthy();
    const organizations = await (await context.request.get("/api/auth/organization/list")).json();
    expect(organizations).toHaveLength(1);
    expect(organizations[0]).toMatchObject({ status: "active" });
    await page.goto("/orgs", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("orgs.heading")).toBeVisible();
    await expect(page.getByTestId("orgs-pending")).toHaveCount(0);
    // Sign out through the auth surface — the spec's intent is "can sign in
    // again", not the account-menu interaction (covered in account-menu.spec).
    await context.request.post("/api/auth/sign-out");
    await context.clearCookies();
    expect(await (await context.request.get("/api/auth/get-session")).json()).toBeNull();
    // Exercise the sign-in button before conditional autofill can navigate away.
    await page.addInitScript(() => {
      PublicKeyCredential.isConditionalMediationAvailable = async () => false;
    });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("login.passkey-button").click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000, waitUntil: "commit" });
    expect((await (await context.request.get("/api/auth/get-session")).json()).user.id).toBe(
      signedUp.user.id,
    );
  } finally {
    if (!page.isClosed()) {
      await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId }).catch((error) => {
        if (!page.isClosed()) throw error;
      });
    }
  }
});

test("creating an organization makes it active with the creator as owner", async ({ page }) => {
  const env = computeRegressionEnv();
  const fixture = await createAuthTestInstance({
    authDatabaseUrl: env.dbUrls.AUTH_DATABASE_URL,
    secret: env.authSecret,
  });
  const unique = `active-${Date.now()}`;
  const slug = `created-${unique}`;
  try {
    const creator = await fixture.test.saveUser(
      fixture.test.createUser({
        email: `${unique}@example.com`,
        name: "Organization creator",
        role: "user",
        emailVerified: true,
      }),
    );
    await injectSessionCookies(
      page,
      await fixture.test.getCookies({ userId: creator.id, domain: "localhost" }),
    );
    await page.goto("/orgs/new", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await page.getByPlaceholder("My Team").fill(`Created ${unique}`);
    await page.getByPlaceholder("my-team").fill(slug);
    await page.getByTestId("orgs.new.submit").click();
    await expect(page).toHaveURL(new RegExp(`/orgs/${slug}`), {
      waitUntil: "commit",
      timeout: 15000,
    });
    await expect(page.getByTestId("orgs-request-status")).toHaveCount(0);
    await expect(page.getByTestId("orgs-tab-members")).toBeVisible();
    await expect(page.getByTestId("org-badges")).toContainText("Owner");
    await expect(page.getByTestId("org-badges")).toContainText("Active", { timeout: 15000 });
    await expect(page.getByTestId("org-make-active")).toHaveCount(0);
  } finally {
    await fixture.close();
  }
});
