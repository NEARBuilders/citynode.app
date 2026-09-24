import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCdnProviderDeployable, resolveCdnProvider } from "../../src/build";
import {
  collectWorkspaceArtifacts,
  platformDeployEntries,
  platformUrlDeployEntries,
  uploadBundlesToPlatform,
} from "../../src/platform-deploy";
import type { BosConfig } from "../../src/types";

let activeDir: string | null = null;

afterEach(() => {
  if (activeDir) {
    rmSync(activeDir, { recursive: true, force: true });
    activeDir = null;
  }
});

function makeWorkspaceDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "platform-deploy-"));
  activeDir = dir;
  for (const [rel, content] of Object.entries(files)) {
    const filePath = join(dir, rel);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content);
  }
  return dir;
}

const ZEPHYR_CONFIG = {
  account: "a.near",
  domain: "d.app",
  deploy: { cdn: "zephyr" },
} as BosConfig;
const PLATFORM_CONFIG = {
  account: "a.near",
  domain: "d.app",
  deploy: { cdn: "platform" },
} as BosConfig;

describe("resolveCdnProvider", () => {
  it("defaults to platform when deploy.cdn is absent", () => {
    expect(resolveCdnProvider({ account: "a.near", domain: "d.app" } as BosConfig)).toBe(
      "platform",
    );
  });

  it("returns zephyr when explicitly configured", () => {
    expect(resolveCdnProvider(ZEPHYR_CONFIG)).toBe("zephyr");
  });

  it("returns platform when opted in", () => {
    expect(resolveCdnProvider(PLATFORM_CONFIG)).toBe("platform");
  });
});

describe("checkCdnProviderDeployable", () => {
  it("accepts zephyr", () => {
    expect(checkCdnProviderDeployable(ZEPHYR_CONFIG)).toBeNull();
  });

  it("accepts platform", () => {
    expect(checkCdnProviderDeployable(PLATFORM_CONFIG)).toBeNull();
  });
});

describe("collectWorkspaceArtifacts", () => {
  it("walks dist/ and returns base64 files with content types", async () => {
    const wsPath = makeWorkspaceDist({
      "dist/remoteEntry.js": "console.log('entry');",
      "dist/mf-manifest.json": "{}",
      "dist/static/js/chunk.js": "export {};",
      "src/ignored.ts": "not bundled",
    });

    const files = await collectWorkspaceArtifacts(wsPath);
    const paths = files.map((f) => f.path).sort();

    expect(paths).toEqual(["mf-manifest.json", "remoteEntry.js", "static/js/chunk.js"]);
    const entry = files.find((f) => f.path === "remoteEntry.js")!;
    expect(entry.contentType).toBe("text/javascript");
    expect(Buffer.from(entry.bytes).toString()).toBe("console.log('entry');");
  });

  it("skips dotfiles (OS noise) and maps shell asset content types", async () => {
    const wsPath = makeWorkspaceDist({
      "dist/index.html": "<html></html>",
      "dist/site.webmanifest": "{}",
      "dist/skill.md": "# skill",
      "dist/.DS_Store": "noise",
      "dist/remoteEntry.js": "console.log('entry');",
    });

    const files = await collectWorkspaceArtifacts(wsPath);
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));

    expect(Object.keys(byPath).sort()).toEqual([
      "index.html",
      "remoteEntry.js",
      "site.webmanifest",
      "skill.md",
    ]);
    expect(byPath["index.html"]?.contentType).toBe("text/html");
    expect(byPath["site.webmanifest"]?.contentType).toBe("application/manifest+json");
    expect(byPath["skill.md"]?.contentType).toBe("text/markdown");
  });

  it("returns empty array when dist/ is missing", async () => {
    const wsPath = makeWorkspaceDist({ "src/index.ts": "export {}; " });
    expect(await collectWorkspaceArtifacts(wsPath)).toEqual([]);
  });
});

describe("uploadBundlesToPlatform", () => {
  it("POSTs artifacts and returns the bundle base URL and objects", async () => {
    let seenAuth: string | null = null;
    let seenBody: string | null = null;
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      seenAuth =
        init?.headers && "x-api-key" in (init.headers as Record<string, string>)
          ? (init.headers as Record<string, string>)["x-api-key"]
          : null;
      seenBody = typeof init?.body === "string" ? init.body : null;
      return Response.json({
        base: "bundles/alice.near/citynode.app/ui",
        objects: [
          {
            key: "bundles/alice.near/citynode.app/ui/remoteEntry.js",
            sha256: "abc",
            integrity: "sha384-abc",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await uploadBundlesToPlatform({
        siteUrl: "http://localhost:9999",
        apiKey: "edk_test",
        account: "alice.near",
        gateway: "citynode.app",
        workspace: "ui",
        files: [
          {
            path: "remoteEntry.js",
            bytes: Buffer.from("console.log('entry');"),
            contentType: "text/javascript",
          },
        ],
      });

      expect(seenAuth).toBe("edk_test");
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:9999/api/storage/bundles",
        expect.objectContaining({ method: "POST" }),
      );
      const parsed = JSON.parse(seenBody!) as {
        account: string;
        gateway: string;
        workspace: string;
        paths: Record<string, { content: string; contentType: string }>;
      };
      expect(parsed.account).toBe("alice.near");
      expect(parsed.workspace).toBe("ui");
      expect(Buffer.from(parsed.paths["remoteEntry.js"]!.content, "base64").toString()).toBe(
        "console.log('entry');",
      );
      expect(result.base).toBe("bundles/alice.near/citynode.app/ui");
      expect(result.objects[0]!.integrity).toBe("sha384-abc");
      expect(result.baseUrl).toBe("http://localhost:9999/bundles/alice.near/citynode.app/ui/");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws a readable error when the platform API rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "ceiling exceeded" }, { status: 400 })),
    );

    try {
      await expect(
        uploadBundlesToPlatform({
          siteUrl: "http://localhost:9999",
          apiKey: "edk_test",
          account: "alice.near",
          gateway: "citynode.app",
          workspace: "ui",
          files: [
            {
              path: "remoteEntry.js",
              bytes: Buffer.from("x"),
              contentType: "text/javascript",
            },
          ],
        }),
      ).rejects.toThrow(/ceiling exceeded/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("platformDeployEntries", () => {
  const uploaded = {
    base: "bundles/alice.near/citynode.app/ui",
    objects: [
      {
        key: "bundles/alice.near/citynode.app/ui/remoteEntry.js",
        sha256: "aa",
        integrity: "sha384-entry",
      },
      {
        key: "bundles/alice.near/citynode.app/ui/ssr/remoteEntry.server.js",
        sha256: "bb",
        integrity: "sha384-ssr",
      },
    ],
    baseUrl: "http://localhost:9999/bundles/alice.near/citynode.app/ui/",
  };

  it("writes production + integrity fields for an app", () => {
    const entries = platformDeployEntries({ key: "ui", kind: "app", uploaded });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      url: uploaded.baseUrl,
      integrity: "sha384-entry",
      urlField: "app.ui.production",
      integrityField: "app.ui.integrity",
    });
  });

  it("derives the SSR container URL and fields from the ssr dist for an app", () => {
    const entries = platformDeployEntries({ key: "ui", kind: "app", uploaded });
    expect(entries[1]).toMatchObject({
      url: `${uploaded.baseUrl}ssr/`,
      integrity: "sha384-ssr",
      urlField: "app.ui.ssr",
      integrityField: "app.ui.ssrIntegrity",
    });
  });

  it("omits the SSR entry when the app dist has no ssr container", () => {
    const withoutSsr = { ...uploaded, objects: [uploaded.objects[0]!] };
    const entries = platformDeployEntries({ key: "ui", kind: "app", uploaded: withoutSsr });
    expect(entries).toHaveLength(1);
  });

  it("never writes SSR fields for plugins", () => {
    const entries = platformDeployEntries({ key: "auth", kind: "plugin", uploaded });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      urlField: "plugins.auth.production",
      integrityField: "plugins.auth.integrity",
    });
  });
});

describe("platformUrlDeployEntries (image-native)", () => {
  const ORIGIN = "https://citynode.app";
  const BASE = `${ORIGIN}/bundles/v1.citynode.near/citynode.app`;

  it("writes production + integrity fields with no integrity value", () => {
    const entries = platformUrlDeployEntries({
      origin: ORIGIN,
      account: "v1.citynode.near",
      gateway: "citynode.app",
      key: "ui",
      kind: "app",
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      url: `${BASE}/ui/`,
      urlField: "app.ui.production",
      integrityField: "app.ui.integrity",
    });
    // integrity omitted — applyDeployResults deletes stale pipeline hashes
    expect(entries[0].integrity).toBeUndefined();
  });

  it("derives the SSR container URL for the ui slot", () => {
    const entries = platformUrlDeployEntries({
      origin: ORIGIN,
      account: "v1.citynode.near",
      gateway: "citynode.app",
      key: "ui",
      kind: "app",
    });
    expect(entries[1]).toEqual({
      url: `${BASE}/ui/ssr/`,
      urlField: "app.ui.ssr",
      integrityField: "app.ui.ssrIntegrity",
    });
  });

  it("maps plugins to the plugins slot without ssr", () => {
    const entries = platformUrlDeployEntries({
      origin: ORIGIN,
      account: "v1.citynode.near",
      gateway: "citynode.app",
      key: "votes",
      kind: "plugin",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      url: `${BASE}/votes/`,
      urlField: "plugins.votes.production",
      integrityField: "plugins.votes.integrity",
    });
  });
});
