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
        apps: {
          development: "local:plugins/apps",
          production: "https://apps.test.dev",
          name: "apps",
        } as any,
      },
    });

    const pluginRuntime = await buildRuntimePluginsForConfig(
      config,
      baseDir,
      "production" as BosEnv,
    );
    const runtime = buildRuntimeConfig(config, baseDir, "production" as BosEnv, {
      plugins: pluginRuntime,
    });

    expect(runtime.plugins?.apps).toBeDefined();
    expect(runtime.plugins?.apps.name).toBe("apps");
    expect(runtime.plugins?.apps.url).toContain("apps.test.dev");
    expect(runtime.plugins?.apps.ui).toBeUndefined();
  });

  it("populates plugin ui when app.ui is present in plugin config", async () => {
    const config = makeBosConfig({
      plugins: {
        apps: {
          development: "local:plugins/apps",
          production: "https://apps.test.dev",
          name: "apps",
          app: {
            api: {
              name: "apps",
              development: "local:.",
              production: "https://apps.test.dev",
            },
            ui: {
              name: "apps-ui",
              development: "local:./ui",
              production: "https://apps-ui.test.dev",
            },
          },
        } as any,
      },
    });

    const pluginRuntime = await buildRuntimePluginsForConfig(
      config,
      baseDir,
      "production" as BosEnv,
    );
    const runtime = buildRuntimeConfig(config, baseDir, "production" as BosEnv, {
      plugins: pluginRuntime,
    });

    expect(runtime.plugins?.apps.ui).toBeDefined();
    expect(runtime.plugins?.apps.ui?.name).toBe("apps-ui");
    expect(runtime.plugins?.apps.ui?.url).toContain("apps-ui.test.dev");
    expect(runtime.plugins?.apps.ui?.source).toBe("remote");
    expect(runtime.plugins?.apps.ui?.entry).toContain("mf-manifest.json");
  });

  it("includes plugin ui with integrity when configured", async () => {
    const config = makeBosConfig({
      plugins: {
        apps: {
          development: "local:plugins/apps",
          production: "https://apps.test.dev",
          name: "apps",
          integrity: "sha384-abc",
          app: {
            api: {
              name: "apps",
              production: "https://apps.test.dev",
            },
            ui: {
              name: "apps-ui",
              production: "https://apps-ui.test.dev",
              integrity: "sha384-xyz",
            },
          },
        } as any,
      },
    });

    const pluginRuntime = await buildRuntimePluginsForConfig(
      config,
      baseDir,
      "production" as BosEnv,
    );
    const runtime = buildRuntimeConfig(config, baseDir, "production" as BosEnv, {
      plugins: pluginRuntime,
    });

    expect(runtime.plugins?.apps.ui).toBeDefined();
    expect(runtime.plugins?.apps.ui?.integrity).toBe("sha384-xyz");
    expect(runtime.plugins?.apps.integrity).toBe("sha384-abc");
  });

  it("resolves plugin ui in development mode with local path", async () => {
    const config = makeBosConfig({
      plugins: {
        apps: {
          development: "local:plugins/apps",
          production: "https://apps.test.dev",
          name: "apps",
          app: {
            api: {
              name: "apps",
              development: "local:.",
            },
            ui: {
              name: "apps-ui",
              development: "local:./ui",
            },
          },
        } as any,
      },
    });

    const pluginRuntime = await buildRuntimePluginsForConfig(
      config,
      baseDir,
      "development" as BosEnv,
    );
    const runtime = buildRuntimeConfig(config, baseDir, "development" as BosEnv, {
      plugins: pluginRuntime,
    });

    expect(runtime.plugins?.apps.ui).toBeDefined();
    expect(runtime.plugins?.apps.ui?.name).toBe("apps-ui");
  });

  it("does not populate plugin ui when app.ui is absent", async () => {
    const config = makeBosConfig({
      plugins: {
        apps: {
          development: "local:plugins/apps",
          production: "https://apps.test.dev",
          name: "apps",
        } as any,
      },
    });

    const pluginRuntime = await buildRuntimePluginsForConfig(
      config,
      baseDir,
      "production" as BosEnv,
    );
    const runtime = buildRuntimeConfig(config, baseDir, "production" as BosEnv, {
      plugins: pluginRuntime,
    });

    expect(runtime.plugins?.apps.ui).toBeUndefined();
  });
});
