import { type Browser, expect, type Page, test } from "@playwright/test";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { seedPlace } from "../../lib/seed-tenant.mjs";
import { signInAnonymously, useCookieHeader } from "../helpers/auth-session";
import { collectErrors, expectNoHydrationFailure, waitForApp } from "../helpers/page-ready";

test.use({ trace: "on" });
test.describe.configure({ mode: "serial" });

const { baseUrl } = computeRegressionEnv();
const unique = `${process.pid}-${Date.now().toString(36)}`;
const slug = `join-city-${unique}`;
const name = `Join City ${unique}`;
const communityPath = `/n/${slug}`;

async function openCommunity(page: Page) {
  await page.goto(communityPath, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible({ timeout: 15000 });
}

async function organizationSlugs(page: Page) {
  const response = await page.request.get("/api/auth/organization/list");
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { slug: string }[]).map((organization) => organization.slug);
}

async function activateCommunity(browser: Browser) {
  const context = await browser.newContext({ baseURL: baseUrl });
  try {
    await useCookieHeader(context, await signInAnonymously());
    const page = await context.newPage();
    await page.goto(`/join?place=${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`${communityPath}$`), { timeout: 30000 });
  } finally {
    await context.close();
  }
}

test.describe("joining from the community page", () => {
  test.beforeAll(async ({ browser }) => {
    await seedPlace({ slug, name });
    await activateCommunity(browser);
  });

  test("a signed-out visitor joins, signs up and comes back as a member", async ({
    page,
    context,
  }) => {
    const pageErrors = collectErrors(page);
    const cdp = await context.newCDPSession(page);
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

    await openCommunity(page);
    const join = page.getByTestId("node-page.join");
    await expect(join).toHaveText(`Join ${name}`);
    await expect(page.getByTestId("node-page.join-at-event")).toHaveCount(0);
    await join.click();

    await expect(page).toHaveURL(/\/login\?/, { timeout: 15000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe(`/join?place=${slug}`);
    await page.getByTestId("login.create-account-link").click();
    await page.getByTestId("login.create-account-button").click();

    await expect(page).toHaveURL(new RegExp(`${communityPath}$`), { timeout: 30000 });
    await expect(page.getByTestId("node-page.joined")).toHaveText(`You've joined ${name}`, {
      timeout: 15000,
    });
    await expect(page.getByTestId("node-page.join")).toHaveCount(0);
    await expect(page.getByTestId("node-page.open-community")).toBeVisible({ timeout: 15000 });
    expect(await organizationSlugs(page)).toContain(slug);

    await openCommunity(page);
    await expect(page.getByTestId("node-page.joined")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("node-page.join")).toHaveCount(0);
    expectNoHydrationFailure(pageErrors);
  });

  test("a signed-in visitor joins from the page and is told they have joined", async ({ page }) => {
    const pageErrors = collectErrors(page);
    await useCookieHeader(page.context(), await signInAnonymously());
    await openCommunity(page);
    await expect(page.getByTestId("node-page.joined")).toHaveCount(0);
    expect(await organizationSlugs(page)).not.toContain(slug);

    await page.getByTestId("node-page.join").click();

    await expect(page).toHaveURL(new RegExp(`${communityPath}$`), { timeout: 30000 });
    await expect(page.getByTestId("node-page.joined")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("node-page.join")).toHaveCount(0);
    expect(await organizationSlugs(page)).toContain(slug);
    expectNoHydrationFailure(pageErrors);
  });

  test("a failed join is explained in the page's language", async ({ page }) => {
    await useCookieHeader(page.context(), await signInAnonymously());
    await page.context().addCookies([{ name: "citynode_locale", value: "es", url: baseUrl }]);
    await page.route(/joinCommunity/, (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          json: { defined: false, code: "CONFLICT", message: "raw upstream detail" },
        }),
      }),
    );

    await openCommunity(page);
    const join = page.getByTestId("node-page.join");
    await expect(join).toHaveText(`Unirse a ${name}`);
    await join.click();

    await expect(page.getByTestId("join.error")).toContainText(
      "No puedes unirte a esta comunidad ahora.",
      { timeout: 30000 },
    );
    await expect(page.locator("body")).not.toContainText("raw upstream detail");
    await page.getByTestId("join.back").click();
    await expect(page.getByTestId("node-page.join")).toBeVisible({ timeout: 15000 });
  });
});
