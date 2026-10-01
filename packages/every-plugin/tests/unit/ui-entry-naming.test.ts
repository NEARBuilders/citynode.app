import { afterEach, describe, expect, it } from "vitest";
import {
  DEV_ENTRY_FILENAME,
  DEV_SERVER_ENTRY_FILENAME,
  HASHED_ENTRY_PATTERN,
  HASHED_SERVER_ENTRY_PATTERN,
  isBuildInvocation,
  uiEntryFilename,
} from "../../src/build/artifact-names";
import { createUiRsbuildConfig } from "../../src/build/ui/rsbuild-config";

const options = {
  workspaceRoot: process.cwd(),
  pkg: { name: "@test/plugin-ui", version: "0.0.0" },
  role: "consumer",
  manifestName: "test-plugin-ui",
  devPort: 0,
  webEntry: "./src/index.ts",
  webExposes: {},
  nodeEntry: "./src/ssr.ts",
  nodeExposes: {},
} as const;

describe("uiEntryFilename", () => {
  it("dev servers emit the fixed dev names — every dev consumer appends them", () => {
    expect(uiEntryFilename({ isBuild: false })).toBe(DEV_ENTRY_FILENAME);
    expect(uiEntryFilename({ isBuild: false, server: true })).toBe(DEV_SERVER_ENTRY_FILENAME);
  });

  it("builds emit content-hashed entry names (atomic-deploys 01)", () => {
    expect(uiEntryFilename({ isBuild: true })).toBe(HASHED_ENTRY_PATTERN);
    expect(uiEntryFilename({ isBuild: true, server: true })).toBe(HASHED_SERVER_ENTRY_PATTERN);
  });
});

describe("isBuildInvocation", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDeploy = process.env.DEPLOY;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDeploy === undefined) delete process.env.DEPLOY;
    else process.env.DEPLOY = originalDeploy;
  });

  it("is false on dev servers", () => {
    process.env.NODE_ENV = "development";
    delete process.env.DEPLOY;
    expect(isBuildInvocation()).toBe(false);
  });

  it("is true for production builds", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DEPLOY;
    expect(isBuildInvocation()).toBe(true);
  });

  it("is true under DEPLOY=true even in development", () => {
    process.env.NODE_ENV = "development";
    process.env.DEPLOY = "true";
    expect(isBuildInvocation()).toBe(true);
  });
});

describe("createUiRsbuildConfig artifact aliasing", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDeploy = process.env.DEPLOY;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDeploy === undefined) delete process.env.DEPLOY;
    else process.env.DEPLOY = originalDeploy;
  });

  function pluginNames(config: ReturnType<typeof createUiRsbuildConfig>): {
    web: string[];
    node: string[];
  } {
    const pick = (env: unknown): string[] => {
      const environment = env as { plugins?: Array<{ name?: string }> } | undefined;
      return (environment?.plugins ?? []).map((plugin) => plugin?.name ?? "");
    };
    const environments = config.environments as
      | Record<string, { plugins?: Array<{ name?: string }> }>
      | undefined;
    return {
      web: pick(environments?.web),
      node: pick(environments?.node),
    };
  }

  it("skips the dist-aliasing plugin on dev servers (no dist writes exist)", () => {
    process.env.NODE_ENV = "development";
    delete process.env.DEPLOY;
    const names = pluginNames(createUiRsbuildConfig(options));
    expect(names.web.some((name) => name.includes("hash-artifacts"))).toBe(false);
    expect(names.node.some((name) => name.includes("hash-artifacts"))).toBe(false);
  });

  it("attaches the dist-aliasing plugin on builds", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DEPLOY;
    const names = pluginNames(createUiRsbuildConfig(options));
    expect(names.web.some((name) => name.includes("hash-artifacts"))).toBe(true);
    expect(names.node.some((name) => name.includes("hash-artifacts"))).toBe(true);
  });
});
