import { describe, expect, it } from "vitest";
import type { RuntimeConfig } from "../../src/services/config";
import { pluginsWithUi, uiComposeDigest } from "../../src/services/ui-compose";

function createBaseRuntimeConfig(): RuntimeConfig {
  return {
    env: "production",
    account: "linktree.near",
    domain: "linktree.com",
    networkId: "mainnet",
    title: "Linktree",
    description: "",
    host: {
      name: "host",
      url: "https://linktree.com",
      entry: "https://linktree.com/mf-manifest.json",
      source: "remote",
    },
    ui: {
      name: "ui",
      url: "https://cdn.example.com/base-ui",
      entry: "https://cdn.example.com/base-ui/mf-manifest.json",
      source: "remote",
      integrity: "sha384-base",
      ssrUrl: "https://cdn.example.com/base-ui-ssr",
      ssrIntegrity: "sha384-base-ssr",
    },
  } as RuntimeConfig;
}

describe("pluginsWithUi", () => {
  it("returns only plugins that declare ui ssr targets", () => {
    const config = createBaseRuntimeConfig();
    config.plugins = {
      headless: {
        name: "headless",
        url: "https://cdn.example.com/headless",
        entry: "https://cdn.example.com/headless/mf-manifest.json",
        source: "remote",
      } as never,
      auth: {
        name: "auth",
        url: "https://cdn.example.com/auth",
        entry: "https://cdn.example.com/auth/mf-manifest.json",
        source: "remote",
        ui: {
          name: "auth-ui",
          url: "https://cdn.example.com/auth-ui",
          entry: "https://cdn.example.com/auth-ui/mf-manifest.json",
          source: "remote",
          ssrUrl: "https://cdn.example.com/auth-ui-ssr",
          ssrIntegrity: "sha384-auth-ui-ssr",
        } as never,
      } as never,
    };

    const result = pluginsWithUi(config);
    expect(result.map((r) => r.id)).toEqual(["auth"]);
    expect(result[0]?.entry).toEqual({
      name: "auth-ui",
      ssrUrl: "https://cdn.example.com/auth-ui-ssr",
      ssrIntegrity: "sha384-auth-ui-ssr",
    });
  });

  it("is empty with no plugins", () => {
    expect(pluginsWithUi(createBaseRuntimeConfig())).toEqual([]);
  });
});

describe("uiComposeDigest", () => {
  it("is stable for identical configs", () => {
    expect(uiComposeDigest(createBaseRuntimeConfig())).toBe(
      uiComposeDigest(createBaseRuntimeConfig()),
    );
  });

  it("changes when any remote ui is added", () => {
    const config = createBaseRuntimeConfig();
    const before = uiComposeDigest(config);

    config.plugins = {
      auth: {
        name: "auth",
        url: "https://cdn.example.com/auth",
        entry: "https://cdn.example.com/auth/mf-manifest.json",
        source: "remote",
        ui: {
          name: "auth-ui",
          url: "https://cdn.example.com/auth-ui",
          entry: "https://cdn.example.com/auth-ui/mf-manifest.json",
          source: "remote",
          ssrUrl: "https://cdn.example.com/auth-ui-ssr",
          ssrIntegrity: "sha384-a",
        } as never,
      } as never,
    };
    expect(uiComposeDigest(config)).not.toBe(before);
  });

  it("digest origin fields are client-visible (url + integrity + compose flag)", () => {
    const config = createBaseRuntimeConfig();
    config.plugins = {
      auth: {
        name: "auth",
        url: "https://cdn.example.com/auth",
        entry: "https://cdn.example.com/auth/mf-manifest.json",
        source: "remote",
        ui: {
          name: "auth-ui",
          url: "https://cdn.example.com/auth-ui",
          entry: "https://cdn.example.com/auth-ui/mf-manifest.json",
          source: "remote",
          ssrUrl: "https://cdn.example.com/auth-ui-ssr",
          ssrIntegrity: "sha384-a",
        } as never,
      } as never,
    };
    const base = uiComposeDigest(config);

    const bumped = structuredClone(config);
    (bumped.plugins!.auth.ui as { integrity: string }).integrity = "sha384-bumped";
    expect(uiComposeDigest(bumped)).not.toBe(base);
  });

  it("changes when the core ui integrity changes", () => {
    const base = createBaseRuntimeConfig();
    const bumped = createBaseRuntimeConfig();
    bumped.ui.integrity = "sha384-rotated";
    expect(uiComposeDigest(bumped)).not.toBe(uiComposeDigest(base));
  });
});
