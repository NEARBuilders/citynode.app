import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type BundleNamespace,
  bundleUrlToLocalPath,
  installBundleFetchFromEnv,
  installGlobalBundleFetch,
} from "../../src/bundle-fs-resolve";
import { defaultConfigEnv } from "../../src/config";

const NAMESPACE: BundleNamespace = {
  bundleDir: join(tmpdir(), "bundle-fs-resolve-test"),
  account: "v1.citynode.near",
  gateway: "citynode.app",
};

const manifestBody = JSON.stringify({ schemaVersion: 1, kind: "every-plugin/manifest" });

function stageFixture(): void {
  mkdirSync(NAMESPACE.bundleDir, { recursive: true });
  const pluginDir = join(NAMESPACE.bundleDir, NAMESPACE.account, NAMESPACE.gateway, "apps");
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(join(pluginDir, "plugin.manifest.json"), manifestBody);
}

describe("bundleUrlToLocalPath", () => {
  beforeAll(stageFixture);
  afterAll(() => rmSync(NAMESPACE.bundleDir, { recursive: true, force: true }));

  it("resolves an own-namespace URL into the staged directory", () => {
    const resolved = bundleUrlToLocalPath(
      "https://citynode.app/bundles/v1.citynode.near/citynode.app/apps/plugin.manifest.json",
      NAMESPACE,
    );
    expect(resolved).toBe(
      join(
        NAMESPACE.bundleDir,
        NAMESPACE.account,
        NAMESPACE.gateway,
        "apps",
        "plugin.manifest.json",
      ),
    );
  });

  it("rejects a foreign namespace (children keep the network fetch)", () => {
    expect(
      bundleUrlToLocalPath(
        "https://other.dev/bundles/other.account.near/other.dev/apps/plugin.manifest.json",
        NAMESPACE,
      ),
    ).toBeNull();
  });

  it("rejects non-http(s) schemes and malformed input", () => {
    for (const url of [
      "file:///etc/passwd",
      "data:text/plain,hi",
      "not a url",
      "https://citynode.app/bundles/v1.citynode.near/citynode.app/",
    ]) {
      expect(bundleUrlToLocalPath(url, NAMESPACE)).toBeNull();
    }
  });

  it("contains traversal inside the own namespace and rejects escapes", () => {
    for (const url of [
      "https://citynode.app/bundles/v1.citynode.near/citynode.app/apps/../apps/plugin.manifest.json",
      "https://citynode.app/bundles/v1.citynode.near/citynode.app/apps/%2e%2e/apps/plugin.manifest.json",
    ]) {
      const resolved = bundleUrlToLocalPath(url, NAMESPACE);
      expect(
        resolved?.startsWith(join(NAMESPACE.bundleDir, NAMESPACE.account, NAMESPACE.gateway)),
      ).toBe(true);
    }
    for (const url of [
      "https://citynode.app/bundles/v1.citynode.near/citynode.app/%2e%2e/%2e%2e/%2e%2e/etc/passwd",
      "https://citynode.app/bundles/v1.citynode.near/citynode.app/..%2f..%2fetc%2fpasswd",
      "https://citynode.app/bundles/v1.citynode.near/citynode.app/../other.namespace/apps/plugin.manifest.json",
    ]) {
      expect(bundleUrlToLocalPath(url, NAMESPACE)).toBeNull();
    }
  });

  it("rejects a prefix collision with a longer account name", () => {
    expect(
      bundleUrlToLocalPath(
        "https://citynode.app/bundles/v1.citynode.near.evil/citynode.app/apps/plugin.manifest.json",
        NAMESPACE,
      ),
    ).toBeNull();
  });
});

describe("BundleResolver global fetch adapter", () => {
  const originalFetch = globalThis.fetch;

  beforeAll(stageFixture);
  afterAll(() => rmSync(NAMESPACE.bundleDir, { recursive: true, force: true }));

  it("serves own-namespace URLs from disk with manifest semantics", async () => {
    const handle = installGlobalBundleFetch(NAMESPACE);
    try {
      const res = await fetch(
        "https://citynode.app/bundles/v1.citynode.near/citynode.app/apps/plugin.manifest.json",
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/json");
      expect(await res.json()).toEqual(JSON.parse(manifestBody));
    } finally {
      await handle.uninstall();
    }
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("returns 404 for own-namespace files that are not staged", async () => {
    const handle = installGlobalBundleFetch(NAMESPACE);
    try {
      const res = await fetch(
        "https://citynode.app/bundles/v1.citynode.near/citynode.app/apps/missing.js",
      );
      expect(res.status).toBe(404);
    } finally {
      await handle.uninstall();
    }
  });

  it("falls through to the original fetch for foreign URLs", async () => {
    const fallthrough = new Response("from-network", { status: 200 });
    globalThis.fetch = async () => fallthrough;
    const handle = installGlobalBundleFetch(NAMESPACE);
    try {
      const res = await fetch("https://api.fastnear.com/v0/account/test");
      expect(res).toBe(fallthrough);
    } finally {
      await handle.uninstall();
      globalThis.fetch = originalFetch;
    }
    expect(globalThis.fetch).toBe(originalFetch);
  });
});

describe("installBundleFetchFromEnv", () => {
  const originalFetch = globalThis.fetch;
  const { BOS_BUNDLE_DIR, BOS_ACCOUNT, BOS_GATEWAY } = process.env;

  afterAll(() => {
    globalThis.fetch = originalFetch;
    if (BOS_BUNDLE_DIR === undefined) delete process.env.BOS_BUNDLE_DIR;
    else process.env.BOS_BUNDLE_DIR = BOS_BUNDLE_DIR;
    if (BOS_ACCOUNT === undefined) delete process.env.BOS_ACCOUNT;
    else process.env.BOS_ACCOUNT = BOS_ACCOUNT;
    if (BOS_GATEWAY === undefined) delete process.env.BOS_GATEWAY;
    else process.env.BOS_GATEWAY = BOS_GATEWAY;
  });

  it("is inert without BOS_BUNDLE_DIR", () => {
    delete process.env.BOS_BUNDLE_DIR;
    expect(installBundleFetchFromEnv({ configPath: null })).toBeNull();
  });

  it("derives the namespace from registry env, else config fields", () => {
    delete process.env.BOS_ACCOUNT;
    delete process.env.BOS_GATEWAY;
    process.env.BOS_BUNDLE_DIR = NAMESPACE.bundleDir;

    const configPath = mkdtempSync(join(tmpdir(), "bos-config-"));
    const configFile = join(configPath, "bos.config.json");
    writeFileSync(
      configFile,
      JSON.stringify({ account: NAMESPACE.account, domain: NAMESPACE.gateway }),
    );

    expect(installBundleFetchFromEnv({ configPath: configFile })).not.toBeNull();

    process.env.BOS_ACCOUNT = "registry.near";
    process.env.BOS_GATEWAY = "registry.dev";
    expect(installBundleFetchFromEnv({ configPath: configFile })).not.toBeNull();

    rmSync(configPath, { recursive: true, force: true });
  });

  it("is inert when the config has no identity fields", () => {
    delete process.env.BOS_ACCOUNT;
    delete process.env.BOS_GATEWAY;
    process.env.BOS_BUNDLE_DIR = NAMESPACE.bundleDir;
    const configPath = mkdtempSync(join(tmpdir(), "bos-config-"));
    const configFile = join(configPath, "bos.config.json");
    writeFileSync(configFile, "{}");
    expect(installBundleFetchFromEnv({ configPath: configFile })).toBeNull();
    rmSync(configPath, { recursive: true, force: true });
  });
});

describe("defaultConfigEnv", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  it("honors NODE_ENV for config resolution", () => {
    process.env.NODE_ENV = "production";
    expect(defaultConfigEnv()).toBe("production");
    process.env.NODE_ENV = "test";
    expect(defaultConfigEnv()).toBe("development");
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    expect(defaultConfigEnv()).toBe(
      originalNodeEnv === "production" ? "production" : "development",
    );
  });
});
