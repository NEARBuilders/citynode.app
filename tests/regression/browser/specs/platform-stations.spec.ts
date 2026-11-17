import { expect, test } from "@playwright/test";
import { seedDiscoveryActivity } from "../../lib/seed-tenant.mjs";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";
import { type PlatformAdmin, seedPlatformAdmin } from "../helpers/platform-stations-seed";
import { injectSessionCookies } from "../helpers/seeded";

test.use({ trace: "on" });

const HOUR = 3_600_000;

type PlatformStations = {
  organization: { id: string; name: string; nodeId: string; role: string | null } | null;
};

test.describe("platform stations", () => {
  let admin: PlatformAdmin;

  test.beforeAll(async () => {
    admin = await seedPlatformAdmin();
  });

  test("a platform admin opens a station at a platform event and an attendee joins through it", async ({
    page,
    browser,
  }) => {
    const pageErrors = collectErrors(page);
    await injectSessionCookies(page, admin.cookies);

    await page.goto("/admin/stations", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    const setup = page.getByTestId("admin-stations.setup");
    const ready = page.getByTestId("admin-stations.ready");
    await expect(setup.or(ready)).toBeVisible({ timeout: 15000 });
    if (await setup.isVisible()) {
      await page.getByTestId("admin-stations.set-up").click();
    } else if (await page.getByTestId("admin-stations.join").isVisible()) {
      await page.getByTestId("admin-stations.join").click();
    }
    await expect(page.getByTestId("admin-stations.open")).toBeVisible({ timeout: 15000 });

    const stations: PlatformStations = (
      await (await page.request.post("/api/rpc/getPlatformStations", { data: { json: {} } })).json()
    ).json;
    const organization = stations.organization;
    expect(organization?.role).toBeTruthy();
    const eventTitle = `Platform Station Night ${Date.now()}`;
    const now = Date.now();
    const event = await seedDiscoveryActivity({
      nodeId: organization?.nodeId,
      title: eventTitle,
      status: "published",
      startsAt: new Date(now + 24 * HOUR).toISOString(),
      endsAt: new Date(now + 27 * HOUR).toISOString(),
    });

    await page.getByTestId("admin-stations.open").click();
    await page.waitForURL(/[?&]tab=onboard/, { timeout: 15000, waitUntil: "commit" });
    await expect(page.getByTestId("onboard.event-picker")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("onboard.event-select").click();
    await page.getByTestId(`onboard.event-option-${event.id}`).click();
    const stationResponse = page.waitForResponse((response) =>
      response.url().includes("getOnboardingStation"),
    );
    await page.getByTestId("onboard.start-station").click();
    await page.waitForURL(/\/onboarding\/station\//, { timeout: 15000, waitUntil: "commit" });
    await expect(page.getByTestId("station.event-name")).toHaveText(eventTitle, { timeout: 15000 });
    const code: string = (await (await stationResponse).json()).json.code;
    expect(code).toBeTruthy();

    const attendeeContext = await browser.newContext();
    const attendee = await attendeeContext.newPage();
    const cdp = await attendeeContext.newCDPSession(attendee);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
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
      await attendee.goto(`/onboard?code=${code}`, { waitUntil: "domcontentloaded" });
      await waitForApp(attendee);
      await expect(attendee.getByTestId("onboard.invite")).toContainText(organization?.name ?? "", {
        timeout: 15000,
      });
      await attendee.getByTestId("onboard.create-account-button").click();
      const joined = attendee.getByTestId("onboard.success");
      await expect(joined).toBeVisible({ timeout: 20000 });
      await expect(joined).toContainText(eventTitle);
    } finally {
      await attendeeContext.close();
    }

    await expect(page.getByTestId("station.joined-count")).toContainText("1", { timeout: 20000 });
    expectNoHydrationFailure(pageErrors);
  });
});
