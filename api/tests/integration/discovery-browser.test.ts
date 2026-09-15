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
let vite: ViteDevServer | undefined;
afterAll(async () => {
  await vite?.close();
  await teardown();
});
it("publishes a profile and explores a real map with synchronized accessible selection", async () => {
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
    await page.getByRole("button", { name: "Save discovery profile" }).click();
    await browserExpect(page.getByRole("status")).toHaveText("Discovery profile saved.");
    await page.getByRole("button", { name: "New event", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Builders meetup");
    await page.getByLabel("Source / organizer").fill("Karachi community");
    await page.getByLabel("Original URL").fill("https://example.com/meetup");
    await page.getByLabel("Starts", { exact: true }).fill("2027-01-01T12:00");
    await page.getByLabel("Ends", { exact: true }).fill("2027-01-01T14:00");
    await page.getByLabel("Venue or online meeting location").fill("Online");
    await page.getByLabel("Publication status").selectOption("published");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await browserExpect(page.getByText("Activity saved.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "New social update" }).click();
    await page.getByLabel("Title", { exact: true }).fill("Community launch");
    await page.getByLabel("Source / organizer").fill("Official community");
    await page.getByLabel("Original URL").fill("https://example.com/launch");
    await page.getByLabel("Publication status").selectOption("published");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await browserExpect(page.getByText("Activity saved.", { exact: true })).toBeVisible();
    await page.goto(base);
    await browserExpect(page.locator(".leaflet-container")).toBeVisible();
    await page.getByRole("button", { name: "Karachi (city)", exact: true }).click();
    await browserExpect(page.getByRole("dialog")).toContainText("A community by the sea");
    await browserExpect(
      page.getByRole("link", { name: "Event details / registration" }),
    ).toHaveAttribute("href", "https://example.com/meetup");
    await browserExpect(page.getByRole("link", { name: "Read original post" })).toHaveAttribute(
      "href",
      "https://example.com/launch",
    );
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
    await page.getByRole("button", { name: "Allow measurement" }).click();
    await page.getByRole("region", { name: "Node list" }).getByRole("button").first().click();
    const tracked = page.waitForResponse(
      async (response) =>
        response.url().includes("trackDiscovery") &&
        (response.request().postData() ?? "").includes('"event"'),
    );
    await page.getByRole("link", { name: "Event details / registration" }).click();
    await tracked;
    context = authedContext("map-admin", "admin");
    await page.goto(`${base}?studio=true`);
    await browserExpect(page.getByText("1 visits · 1 activated visits")).toBeVisible();
    await page.getByLabel("Feature label").fill("Community week");
    await page.getByLabel("Feature expires (your local time)").fill("2026-10-01T12:00");
    await page.getByRole("button", { name: "Feature Karachi", exact: true }).click();
    await browserExpect(page.getByText("Featured: Community week")).toBeVisible();
    await page.goto(`${base}?node=${node.id}`);
    await page.getByText("Report this node", { exact: true }).click();
    await page
      .getByLabel("Reason", { exact: true })
      .first()
      .fill("Incorrect official community information");
    await page.getByRole("button", { name: "Submit report", exact: true }).first().click();
    await browserExpect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.goto(`${base}?studio=true`);
    await page.getByLabel("Private moderation note").fill("Verified incorrect information");
    await page.getByLabel("Moderation action", { exact: true }).selectOption("unpublish");
    await page.getByRole("button", { name: "Resolve report" }).click();
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
    await page.locator(".leaflet-popup-content button").first().click();
    await browserExpect(page.getByRole("dialog")).toContainText("Synthetic performance fixture");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/discovery-map-mobile.png", animations: "disabled" });
  } finally {
    await browser.close();
  }
}, 180_000);
