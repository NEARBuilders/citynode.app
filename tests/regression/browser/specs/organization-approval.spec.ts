import { expect, test } from "@playwright/test";

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
