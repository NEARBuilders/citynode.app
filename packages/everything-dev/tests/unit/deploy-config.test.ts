import { describe, expect, it } from "vitest";
import { resolveDeployConfig } from "../../src/config";
import { BOS_CONFIG_ORDER, mergeBosConfigWithExtends, rebuildOrderedConfig } from "../../src/merge";
import { BosConfigSchema, DeployConfigSchema } from "../../src/types";

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

describe("DeployConfigSchema", () => {
  it("parses a full deploy section", () => {
    const parsed = DeployConfigSchema.parse({
      provider: "railway",
      cdn: "cloudflare",
      cloudflare: { hostname: "cdn.citynode.app", bucket: "citynode-cdn", zone: "citynode.app" },
    });
    expect(parsed).toEqual({
      provider: "railway",
      cdn: "cloudflare",
      cloudflare: { hostname: "cdn.citynode.app", bucket: "citynode-cdn", zone: "citynode.app" },
    });
  });

  it("parses an empty object", () => {
    expect(DeployConfigSchema.parse({})).toEqual({});
  });

  it("rejects an unknown cdn provider", () => {
    expect(() => DeployConfigSchema.parse({ cdn: "s3" })).toThrow();
  });

  it("rejects an unknown deploy provider", () => {
    expect(() => DeployConfigSchema.parse({ provider: "fly" })).toThrow();
  });

  it("is preserved by BosConfigSchema.parse", () => {
    const config = makeConfig({
      deploy: { cdn: "cloudflare", cloudflare: { hostname: "cdn.citynode.app" } },
    });
    expect(config.deploy).toEqual({
      cdn: "cloudflare",
      cloudflare: { hostname: "cdn.citynode.app" },
    });
  });
});

describe("resolveDeployConfig", () => {
  it("defaults to the zephyr cdn when no deploy section exists", () => {
    const resolved = resolveDeployConfig(makeConfig());
    expect(resolved).toEqual({
      provider: "railway",
      cdn: "zephyr",
      railwayService: undefined,
      cloudflare: null,
    });
  });

  it("resolves cloudflare defaults from the config domain", () => {
    const resolved = resolveDeployConfig(makeConfig({ deploy: { cdn: "cloudflare" } }));
    expect(resolved.cdn).toBe("cloudflare");
    expect(resolved.cloudflare).toEqual({
      hostname: "cdn.citynode.app",
      bucket: "v1-citynode-near-citynode-app-cdn",
    });
  });

  it("prefers explicit cloudflare settings over derived defaults", () => {
    const resolved = resolveDeployConfig(
      makeConfig({
        deploy: {
          cdn: "cloudflare",
          cloudflare: {
            hostname: "assets.citynode.app",
            bucket: "citynode-cdn",
            zone: "citynode.app",
          },
        },
      }),
    );
    expect(resolved.cloudflare).toEqual({
      hostname: "assets.citynode.app",
      bucket: "citynode-cdn",
      zone: "citynode.app",
    });
  });

  it("throws when cloudflare is selected without a hostname or domain", () => {
    const config = makeConfig({ deploy: { cdn: "cloudflare" } });
    delete config.domain;
    expect(() => resolveDeployConfig(config)).toThrow(/requires deploy\.cloudflare\.hostname/);
  });

  it("maps legacy ci.railway.service to railwayService", () => {
    const resolved = resolveDeployConfig(makeConfig({ ci: { railway: { service: "app" } } }));
    expect(resolved.railwayService).toBe("app");
    expect(resolved.cdn).toBe("zephyr");
  });
});

describe("deploy section ordering and merge", () => {
  it("places deploy between ci and app in BOS_CONFIG_ORDER", () => {
    expect(BOS_CONFIG_ORDER.indexOf("deploy")).toBe(BOS_CONFIG_ORDER.indexOf("ci") + 1);
    expect(BOS_CONFIG_ORDER.indexOf("deploy")).toBe(BOS_CONFIG_ORDER.indexOf("app") - 1);
  });

  it("rebuildOrderedConfig emits deploy before app", () => {
    const ordered = rebuildOrderedConfig({
      app: { host: {} },
      deploy: { cdn: "cloudflare" },
      ci: { railway: { service: "app" } },
    });
    expect(Object.keys(ordered)).toEqual(["ci", "deploy", "app"]);
  });

  it("child deploy values override parent while inheriting parent cloudflare fields", () => {
    const parent = {
      account: "parent.near",
      deploy: {
        cdn: "cloudflare",
        cloudflare: { hostname: "cdn.parent.dev", bucket: "parent-cdn" },
      },
    };
    const child = {
      account: "child.near",
      domain: "child.dev",
      deploy: { cdn: "zephyr" },
    };
    const merged = mergeBosConfigWithExtends(parent, child);
    expect(merged.deploy).toEqual({
      cdn: "zephyr",
      cloudflare: { hostname: "cdn.parent.dev", bucket: "parent-cdn" },
    });
  });
});
