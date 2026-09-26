import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import {
  createBundleProxyCacheHandler,
  deriveNamespaceOrigins,
} from "../../src/routes/bundles-proxy";
import type { RuntimeConfig } from "../../src/services/config";

type HonoEnv = { Variables: Record<string, never> };

const cacheRoot = mkdtempSync(join(tmpdir(), "bundle-proxy-cache-"));
const FOREIGN = "https://base.everything.near/bundles/base.near/everything.dev/auth";

function configWith(overrides?: Partial<RuntimeConfig>): RuntimeConfig {
  return {
    domain: "child.dev",
    host: {
      name: "host",
      url: "http://localhost:4100",
      entry: "/mf-manifest.json",
      source: "remote",
      remoteUrl: "http://localhost:4100",
    },
    api: { name: "api", url: `${FOREIGN}/`, entry: "/mf-manifest.json", source: "remote" },
    ui: {
      name: "ui",
      url: "https://child.dev/bundles/child.near/child.dev/ui/",
      entry: "/mf-manifest.json",
      source: "remote",
    },
    ...overrides,
  } as RuntimeConfig;
}

afterAll(() => {
  rmSync(cacheRoot, { recursive: true, force: true });
});

function appWith(config: RuntimeConfig, cacheDir = cacheRoot) {
  const app = new Hono<HonoEnv>();
  app.all(
    "/bundles/*",
    createBundleProxyCacheHandler({
      namespaceOrigins: deriveNamespaceOrigins(config),
      cacheDir,
    }),
  );
  return app;
}

describe("deriveNamespaceOrigins", () => {
  it("maps foreign bundle namespaces to their origins and skips the own domain", () => {
    const origins = deriveNamespaceOrigins(configWith());
    expect(origins.get("base.near/everything.dev")).toBe("https://base.everything.near");
    expect(origins.has("child.near/child.dev")).toBe(false);
  });

  it("maps host remoteUrl and plugin urls", () => {
    const origins = deriveNamespaceOrigins(
      configWith({
        host: {
          name: "host",
          url: "http://localhost:4100",
          entry: "/mf-manifest.json",
          source: "remote",
          remoteUrl: "https://base.everything.near/bundles/base.near/everything.dev/host/",
        },
        plugins: {
          votes: {
            name: "votes",
            url: "https://other.origin/bundles/other.near/other.dev/votes/",
            entry: "/mf-manifest.json",
            source: "remote",
          },
        },
      }),
    );
    expect(origins.get("base.near/everything.dev")).toBe("https://base.everything.near");
    expect(origins.get("other.near/other.dev")).toBe("https://other.origin");
  });
});

describe("createBundleProxyCacheHandler", () => {
  it("proxies a foreign namespace and writes through to the cache", async () => {
    let originUp = true;
    const origin = createServer((_req, res) => {
      if (!originUp) {
        res.statusCode = 502;
        res.end("down");
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end("manifest-bytes");
    });
    origin.listen(0, "127.0.0.1");
    await new Promise((resolve) => origin.once("listening", resolve));
    const port = (origin.address() as { port: number }).port;
    try {
      const config = configWith({
        api: {
          name: "api",
          url: `http://127.0.0.1:${port}/bundles/base.near/everything.dev/auth/`,
          entry: "/mf-manifest.json",
          source: "remote",
        },
      });
      const app = appWith(config);
      const url = `/bundles/base.near/everything.dev/auth/plugin.manifest.json`;
      const fresh = await app.request(url);
      expect(fresh.status).toBe(200);
      expect(await fresh.text()).toBe("manifest-bytes");

      originUp = false;
      const stale = await app.request(url);
      expect(stale.status).toBe(200);
      expect(stale.headers.get("x-bundle-cache")).toBe("stale");
      expect(await stale.text()).toBe("manifest-bytes");

      const cachedFile = join(
        cacheRoot,
        "base.near",
        "everything.dev",
        "auth",
        "plugin.manifest.json",
      );
      expect(readFileSync(cachedFile, "utf8")).toBe("manifest-bytes");
    } finally {
      origin.close();
    }
  });

  it("returns 502 when the origin fails and nothing is cached", async () => {
    const app = appWith(configWith());
    const res = await app.request("/bundles/base.near/everything.dev/auth/never-cached.js");
    expect(res.status).toBe(502);
  });

  it("falls through for non-bundles paths and unknown namespaces", async () => {
    let reachedNext = false;
    const app = new Hono<HonoEnv>();
    app.all(
      "/bundles/*",
      createBundleProxyCacheHandler({
        namespaceOrigins: deriveNamespaceOrigins(configWith()),
        cacheDir: cacheRoot,
      }),
    );
    app.all("*", () => {
      reachedNext = true;
      return new Response("next-handler", { status: 200 });
    });

    expect((await app.request("/api/rpc/auth/getSession")).status).toBe(200);
    expect(reachedNext).toBe(true);

    expect((await app.request("/bundles/unknown.near/unknown.dev/auth/x.js")).status).toBe(200);
    expect(reachedNext).toBe(true);
  });
});
