import { expect, test } from "@playwright/test";
import { seedOnboardingCodes } from "../helpers/onboarding-seed";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

test.use({ trace: "on" });

test("an attendee scans a code, creates a passkey once and lands on the joined panel", async ({
  page,
  context,
}) => {
  const seeded = await seedOnboardingCodes();
  const code = seeded.codes.valid;
  const pageErrors = collectErrors(page);
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
  const ceremonies = { created: 0, asserted: 0 };
  cdp.on("WebAuthn.credentialAdded", () => {
    ceremonies.created += 1;
  });
  cdp.on("WebAuthn.credentialAsserted", () => {
    ceremonies.asserted += 1;
  });
  try {
    await page.goto(`/onboard?code=${code}`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    const invite = page.getByTestId("onboard.invite");
    await expect(invite).toBeVisible({ timeout: 15000 });
    await expect(invite).toContainText(seeded.organizationName);
    await expect(page.getByTestId("onboard.progress")).toHaveAttribute("data-step", "1");

    await page.getByTestId("onboard.create-account-button").click();

    const joined = page.getByTestId("onboard.success");
    await expect(joined).toBeVisible({ timeout: 20000 });
    await expect(joined).toContainText(seeded.organizationName);
    await expect(joined).toContainText(seeded.eventName);
    await expect(page.getByTestId("onboard.progress")).toHaveAttribute("data-step", "3");
    expect(ceremonies).toEqual({ created: 1, asserted: 0 });

    await page.getByTestId("onboard.display-name-skip").click();
    await expect(page.getByTestId("onboard.continue-on-computer")).toBeVisible();
    await expect(page.getByTestId("onboard.success")).toContainText(seeded.organizationName);
    // The tenant community deep-link is a citynode feature returning upstream
    // (everything-dev#583); the published onboard screen offers the app-level
    // destinations instead.
    await expect(page.getByTestId("onboard.home-button")).toBeVisible();

    const session = await (await context.request.get("/api/auth/get-session")).json();
    expect(session.user.id).toBeTruthy();
    expect(session.session.activeTeamId ?? null).toBeNull();

    await page.getByTestId("onboard.home-button").click();
    await page.waitForURL("**/dashboard", { waitUntil: "commit" });
    expect(ceremonies).toEqual({ created: 1, asserted: 0 });
    expectNoHydrationFailure(pageErrors);
  } finally {
    if (!page.isClosed()) {
      await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId }).catch((error) => {
        if (!page.isClosed()) throw error;
      });
    }
  }
});
