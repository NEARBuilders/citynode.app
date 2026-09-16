import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect as browserExpect, chromium } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, expect, it, vi } from "vitest";
import {
  authedContext,
  daoContext,
  getPluginClient,
  getTestRpcUrl,
  orgContext,
  teardown,
} from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(async () => ({
    isSputnikContract: true,
    isMember: true,
    policy: { roles: [] },
  })),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));
vi.mock("../../plugin.dev", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../plugin.dev")>();
  return {
    default: {
      ...original.default,
      config: {
        ...original.default.config,
        secrets: { ...original.default.config.secrets, LUMA_CALENDAR_API_KEYS: "fixture-key" },
      },
    },
  };
});
let vite: ViteDevServer | undefined;
afterAll(async () => {
  await vite?.close();
  await teardown();
  vi.unstubAllGlobals();
});
it("publishes a profile and explores a real map with synchronized accessible selection", async () => {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== "https://public-api.luma.com") return realFetch(input, init);
    return Response.json(
      url.pathname === "/v1/calendars/get"
        ? { id: "cal-browser", name: "Community Luma", url: "https://luma.com/community" }
        : {
            entries: [
              {
                id: "evt-browser",
                platform: "luma",
                name: "Luma community meetup",
                url: "https://luma.com/community-meetup",
                start_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
                end_at: new Date(Date.now() + 3 * 86400_000 + 7200_000).toISOString(),
                created_at: new Date(Date.now() - 86400_000).toISOString(),
                timezone: "UTC",
                visibility: "public",
                location_visibility: "guests-only",
              },
            ],
            has_more: false,
          },
    );
  });
  let context = orgContext("map-owner", "map-org");
  const api = await getPluginClient(daoContext("map-owner", "map-org", "map-fixture.near"));
  const tenant = await api.createTenant({ name: "Map fixture", accountId: "map-fixture.near" });
  const node = await api.createNode({
    name: "Karachi",
    slug: "map-karachi",
    kind: "city",
    tenantId: tenant.id,
  });
  const workspace = path.resolve(import.meta.dirname, "../../..");
  vite = await createServer({
    configFile: false,
    css: { postcss: { plugins: [tailwind({ base: workspace })] } },
    root: path.join(workspace, "tests/discovery-browser"),
    resolve: { alias: { "@": path.join(workspace, "ui/src") }, dedupe: ["react", "react-dom"] },
    esbuild: { jsx: "automatic" },
    server: {
      watch: null,
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [workspace] },
      proxy: {
        "/api/rpc": {
          target: getTestRpcUrl(),
          rewrite: (p) => p.replace("/api/rpc", "/rpc"),
          configure: (proxy) =>
            proxy.on("proxyReq", (req) => req.setHeader("x-test-context", JSON.stringify(context))),
        },
      },
    },
  });
  await vite.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5z8AAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    const base = vite.resolvedUrls!.local[0]!;
    await page.goto(`${base}?editor=${node.id}`);
    await page.getByLabel("Community summary").fill("A community by the sea");
    await page.getByLabel("Location", { exact: true }).fill("Karachi");
    await page.getByLabel("Region", { exact: true }).fill("Pakistan");
    await page.getByLabel("Latitude").fill("24.86");
    await page.getByLabel("Longitude").fill("67.01");
    await page.getByLabel("Publish in discovery").check();
    await page.getByTestId("discovery-profile-save").click();
    await browserExpect(page.getByRole("status")).toHaveText("Discovery profile saved.");
    await page.getByTestId("discovery-luma-import").click();
    await browserExpect(page.getByRole("status").filter({ hasText: "1 imported" })).toBeVisible();
    const imported = (await api.listDiscoveryActivities({ nodeId: node.id })).find(
      (activity) => activity.luma,
    )!;
    await page.getByTestId(`discovery-edit-activity-${imported.id}`).click();
    await browserExpect(page.getByLabel("Title", { exact: true })).toHaveAttribute("readonly", "");
    await page.getByLabel("Publication status").selectOption("published");
    await page.getByTestId("discovery-activity-save").click();
    await browserExpect(page.getByText("Activity saved.", { exact: true })).toBeVisible();
    await page.getByTestId("discovery-new-event").click();
    await page.getByLabel("Title", { exact: true }).fill("Builders meetup");
    await page.getByLabel("Source / organizer").fill("Karachi community");
    await page.getByLabel("Original URL").fill("https://example.com/meetup");
    await page
      .getByLabel("Starts", { exact: true })
      .fill(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16));
    await page
      .getByLabel("Ends", { exact: true })
      .fill(new Date(Date.now() + 7 * 86400_000 + 7200_000).toISOString().slice(0, 16));
    await page.getByLabel("Venue or online meeting location").fill("Online");
    await page.getByLabel("Publication status").selectOption("published");
    await page.getByTestId("discovery-activity-save").click();
    await browserExpect(page.getByText("Activity saved.", { exact: true })).toBeVisible();
    await page.getByTestId("discovery-new-social").click();
    await page.getByLabel("Title", { exact: true }).fill("Community launch");
    await page.getByLabel("Source / organizer").fill("Official community");
    await page.getByLabel("Original URL").fill("https://example.com/launch");
    await page.getByLabel("Publication status").selectOption("published");
    await page.getByTestId("discovery-activity-save").click();
    await browserExpect(page.getByText("Activity saved.", { exact: true })).toBeVisible();
    await page.goto(base);
    await browserExpect(page.locator(".leaflet-container")).toBeVisible();
    await page.getByTestId(`discovery-map-marker-${node.id}`).click();
    await browserExpect(page.getByRole("dialog")).toContainText("A community by the sea");
    await browserExpect(page.locator('a[href="https://example.com/meetup"]')).toHaveAttribute(
      "href",
      "https://example.com/meetup",
    );
    await browserExpect(page.getByRole("link", { name: "Read original post" })).toHaveAttribute(
      "href",
      "https://example.com/launch",
    );
    await browserExpect(
      page.getByTestId(`discovery-activity-outbound-${imported.id}`),
    ).toHaveAttribute("href", "https://luma.com/community-meetup");
    expect(new URL(page.url()).searchParams.get("node")).toBe(node.id);
    await page.keyboard.press("Escape");
    await page.getByLabel("Search nodes").fill("No match");
    await browserExpect(page.getByText("No nodes match these filters.")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}?node=${node.id}`);
    await browserExpect(page.getByRole("dialog")).toContainText("Karachi");
    await page.keyboard.press("Escape");
    await page.unroute("https://tile.openstreetmap.org/**");
    await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
    await page.reload();
    await browserExpect(
      page.getByText("Map tiles are unavailable. Use the node list below."),
    ).toBeVisible();
    await browserExpect(page.getByRole("region", { name: "Node list" })).toContainText("Karachi");
    context = {};
    await page.goto(`${base}?campaign=community-week`);
    await page.getByTestId("discovery-measurement-toggle").click();
    await page.getByTestId(`discovery-node-${node.id}`).click();
    const tracked = page.waitForResponse(
      async (response) =>
        response.url().includes("trackDiscovery") &&
        (response.request().postData() ?? "").includes('"event"'),
    );
    const event = (await api.listDiscoveryActivities({ nodeId: node.id })).find(
      (a) => a.url === "https://example.com/meetup",
    )!;
    await page.getByTestId(`discovery-activity-detail-${event.id}`).click();
    expect(new URL(page.url()).searchParams.get("campaign")).toBe("community-week");
    await page.getByTestId(`discovery-activity-outbound-${event.id}`).click();
    await tracked;
    context = authedContext("map-admin", "admin");
    await page.goto(`${base}?studio=true`);
    await browserExpect(page.getByText("1 visits · 1 activated visits")).toBeVisible();
    await page.getByLabel("Feature label").fill("Community week");
    await page
      .getByLabel("Feature expires (your local time)")
      .fill(new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 16));
    await page.getByTestId(`discovery-feature-${node.id}`).click();
    await browserExpect(page.getByText("Featured: Community week")).toBeVisible();
    await page.goto(`${base}?node=${node.id}`);
    await page.getByTestId(`discovery-report-${node.id}`).click();
    await page
      .getByLabel("Reason", { exact: true })
      .first()
      .fill("Incorrect official community information");
    await page.getByTestId(`discovery-report-submit-${node.id}`).click();
    await browserExpect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.goto(`${base}?studio=true`);
    await page.getByLabel("Private moderation note").fill("Verified incorrect information");
    await page.getByLabel("Moderation action", { exact: true }).selectOption("unpublish");
    await page.locator("[data-testid^=discovery-resolve-report-]").click();
    await browserExpect(page.getByText("Resolved: Verified incorrect information")).toBeVisible();
    await page.goto(`${base}?node=${node.id}`);
    await browserExpect(page.getByText("This node is unavailable.")).toBeVisible();
    const measurements = [];
    for (let index = 1; index <= 200; index++) {
      const sample = await api.createNode({
        name: `Benchmark node ${index}`,
        slug: `benchmark-${index}`,
        kind: "city",
        tenantId: tenant.id,
      });
      await api.saveDiscoveryProfile({
        nodeId: sample.id,
        summary: "Synthetic performance fixture",
        location: index % 2 ? "Karachi" : "Chicago",
        region: "Benchmark",
        latitude: index % 2 ? 24.86 : 41.88,
        longitude: index % 2 ? 67.01 : -87.63,
        channels: [],
        published: true,
      });
      if (index === 10 || index === 200) {
        const start = performance.now();
        const results = await api.listDiscovery({ region: "Benchmark" });
        const apiMs = performance.now() - start;
        expect(results).toHaveLength(index);
        await page.setViewportSize({ width: 1280, height: 900 });
        const browserStart = performance.now();
        await page.goto(`${base}?region=Benchmark`);
        await browserExpect(
          page.getByRole("region", { name: "Node list" }).getByRole("button"),
        ).toHaveCount(index);
        await browserExpect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
        measurements.push({
          nodes: index,
          apiMs: Math.round(apiMs),
          browserReadyMs: Math.round(performance.now() - browserStart),
        });
      }
    }
    await writeFile(
      "/tmp/discovery-performance.json",
      JSON.stringify(
        {
          environment: "Local PGlite, Chromium, Vite development build, deterministic tile failure",
          measurements,
        },
        null,
        2,
      ),
    );
    if (process.env.DISCOVERY_VISUAL_CHECK === "1") {
      await page.unroute("https://tile.openstreetmap.org/**");
      await page.reload();
      await browserExpect(page.locator(".leaflet-tile-loaded").first()).toBeVisible({
        timeout: 15000,
      });
    }
    await page.screenshot({ path: "/tmp/discovery-map-desktop.png", animations: "disabled" });
    await page.locator(".leaflet-marker-icon").first().click();
    await browserExpect(page.locator(".leaflet-popup-content button").first()).toBeVisible();
    await page.locator(".leaflet-popup-content button").first().focus();
    await page.keyboard.press("Enter");
    await browserExpect(page.getByRole("dialog")).toContainText("Synthetic performance fixture");
    await page.keyboard.press("Escape");
    await browserExpect(page.locator(".leaflet-marker-icon:focus")).toHaveCount(1);
    await page.getByRole("region", { name: "Node list" }).getByRole("button").first().click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/discovery-map-mobile.png", animations: "disabled" });
    await page.route("**/geographic-map.tsx*", (route) => route.abort());
    await page.goto(`${base}?region=Benchmark`);
    await browserExpect(
      page.getByText("Map is unavailable. Use the node list below."),
    ).toBeVisible();
    await browserExpect(
      page.getByRole("region", { name: "Node list" }).getByRole("button"),
    ).toHaveCount(200);
  } finally {
    await browser.close();
  }
}, 180_000);
