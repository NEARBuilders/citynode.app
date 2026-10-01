import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BosConfig } from "../../src/types";

const {
  buildWorkspaceTargetsMock,
  generateCodeArtifactsMock,
  fetchBosConfigFromFastKvMock,
  resolveSigningStrategyMock,
  loadResolvedConfigMock,
  collectDistFilesMock,
  uploadWorkspaceDistMock,
} = vi.hoisted(() => ({
  buildWorkspaceTargetsMock: vi.fn(),
  generateCodeArtifactsMock: vi.fn(),
  fetchBosConfigFromFastKvMock: vi.fn(),
  resolveSigningStrategyMock: vi.fn(),
  loadResolvedConfigMock: vi.fn(),
  collectDistFilesMock: vi.fn(),
  uploadWorkspaceDistMock: vi.fn(),
}));

vi.mock("../../src/build", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/build")>();
  return { ...actual, buildWorkspaceTargets: buildWorkspaceTargetsMock };
});

vi.mock("../../src/code-artifacts", () => ({
  generateCodeArtifacts: generateCodeArtifactsMock,
}));

vi.mock("../../src/fastkv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/fastkv")>();
  return { ...actual, fetchBosConfigFromFastKv: fetchBosConfigFromFastKvMock };
});

vi.mock("../../src/near-signer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/near-signer")>();
  return { ...actual, resolveSigningStrategy: resolveSigningStrategyMock };
});

vi.mock("../../src/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/config")>();
  return { ...actual, loadResolvedConfig: loadResolvedConfigMock };
});

vi.mock("../../src/storage-upload", () => ({
  collectDistFiles: collectDistFilesMock,
  uploadWorkspaceDist: uploadWorkspaceDistMock,
}));

vi.mock("../../src/platform-deploy", () => ({
  platformUrlDeployEntries: vi.fn(() => []),
  pluginUiUrlDeployEntries: vi.fn(() => []),
}));

import { writeSessionHandle } from "../../src/auth-session";
import { publishToFastKv } from "../../src/publish";

const bosConfig = {
  account: "dev.everything.near",
  domain: "dev.everything.dev",
  app: {
    host: { development: "local:host", production: "https://host.example" },
    ui: { development: "local:ui", production: "https://ui.example" },
    api: { development: "local:api", production: "https://api.example" },
  },
} as BosConfig;

const baseInput = {
  bosConfig,
  runtimeConfig: null,
  env: "production" as const,
  build: true,
  dryRun: false,
  verbose: false,
  packages: "",
  privateKey: "ed25519:0000000000000000000000000000000000000000000000000000000000000000",
};

let configDir: string;
let savedEnv: Record<string, string | undefined>;

describe("publishToFastKv preflight ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configDir = mkdtempSync(join(tmpdir(), "bos-preflight-"));
    savedEnv = {
      BOS_BUNDLE_CDN_ORIGIN: process.env.BOS_BUNDLE_CDN_ORIGIN,
      BOS_STORAGE_API_KEY: process.env.BOS_STORAGE_API_KEY,
      BOS_STORAGE_ORIGIN: process.env.BOS_STORAGE_ORIGIN,
    };
    delete process.env.BOS_BUNDLE_CDN_ORIGIN;
    delete process.env.BOS_STORAGE_API_KEY;
    delete process.env.BOS_STORAGE_ORIGIN;

    resolveSigningStrategyMock.mockResolvedValue({
      strategy: "near-kit",
      privateKey: "ed25519:test",
      source: "provided",
    });
    loadResolvedConfigMock.mockResolvedValue({ config: bosConfig });
    writeFileSync(join(configDir, "bos.config.json"), JSON.stringify(bosConfig, null, 2));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it("aborts before the build train when CDN storage credentials are missing", async () => {
    process.env.BOS_BUNDLE_CDN_ORIGIN = "https://cdn.example.test";
    fetchBosConfigFromFastKvMock.mockRejectedValue(new Error("No config found"));

    const result = await publishToFastKv({ ...baseInput, configDir });

    expect(result.status).toBe("error");
    expect(result.error).toContain("CDN deploy requires bundle-upload credentials");
    expect(result.error).toContain("BOS_STORAGE_API_KEY");
    expect(generateCodeArtifactsMock).not.toHaveBeenCalled();
    expect(buildWorkspaceTargetsMock).not.toHaveBeenCalled();
    expect(uploadWorkspaceDistMock).not.toHaveBeenCalled();
    expect(result.registryUrl).toContain("dev.everything.near");
  });

  it("aborts before the build train on a session account mismatch", async () => {
    process.env.BOS_BUNDLE_CDN_ORIGIN = "https://cdn.example.test";
    process.env.BOS_STORAGE_API_KEY = "api_ci_key";
    writeSessionHandle(configDir, {
      version: 1,
      credential: {
        kind: "session",
        apiKey: "api_session",
        apiKeyId: "key-1",
        accountId: "someone.else.near",
        label: "test",
        siteUrl: "https://site.example",
        createdAt: new Date().toISOString(),
        expiresAt: null,
      },
      publishKey: null,
      delegateKey: null,
    });

    const result = await publishToFastKv({ ...baseInput, configDir });

    expect(result.status).toBe("error");
    expect(result.error).toContain("someone.else.near");
    expect(buildWorkspaceTargetsMock).not.toHaveBeenCalled();
  });

  it("reads the registry before building and publishes when already up to date", async () => {
    process.env.BOS_BUNDLE_CDN_ORIGIN = "https://cdn.example.test";
    process.env.BOS_STORAGE_API_KEY = "api_ci_key";
    buildWorkspaceTargetsMock.mockResolvedValue({ built: [], skipped: [], deployResults: [] });
    fetchBosConfigFromFastKvMock.mockResolvedValue(JSON.parse(JSON.stringify(bosConfig)));

    const result = await publishToFastKv({ ...baseInput, configDir });

    expect(result.status).toBe("published");
    expect(buildWorkspaceTargetsMock).toHaveBeenCalledTimes(1);
    expect(uploadWorkspaceDistMock).not.toHaveBeenCalled();
    expect(fetchBosConfigFromFastKvMock.mock.invocationCallOrder[0]).toBeLessThan(
      buildWorkspaceTargetsMock.mock.invocationCallOrder[0]!,
    );
  });

  it("uploads workspace dists with the resolved storage credentials", async () => {
    process.env.BOS_BUNDLE_CDN_ORIGIN = "https://cdn.example.test";
    process.env.BOS_STORAGE_API_KEY = "api_ci_key";
    buildWorkspaceTargetsMock.mockResolvedValue({
      built: ["host"],
      skipped: [],
      deployResults: [{ key: "host", kind: "app", success: true }],
    });
    collectDistFilesMock.mockResolvedValue([]);
    uploadWorkspaceDistMock.mockResolvedValue({
      stored: 0,
      totalBytes: 0,
      integrity: {},
      storage: "s3",
    });
    let fetchCalls = 0;
    fetchBosConfigFromFastKvMock.mockImplementation(async () => {
      fetchCalls += 1;
      return fetchCalls === 1 ? bosConfig : JSON.parse(JSON.stringify(bosConfig));
    });

    const result = await publishToFastKv({ ...baseInput, configDir, packages: "all" });

    expect(result.status).toBe("published");
    expect(uploadWorkspaceDistMock).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "https://dev.everything.dev",
        apiKey: "api_ci_key",
        account: "dev.everything.near",
        gateway: "dev.everything.dev",
        workspace: "host",
      }),
    );
  });

  it("aborts before publish when the receiving storage backend is in-memory", async () => {
    process.env.BOS_BUNDLE_CDN_ORIGIN = "https://cdn.example.test";
    process.env.BOS_STORAGE_API_KEY = "api_ci_key";
    buildWorkspaceTargetsMock.mockResolvedValue({
      built: ["host"],
      skipped: [],
      deployResults: [{ key: "host", kind: "app", success: true }],
    });
    collectDistFilesMock.mockResolvedValue([]);
    uploadWorkspaceDistMock.mockResolvedValue({
      stored: 0,
      totalBytes: 0,
      integrity: {},
      storage: "memory",
    });
    fetchBosConfigFromFastKvMock.mockResolvedValue(JSON.parse(JSON.stringify(bosConfig)));

    const result = await publishToFastKv({ ...baseInput, configDir, packages: "all" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("BOS_STORAGE_*");
  });

  it("a config-only publish (build: false) never invokes the build train", async () => {
    buildWorkspaceTargetsMock.mockResolvedValue({ built: [], skipped: [], deployResults: [] });
    fetchBosConfigFromFastKvMock.mockResolvedValue(JSON.parse(JSON.stringify(bosConfig)));

    const result = await publishToFastKv({ ...baseInput, configDir, build: false });

    expect(result.status).toBe("published");
    expect(generateCodeArtifactsMock).not.toHaveBeenCalled();
    expect(buildWorkspaceTargetsMock).not.toHaveBeenCalled();
    expect(uploadWorkspaceDistMock).not.toHaveBeenCalled();
  });
});
