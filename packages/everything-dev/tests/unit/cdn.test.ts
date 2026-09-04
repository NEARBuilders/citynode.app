import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectDistFiles,
  computeCloudflareDeployEntries,
  deployEntrySpecs,
  generateAlchemyRun,
  hashDistDir,
  objectMetadataFor,
} from "../../src/cdn";
import { resolveDeployConfig } from "../../src/config";
import { BosConfigSchema } from "../../src/types";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeDist(files: Record<string, string>): string {
  const distDir = mkdtempSync(join(tmpdir(), "bos-cdn-"));
  tempDirs.push(distDir);
  for (const [key, content] of Object.entries(files)) {
    const fullPath = join(distDir, key);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return distDir;
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return BosConfigSchema.parse({
    account: "v1.citynode.near",
    domain: "citynode.app",
    app: {
      host: { development: "local:host", production: "https://host.example.com" },
      ui: { development: "local:ui", production: "https://ui.example.com" },
      api: { development: "local:api", production: "https://api.example.com" },
    },
    ...overrides,
  });
}

describe("deployEntrySpecs", () => {
  it("maps app workspaces to their config fields", () => {
    expect(deployEntrySpecs("host")).toEqual([
      {
        file: "remoteEntry.js",
        urlField: "app.host.production",
        integrityField: "app.host.integrity",
      },
    ]);
    expect(deployEntrySpecs("api")).toEqual([
      {
        file: "remoteEntry.js",
        urlField: "app.api.production",
        integrityField: "app.api.integrity",
      },
    ]);
    expect(deployEntrySpecs("auth")).toEqual([
      {
        file: "remoteEntry.js",
        urlField: "app.auth.production",
        integrityField: "app.auth.integrity",
      },
    ]);
  });

  it("maps ui to both client and ssr entries", () => {
    expect(deployEntrySpecs("ui")).toEqual([
      { file: "remoteEntry.js", urlField: "app.ui.production", integrityField: "app.ui.integrity" },
      {
        file: "remoteEntry.server.js",
        urlField: "app.ui.ssr",
        integrityField: "app.ui.ssrIntegrity",
      },
    ]);
  });

  it("maps plugins to namespaced plugin fields", () => {
    expect(deployEntrySpecs("votes")).toEqual([
      {
        file: "remoteEntry.js",
        urlField: "plugins.votes.production",
        integrityField: "plugins.votes.integrity",
      },
    ]);
  });
});

describe("objectMetadataFor", () => {
  it("marks entry files short-cache with correct content types", () => {
    expect(objectMetadataFor("remoteEntry.js")).toEqual({
      contentType: "application/javascript",
      cacheControl: "public, max-age=60",
    });
    expect(objectMetadataFor("static/mf-manifest.json")).toEqual({
      contentType: "application/json",
      cacheControl: "public, max-age=60",
    });
  });

  it("marks content-hashed files immutable", () => {
    expect(objectMetadataFor("static/js/chunk-a1b2c3d4e5f6a7b8.js").cacheControl).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(objectMetadataFor("static/css/style.5f3a2b1c4d5e6f70.css").cacheControl).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("uses a short revalidate window for unhashed assets", () => {
    expect(objectMetadataFor("logo.png").cacheControl).toBe("public, max-age=300");
    expect(objectMetadataFor("logo.png").contentType).toBe("image/png");
  });

  it("falls back to octet-stream for unknown extensions", () => {
    expect(objectMetadataFor("data.bin").contentType).toBe("application/octet-stream");
  });
});

describe("collectDistFiles and hashDistDir", () => {
  it("collects files with posix-relative keys", async () => {
    const distDir = makeDist({
      "remoteEntry.js": "entry",
      "static/js/chunk-aaaa1111bbbb2222.js": "chunk",
    });
    const files = await collectDistFiles(distDir);
    expect(files.map((f) => f.key).sort()).toEqual([
      "remoteEntry.js",
      "static/js/chunk-aaaa1111bbbb2222.js",
    ]);
    expect(files[0]?.bytes.toString()).toBe("entry");
  });

  it("hashes change when dist content changes", () => {
    const distDir = makeDist({ "remoteEntry.js": "one" });
    const first = hashDistDir(distDir);
    writeFileSync(join(distDir, "remoteEntry.js"), "two");
    const second = hashDistDir(distDir);
    expect(first).not.toBe(second);
  });
});

describe("computeCloudflareDeployEntries", () => {
  it("computes SRI from local dist files with prefix-based urls", () => {
    const distDir = makeDist({ "remoteEntry.js": "entry-bytes" });
    const entries = computeCloudflareDeployEntries(
      [
        {
          key: "api",
          kind: "app",
          path: "/repo/api",
          distDir,
          prefix: "api",
          entries: deployEntrySpecs("api"),
        },
      ],
      "cdn.citynode.app",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe("https://cdn.citynode.app/api");
    expect(entries[0]?.urlField).toBe("app.api.production");
    expect(entries[0]?.integrity).toMatch(/^sha384-/);
  });

  it("throws when an expected entry file is missing", () => {
    const distDir = makeDist({ "remoteEntry.js": "entry" });
    expect(() =>
      computeCloudflareDeployEntries(
        [
          {
            key: "ui",
            kind: "app",
            path: "/repo/ui",
            distDir,
            prefix: "ui",
            entries: deployEntrySpecs("ui"),
          },
        ],
        "cdn.citynode.app",
      ),
    ).toThrow(/remoteEntry\.server\.js/);
  });
});

describe("resolveDeployConfig domain override", () => {
  it("derives hostname from the override domain (staging)", () => {
    const resolved = resolveDeployConfig(makeConfig({ deploy: { cdn: "cloudflare" } }), {
      domain: "staging.citynode.app",
    });
    expect(resolved.cloudflare?.hostname).toBe("cdn.staging.citynode.app");
    expect(resolved.cloudflare?.bucket).toBe("v1-citynode-near-staging-citynode-app-cdn");
  });

  it("uses the config domain when no override is given", () => {
    const resolved = resolveDeployConfig(makeConfig({ deploy: { cdn: "cloudflare" } }));
    expect(resolved.cloudflare?.hostname).toBe("cdn.citynode.app");
  });
});

describe("generateAlchemyRun", () => {
  it("emits a stack with bucket, custom domain, cors, and one upload action per workspace", () => {
    const distDir = makeDist({ "remoteEntry.js": "entry" });
    const generated = generateAlchemyRun({
      hostname: "cdn.citynode.app",
      bucket: "citynode-cdn",
      targets: [
        { key: "ui", distDir, prefix: "ui" },
        { key: "api", distDir, prefix: "api" },
      ],
    });

    expect(generated).toContain("Alchemy.Stack(");
    expect(generated).toContain('Cloudflare.R2.Bucket("Cdn"');
    expect(generated).toContain('const BUCKET_NAME = "citynode-cdn"');
    expect(generated).toContain("name: BUCKET_NAME");
    expect(generated).toContain('const HOSTNAME = "cdn.citynode.app"');
    expect(generated).toContain("domains: [{ name: HOSTNAME }]");
    expect(generated).toContain(
      'cors: [{ allowedMethods: ["GET", "HEAD"], allowedOrigins: ["*"] }]',
    );
    expect(generated).toContain("Cloudflare.R2.ReadWriteBucketLocal");
    expect(generated).toContain("Cloudflare.state()");
    expect(generated).toContain('"key": "ui"');
    expect(generated).toContain('"key": "api"');
    expect(generated).toContain(`CdnUpload/\${workspace.key}`);
    expect(generated).toContain("collectDistFiles");
    expect(generated).toContain("httpMetadata");
    expect(generated).toMatch(/"hash": "[a-f0-9]{64}"/);
  });

  it("includes the zone when provided", () => {
    const distDir = makeDist({ "remoteEntry.js": "entry" });
    const generated = generateAlchemyRun({
      hostname: "cdn.citynode.app",
      bucket: "citynode-cdn",
      zone: "citynode.app",
      targets: [{ key: "api", distDir, prefix: "api" }],
    });
    expect(generated).toContain('domains: [{ name: HOSTNAME, zone: "citynode.app" }]');
  });
});
