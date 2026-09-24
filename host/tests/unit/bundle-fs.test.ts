import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { createBundleFsHandler } from "../../src/routes/bundles";

type HonoEnv = { Variables: Record<string, never> };

const root = mkdtempSync(join(tmpdir(), "bundle-fs-"));
// BOS_BUNDLE_DIR is the root CONTAINING bundles/<account>/<gateway>/…
const bundleDir = join(root, "bundles");
const staged = join(bundleDir, "v1.citynode.near", "citynode.app");
for (const dir of [join(staged, "ui"), join(staged, "ui", "static", "js", "async")]) {
  mkdirSync(dir, { recursive: true });
}
writeFileSync(join(staged, "ui", "remoteEntry.js"), "console.log('entry')");
writeFileSync(join(staged, "ui", "index.html"), "<html>shell</html>");
writeFileSync(join(staged, "ui", "static", "js", "async", "a.1234abcd5678ef90.js"), "export {}");

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function appWith(dir?: string) {
  const app = new Hono<HonoEnv>();
  app.all("/bundles/*", createBundleFsHandler(dir));
  return app;
}

describe("bundle FS handler", () => {
  it("serves staged artifacts with content types and immutable cache for hashed chunks", async () => {
    const res = await appWith(bundleDir).request(
      "/bundles/v1.citynode.near/citynode.app/ui/static/js/async/a.1234abcd5678ef90.js",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(await res.text()).toBe("export {}");
  });

  it("serves entrypoints with must-revalidate", async () => {
    const res = await appWith(bundleDir).request(
      "/bundles/v1.citynode.near/citynode.app/ui/remoteEntry.js",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("must-revalidate");
  });

  it("serves the html shell as text/html", async () => {
    const res = await appWith(bundleDir).request(
      "/bundles/v1.citynode.near/citynode.app/ui/index.html",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("404s missing artifacts", async () => {
    const res = await appWith(bundleDir).request(
      "/bundles/v1.citynode.near/citynode.app/ui/nope.js",
    );
    expect(res.status).toBe(404);
  });

  it("never serves files outside the bundle root", async () => {
    // URL-normalized ../ collapses before the route; the encoded form either
    // stays literal (ENOENT) or hits the containment guard — either way the
    // package.json outside must never be served
    for (const attempt of [
      "/bundles/v1.citynode.near/citynode.app/ui/../../../package.json",
      "/bundles/v1.citynode.near/citynode.app/ui/%2e%2e/%2e%2e/%2e%2e/package.json",
    ]) {
      const res = await appWith(bundleDir).request(attempt);
      expect(res.status).not.toBe(200);
      expect(await res.text()).not.toContain('"name"');
    }
  });

  it("falls through when BOS_BUNDLE_DIR is unset (dev stacks)", async () => {
    const app = new Hono<HonoEnv>();
    let fellThrough = false;
    app.all("/bundles/*", createBundleFsHandler(undefined));
    app.all("/bundles/*", () => {
      fellThrough = true;
      return new Response("fallback");
    });
    await app.request("/bundles/v1.citynode.near/citynode.app/ui/remoteEntry.js");
    expect(fellThrough).toBe(true);
  });
});
