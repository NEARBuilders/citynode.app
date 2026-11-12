import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { toPlaywrightCookies } from "../tests/regression/lib/playwright-cookies.mjs";
import { readDotEnv } from "../tests/regression/lib/regression-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fileEnv = readDotEnv(root);

function flag(name, fallback) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const outDir = path.resolve(flag("--out", path.join(root, ".bos", "screens")));
const label = flag("--label", "capture");
const baseUrl = flag(
  "--base-url",
  process.env.BASE_URL || fileEnv.BASE_URL || "http://localhost:3000",
);
const seedFile = path.resolve(flag("--seed", path.join(root, ".bos", "demo", "seed.json")));
const only = flag("--only", "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const lagosEvent = (key) => (seed) => {
  const lagos = seed.communities.lagos;
  const event = lagos.events.find((candidate) => candidate.key === key);
  return `/nodes/${lagos.nodeId}/events/${event.id}/report`;
};

export const SHOTS = [
  { persona: "platformAdmin", page: "home", path: "/dashboard" },
  { persona: "platformAdmin", page: "admin-overview", path: "/admin" },
  { persona: "platformAdmin", page: "admin-communities", path: "/admin/nodes" },
  { persona: "platformAdmin", page: "sidebar", path: "/admin/nodes", sidebar: true },
  { persona: "ownerMature", page: "home", path: "/dashboard" },
  { persona: "ownerMature", page: "my-community", path: "/dashboard/node" },
  { persona: "ownerMature", page: "event-report", path: lagosEvent("payments-hack") },
  { persona: "ownerMature", page: "sidebar", path: "/dashboard", sidebar: true },
  { persona: "organizer", page: "home", path: "/dashboard" },
  { persona: "organizer", page: "my-community", path: "/dashboard/node" },
  { persona: "organizer", page: "sidebar", path: "/dashboard", sidebar: true },
  { persona: "member", page: "home", path: "/dashboard" },
  { persona: "member", page: "sidebar", path: "/dashboard", sidebar: true },
  { persona: "noCommunity", page: "home", path: "/dashboard" },
  { persona: "noCommunity", page: "sidebar", path: "/dashboard", sidebar: true },
  { persona: "twoCommunities", page: "home", path: "/dashboard" },
  { persona: "twoCommunities", page: "community-switcher", path: "/dashboard", switcher: true },
];

const kebab = (value) => value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page
    .locator('[data-slot="skeleton"], .animate-pulse')
    .first()
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
}

async function growToContent(page, viewport) {
  const size = VIEWPORTS[viewport];
  for (let attempt = 0; attempt < 3; attempt++) {
    const overflow = await page.evaluate(() =>
      Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        ...[...document.querySelectorAll("*")]
          .filter((element) => /(auto|scroll)/.test(getComputedStyle(element).overflowY))
          .map((element) => element.scrollHeight - element.clientHeight),
      ),
    );
    if (overflow <= 4) return;
    const current = page.viewportSize() ?? size;
    await page.setViewportSize({
      width: size.width,
      height: Math.min(current.height + overflow, 16_000),
    });
    await page.waitForTimeout(400);
  }
}

async function openSidebar(page, viewport) {
  if (viewport === "mobile") {
    await page.locator('[data-sidebar="trigger"]').first().click();
    await page.locator('[data-mobile="true"]').first().waitFor({ timeout: 5_000 });
  }
  const toggles = page.locator('[data-testid^="sidebar-nav-"][data-testid$="-toggle"]');
  for (let index = 0; index < (await toggles.count()); index++) {
    const toggle = toggles.nth(index);
    if ((await toggle.getAttribute("aria-expanded")) === "false" && (await toggle.isVisible())) {
      await toggle.click();
    }
  }
  await page.waitForTimeout(500);
}

async function openSwitcher(page, viewport) {
  const switcher = page.getByTestId("org-switcher").first();
  if (viewport === "mobile" && !(await switcher.isVisible())) {
    await page.locator('[data-sidebar="trigger"]').first().click();
  }
  await switcher.click();
  await page.getByRole("menuitem").first().waitFor({ timeout: 5_000 });
  await page.waitForTimeout(300);
}

async function capture(browser, seed, shot, viewport) {
  const person = seed.personas[shot.persona];
  const name = `${kebab(shot.persona)}--${shot.page}--${viewport}.png`;
  if (!person) return { name, status: `skipped: persona ${shot.persona} not in seed` };
  const target = typeof shot.path === "function" ? shot.path(seed) : shot.path;
  const home = Object.values(seed.communities).find(
    (community) => community.organizationId === person.activeOrganizationId,
  );
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    baseURL: baseUrl,
    locale: "en-US",
    timezoneId: home?.timezone ?? "UTC",
  });
  try {
    await context.addCookies(toPlaywrightCookies(person.cookies, baseUrl));
    const page = await context.newPage();
    const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (response && response.status() === 404) return { name, status: `skipped: ${target} is 404` };
    await settle(page);
    if (shot.sidebar) await openSidebar(page, viewport);
    if (shot.switcher) await openSwitcher(page, viewport);
    if (!shot.sidebar && !shot.switcher) await growToContent(page, viewport);
    await page.screenshot({ path: path.join(outDir, name) });
    const landed = new URL(page.url()).pathname;
    return { name, status: landed === target.split("?")[0] ? "ok" : `ok (landed on ${landed})` };
  } catch (error) {
    return {
      name,
      status: `failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`,
    };
  } finally {
    await context.close();
  }
}

if (!fs.existsSync(seedFile)) {
  console.error(`[capture] ${seedFile} is missing — run pnpm run seed:demo first`);
  process.exit(1);
}
const seed = JSON.parse(fs.readFileSync(seedFile, "utf-8"));
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const results = [];
for (const shot of SHOTS) {
  if (only.length > 0 && !only.includes(shot.persona) && !only.includes(shot.page)) continue;
  for (const viewport of Object.keys(VIEWPORTS)) {
    const result = await capture(browser, seed, shot, viewport);
    results.push(result);
    console.log(`[capture:${label}] ${result.name} ${result.status}`);
  }
}
await browser.close();

fs.writeFileSync(
  path.join(outDir, `${label}.json`),
  `${JSON.stringify({ label, baseUrl, seedDate: seed.today, capturedAt: new Date().toISOString(), results }, null, 2)}\n`,
);
const failed = results.filter((result) => result.status.startsWith("failed"));
console.log(
  `[capture:${label}] ${results.length - failed.length}/${results.length} captured in ${outDir}`,
);
