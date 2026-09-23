import { afterEach, describe, expect, it } from "vitest";
import { withPluginDeploy } from "../../src/integrity";
import { uiDeployPlugins } from "../../src/ui/deploy";

const ENV_KEYS = ["DEPLOY", "BOS_CDN_PROVIDER"] as const;

function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

afterEach(() => {
  delete process.env.DEPLOY;
  delete process.env.BOS_CDN_PROVIDER;
});

describe("zephyr attach guards on the platform CDN path", () => {
  it("uiDeployPlugins attaches zephyr only when DEPLOY=true and provider is not platform", () => {
    withEnv({ DEPLOY: "true", BOS_CDN_PROVIDER: "zephyr" }, () => {
      expect(
        uiDeployPlugins({
          ssr: false,
          deployFields: {} as never,
          bosConfigPath: "/x",
          deployLabel: "UI",
        }).length,
      ).toBeGreaterThan(0);
    });
    withEnv({ DEPLOY: "true" }, () => {
      expect(
        uiDeployPlugins({
          ssr: false,
          deployFields: {} as never,
          bosConfigPath: "/x",
          deployLabel: "UI",
        }).length,
      ).toBeGreaterThan(0);
    });
  });

  it("uiDeployPlugins returns no plugins when the CDN provider is platform", () => {
    withEnv({ DEPLOY: "true", BOS_CDN_PROVIDER: "platform" }, () => {
      expect(
        uiDeployPlugins({
          ssr: false,
          deployFields: {} as never,
          bosConfigPath: "/x",
          deployLabel: "UI",
        }),
      ).toEqual([]);
    });
  });

  it("uiDeployPlugins returns no plugins outside deploys", () => {
    withEnv({}, () => {
      expect(
        uiDeployPlugins({
          ssr: false,
          deployFields: {} as never,
          bosConfigPath: "/x",
          deployLabel: "UI",
        }),
      ).toEqual([]);
    });
  });

  it("withPluginDeploy passes the base config through unchanged on the platform path", () => {
    const baseConfig = { environments: {} };
    withEnv({ DEPLOY: "true", BOS_CDN_PROVIDER: "platform" }, () => {
      expect(withPluginDeploy(baseConfig, { bosConfigPath: "/x" })).toBe(baseConfig);
    });
  });

  it("withPluginDeploy wraps the config when deploying to zephyr", () => {
    const baseConfig = { environments: {} };
    withEnv({ DEPLOY: "true", BOS_CDN_PROVIDER: "zephyr" }, () => {
      expect(withPluginDeploy(baseConfig, { bosConfigPath: "/x" })).not.toBe(baseConfig);
    });
  });
});
