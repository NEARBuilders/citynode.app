import { describe, expect, it } from "vitest";
import {
  mergeBosConfigWithExtends,
  rebuildOrderedConfig,
  resolveExtendsRef,
} from "../../src/merge";
import type { ExtendsConfig } from "../../src/types";

describe("env-specific extends resolution", () => {
  it("string extends is used for any env", () => {
    expect(resolveExtendsRef("bos://dev.everything.near/everything.dev", "development")).toBe(
      "bos://dev.everything.near/everything.dev",
    );
    expect(resolveExtendsRef("bos://dev.everything.near/everything.dev", "production")).toBe(
      "bos://dev.everything.near/everything.dev",
    );
    expect(resolveExtendsRef("bos://dev.everything.near/everything.dev", "staging")).toBe(
      "bos://dev.everything.near/everything.dev",
    );
  });

  it("object-form selects development URL for development env", () => {
    const ext: ExtendsConfig = {
      development: "bos://dev.near/dev-config",
      production: "bos://dev.near/prod-config",
    };
    expect(resolveExtendsRef(ext, "development")).toBe("bos://dev.near/dev-config");
  });

  it("object-form selects production URL for production env", () => {
    const ext: ExtendsConfig = {
      development: "bos://dev.near/dev-config",
      production: "bos://dev.near/prod-config",
    };
    expect(resolveExtendsRef(ext, "production")).toBe("bos://dev.near/prod-config");
  });

  it("object-form selects staging URL for staging env", () => {
    const ext: ExtendsConfig = {
      development: "bos://dev.near/dev-config",
      production: "bos://dev.near/prod-config",
      staging: "bos://dev.near/stage-config",
    };
    expect(resolveExtendsRef(ext, "staging")).toBe("bos://dev.near/stage-config");
  });

  it("falls back to production when requested env is missing", () => {
    const ext: ExtendsConfig = {
      production: "bos://dev.near/prod-config",
    };
    expect(resolveExtendsRef(ext, "development")).toBe("bos://dev.near/prod-config");
    expect(resolveExtendsRef(ext, "staging")).toBe("bos://dev.near/prod-config");
  });

  it("falls back to first defined value when production also missing", () => {
    const ext: ExtendsConfig = {
      development: "bos://dev.near/dev-config",
    };
    expect(resolveExtendsRef(ext, "production")).toBe("bos://dev.near/dev-config");
    expect(resolveExtendsRef(ext, "staging")).toBe("bos://dev.near/dev-config");
  });

  it("returns undefined for undefined extends", () => {
    expect(resolveExtendsRef(undefined, "development")).toBeUndefined();
  });

  it("returns undefined for empty object", () => {
    expect(resolveExtendsRef({}, "development")).toBeUndefined();
  });
});

describe("env-specific extends in merge scenario", () => {
  const PARENT_CONFIG = {
    account: "parent.near",
    domain: "parent.dev",
    app: {
      host: { development: "http://localhost:3000", production: "https://host.parent.dev" },
      ui: { name: "ui", development: "http://localhost:3003", production: "https://ui.parent.dev" },
      api: {
        name: "api",
        development: "http://localhost:3001",
        production: "https://api.parent.dev",
      },
    },
    plugins: {
      registry: {
        development: "local:plugins/registry",
        production: "https://cdn.parent.dev/registry",
      },
    },
    shared: {
      ui: {
        effect: { version: "3.20.0", singleton: true },
      },
    },
  };

  it("child with env-specific extends can override parent while inheriting", () => {
    const child = {
      account: "child.near",
      domain: "child.dev",
      extends: {
        development: "bos://dev.near/dev",
        production: "bos://dev.near/prod",
      } satisfies ExtendsConfig,
      plugins: {
        myplugin: { development: "local:plugins/myplugin" },
      },
      shared: {
        ui: {
          effect: { version: "3.21.0" },
        },
      },
    };

    const merged = mergeBosConfigWithExtends(PARENT_CONFIG as any, child as any);

    expect(merged.account).toBe("child.near");
    expect(merged.domain).toBe("child.dev");
    expect(merged.extends).toEqual({
      development: "bos://dev.near/dev",
      production: "bos://dev.near/prod",
    });

    const plugins = merged.plugins as Record<string, unknown>;
    expect(plugins.registry).toBeDefined();
    expect(plugins.myplugin).toBeDefined();

    const ui = (merged.shared as Record<string, unknown>).ui as Record<
      string,
      Record<string, unknown>
    >;
    expect(ui.effect.version).toBe("3.21.0");
    expect(ui.effect.singleton).toBe(true);
  });

  it("extends field with staging env is preserved in canonical ordering", () => {
    const child = {
      extends: {
        development: "bos://dev.near/dev",
        production: "bos://dev.near/prod",
        staging: "bos://dev.near/stage",
      } satisfies ExtendsConfig,
      account: "child.near",
      domain: "child.dev",
      shared: {},
    };

    const merged = mergeBosConfigWithExtends(PARENT_CONFIG as any, child as any);
    const keys = Object.keys(merged);
    expect(keys[0]).toBe("extends");
    expect(keys[1]).toBe("account");
    expect(keys[2]).toBe("domain");
  });
});
