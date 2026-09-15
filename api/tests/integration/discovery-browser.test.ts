import path from "node:path";
import { expect as browserExpect, chromium } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, expect, it, vi } from "vitest";
import { daoContext, getPluginClient, getTestRpcUrl, orgContext, teardown } from "../setup";

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
  const context = orgContext("map-owner", "map-org");
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
  } finally {
    await browser.close();
  }
}, 120_000);
