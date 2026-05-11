import { describe, expect, it } from "vitest";
import { buildRuntimeConfig, buildRuntimePluginsForConfig } from "../../src/config";
import type { BosConfig, BosEnv } from "../../src/types";

function makeBosConfig(overrides: Partial<BosConfig> = {}): BosConfig {
  return {
    account: "test.near",
    domain: "test.dev",
    app: {
      host: {
        development: "local:host",
        production: "https://host.test.dev",
      },
      ui: {
        name: "ui",
        development: "local:ui",
        production: "https://ui.test.dev",
      },
      api: {
        name: "api",
        development: "local:api",
        production: "https://api.test.dev",
      },
    },
    ...overrides,
  } as BosConfig;
}

describe("plugin UI runtime config", () => {
  const baseDir = "/test/project";

  it("resolves plugin without ui", async () => {
    const config = makeBosConfig({
      plugins: {
        registry: {
          development: "local:plugins/registry",
          production: "https://registry.test.dev",
          name: "registry",
        } as any,
      },
    });

    const pluginRuntime = await buildRuntimePluginsForConfig(config, baseDir, "production" as BosEnv);
    const runtime = buildRuntimeConfig(config, baseDir, "production" as BosEnv, {
      plugins: pluginRuntime,
    });

    expect(runtime.plugins?.registry).toBeDefined();
    expect(runtime.plugins?.registry.name).toBe("registry");
    expect(runtime.plugins?.registry.url).toContain("registry.test.dev");
    expect(runtime.plugins?.registry.ui).toBeUndefined();
  });

  it("populates plugin ui when app.ui is present in plugin config", async () => {
    const config = makeBosConfig({
      plugins: {
        registry: {
          development: "local:plugins/registry",
          production: "https://registry.test.dev",
          name: "registry",
          app: {
            api: {
              name: "registry",
              development: "local:.",
              production: "https://registry.test.dev",
            },
            ui: {
              name: "registry-ui",
              development: "local:./ui",
              production: "https://registry-ui.test.dev",
            },
          },
        } as any,
      },
    });

    const pluginRuntime = await buildRuntimePluginsForConfig(config, baseDir, "production" as BosEnv);
    const runtime = buildRuntimeConfig(config, baseDir, "production" as BosEnv, {
      plugins: pluginRuntime,
    });

    expect(runtime.plugins?.registry.ui).toBeDefined();
    expect(runtime.plugins?.registry.ui?.name).toBe("registry-ui");
    expect(runtime.plugins?.registry.ui?.url).toContain("registry-ui.test.dev");
    expect(runtime.plugins?.registry.ui?.source).toBe("remote");
    expect(runtime.plugins?.registry.ui?.entry).toContain("mf-manifest.json");
  });

  it("includes plugin ui with integrity when configured", async () => {
    const config = makeBosConfig({
      plugins: {
        registry: {
          development: "local:plugins/registry",
          production: "https://registry.test.dev",
          name: "registry",
          integrity: "sha384-abc",
          app: {
            api: {
              name: "registry",
              production: "https://registry.test.dev",
            },
            ui: {
              name: "registry-ui",
              production: "https://registry-ui.test.dev",
              integrity: "sha384-xyz",
            },
          },
        } as any,
      },
    });

    const pluginRuntime = await buildRuntimePluginsForConfig(config, baseDir, "production" as BosEnv);
    const runtime = buildRuntimeConfig(config, baseDir, "production" as BosEnv, {
      plugins: pluginRuntime,
    });

    expect(runtime.plugins?.registry.ui).toBeDefined();
    expect(runtime.plugins?.registry.ui?.integrity).toBe("sha384-xyz");
    expect(runtime.plugins?.registry.integrity).toBe("sha384-abc");
  });

  it("resolves plugin ui in development mode with local path", async () => {
    const config = makeBosConfig({
      plugins: {
        registry: {
          development: "local:plugins/registry",
          production: "https://registry.test.dev",
          name: "registry",
          app: {
            api: {
              name: "registry",
              development: "local:.",
            },
            ui: {
              name: "registry-ui",
              development: "local:./ui",
            },
          },
        } as any,
      },
    });

    const pluginRuntime = await buildRuntimePluginsForConfig(config, baseDir, "development" as BosEnv);
    const runtime = buildRuntimeConfig(config, baseDir, "development" as BosEnv, {
      plugins: pluginRuntime,
    });

    expect(runtime.plugins?.registry.ui).toBeDefined();
    expect(runtime.plugins?.registry.ui?.name).toBe("registry-ui");
  });

  it("does not populate plugin ui when app.ui is absent", async () => {
    const config = makeBosConfig({
      plugins: {
        registry: {
          development: "local:plugins/registry",
          production: "https://registry.test.dev",
          name: "registry",
        } as any,
      },
    });

    const pluginRuntime = await buildRuntimePluginsForConfig(config, baseDir, "production" as BosEnv);
    const runtime = buildRuntimeConfig(config, baseDir, "production" as BosEnv, {
      plugins: pluginRuntime,
    });

    expect(runtime.plugins?.registry.ui).toBeUndefined();
  });
});
