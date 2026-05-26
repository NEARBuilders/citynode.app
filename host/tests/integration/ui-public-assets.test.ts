import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runServer } from "../../src/program";
import type { RuntimeConfig } from "../../src/services/config";
import { startJsonProxyTarget } from "../helpers/json-proxy-target";
import { getAvailablePort } from "../helpers/ports";
import { startStaticDistServer } from "../helpers/static-dist-server";
import { loadHostTestEnv } from "../helpers/test-env";

const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const uiPublicDir = path.join(workspaceRoot, "ui", "public");
const uiDistDir = path.join(workspaceRoot, "ui", "dist");

loadHostTestEnv(workspaceRoot);

function buildUiRemoteConfig(
  uiAssetsUrl: string,
  apiProxyUrl: string,
  hostUrl: string,
): RuntimeConfig {
  return {
    env: "development",
    account: "dev.everything.near",
    title: "everything.dev",
    repository: "https://github.com/nearbuilders/everything-dev",
    host: {
      name: "host",
      url: hostUrl,
      entry: `${hostUrl}/mf-manifest.json`,
      source: "remote",
    },
    ui: {
      name: "ui",
      url: uiAssetsUrl,
      entry: `${uiAssetsUrl}/mf-manifest.json`,
      source: "remote",
    },
    api: {
      name: "api",
      url: apiProxyUrl,
      entry: `${apiProxyUrl}/mf-manifest.json`,
      source: "remote",
      proxy: apiProxyUrl,
    },
  } as RuntimeConfig;
}

describe("UI public asset redirect (Cloudflare Error 1000 regression)", () => {
  let uiServer: Awaited<ReturnType<typeof startStaticDistServer>>;
  let apiProxy: Awaited<ReturnType<typeof startJsonProxyTarget>>;
  let hostHandle: ReturnType<typeof runServer>;
  let baseUrl: string;
  let uiBaseUrl: string;
  const envSnapshot = { ...process.env };

  beforeAll(async () => {
    if (!existsSync(uiPublicDir)) {
      throw new Error(`ui/public/ not found at ${uiPublicDir} — run UI build first`);
    }

    uiServer = await startStaticDistServer(uiDistDir);
    apiProxy = await startJsonProxyTarget();

    const hostPort = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${hostPort}`;
    uiBaseUrl = uiServer.baseUrl;
    process.env.NODE_ENV = "development";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = String(hostPort);
    process.env.CSP_STRICT = "false";

    const config = buildUiRemoteConfig(uiServer.baseUrl, apiProxy.baseUrl, baseUrl);
    hostHandle = runServer({ config });
    await hostHandle.ready;
  }, 30000);

  afterAll(async () => {
    await hostHandle?.shutdown();
    await uiServer?.stop();
    await apiProxy?.stop();
    process.env = { ...envSnapshot };
  });

  describe("UI assets redirect to remote URL instead of proxying", () => {
    it("redirects /favicon.ico to the UI origin with 302", async () => {
      const response = await fetch(`${baseUrl}/favicon.ico`, { redirect: "manual" });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBe(`${uiBaseUrl}/favicon.ico`);
    });

    it("redirects /icon.svg to the UI origin with 302", async () => {
      const response = await fetch(`${baseUrl}/icon.svg`, { redirect: "manual" });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBe(`${uiBaseUrl}/icon.svg`);
    });

    it("redirects /skill.md to the UI origin with 302", async () => {
      const response = await fetch(`${baseUrl}/skill.md`, { redirect: "manual" });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBe(`${uiBaseUrl}/skill.md`);
    });

    it("redirects /robots.txt to the UI origin with 302", async () => {
      const response = await fetch(`${baseUrl}/robots.txt`, { redirect: "manual" });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBe(`${uiBaseUrl}/robots.txt`);
    });

    it("redirects /static/css/async/style.css to the UI origin", async () => {
      const response = await fetch(`${baseUrl}/static/css/async/style.css`, { redirect: "manual" });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBe(`${uiBaseUrl}/static/css/async/style.css`);
    });

    it("redirects a static/image path to the UI origin", async () => {
      const testPath = "/static/image/built_on.2920b568.png";
      const response = await fetch(`${baseUrl}${testPath}`, { redirect: "manual" });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBe(`${uiBaseUrl}${testPath}`);
    });

    it("redirect preserves query strings", async () => {
      const response = await fetch(`${baseUrl}/icon.svg?v=123`, { redirect: "manual" });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBe(`${uiBaseUrl}/icon.svg?v=123`);
    });

    it("following the redirect serves the actual asset", async () => {
      const response = await fetch(`${baseUrl}/favicon.ico`, { redirect: "follow" });

      expect(response.status).toBe(200);
      const buf = await response.arrayBuffer();
      expect(buf.byteLength).toBeGreaterThan(0);
    });
  });

  describe("non-asset paths are not redirected", () => {
    it("/ (root) renders client shell, not redirected", async () => {
      const response = await fetch(`${baseUrl}/`, { redirect: "manual" });

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("window.__RUNTIME_CONFIG__");
      expect(html).toContain("remoteEntry.js");
    });

    it("/health is handled by host directly", async () => {
      const response = await fetch(`${baseUrl}/health`);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("OK");
    });

    it("/api/ping is routed to API proxy, not redirected", async () => {
      const response = await fetch(`${baseUrl}/api/ping`, { redirect: "manual" });
      const json = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(json).toMatchObject({ status: "ok" });
    });

    it("paths without file extensions are not redirected", async () => {
      const response = await fetch(`${baseUrl}/nonexistent-page`, { redirect: "manual" });

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("window.__RUNTIME_CONFIG__");
    });
  });

  describe("missing UI assets return 404 from redirect target", () => {
    it("follows redirect to a nonexistent asset, returns 404", async () => {
      const response = await fetch(`${baseUrl}/nonexistent-file.css`, { redirect: "follow" });

      expect(response.status).toBe(404);
    });
  });
});
