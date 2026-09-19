import { Effect } from "effect";
import { ClientRuntimeConfigSchema } from "everything-dev";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRuntimeClientConfig,
  type RuntimeConfig,
  resolveActiveRuntime,
} from "../../src/services/config";
import { pluginsWithUi, uiComposeDigest } from "../../src/services/ui-compose";

const { composePluginTrees, resetUiComposeCache } = await import("../../src/services/ui-compose");

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

  it("changes when a plugin ssr target is re-deployed without touching the client bundle", () => {
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
          ssrIntegrity: "sha384-ssr-a",
        } as never,
      } as never,
    };
    const base = uiComposeDigest(config);

    const bumped = structuredClone(config);
    (bumped.plugins!.auth.ui as { ssrIntegrity: string }).ssrIntegrity = "sha384-ssr-b";
    expect(uiComposeDigest(bumped)).not.toBe(base);
  });

  it("digests identically over the client config the browser receives", () => {
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
          integrity: "sha384-auth-ui",
          ssrUrl: "https://cdn.example.com/auth-ui-ssr",
          ssrIntegrity: "sha384-a",
        } as never,
      } as never,
    };
    const clientConfig = buildRuntimeClientConfig(
      config,
      new Request("https://linktree.com/"),
      resolveActiveRuntime(config, new Request("https://linktree.com/")),
      false,
    );

    const { computeConfigComposeDigest } =
      require("everything-dev/ui/compose") as typeof import("everything-dev/ui/compose");
    const clientDigest = computeConfigComposeDigest(ClientRuntimeConfigSchema.parse(clientConfig));
    expect(uiComposeDigest(config)).toBe(clientDigest);
  });
});

describe("composePluginTrees", () => {
  const composeMocks = vi.hoisted(() => ({
    composeApp: vi.fn(),
    loadPluginUiTree: vi.fn(),
  }));

  vi.mock("everything-dev/ui/compose", async (importOriginal) => {
    const actual = await importOriginal<typeof import("everything-dev/ui/compose")>();
    return { ...actual, composeApp: composeMocks.composeApp };
  });

  vi.mock("../../src/services/federation.server", () => ({
    loadPluginUiTree: (...args: unknown[]) => composeMocks.loadPluginUiTree(...args),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    resetUiComposeCache();
  });

  function configWithPlugin(): RuntimeConfig {
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
    return config;
  }

  const coreTree = { id: "core-tree" } as never;
  const grafted = { id: "grafted-tree" } as never;

  it("serves the composed tree from the digest cache until the digest changes", async () => {
    composeMocks.loadPluginUiTree.mockImplementation(() => Effect.succeed({ id: "plugin-tree" }));
    composeMocks.composeApp.mockReturnValue({
      routeTree: grafted,
      mountCounts: { dashboard: 1 },
      nav: { items: [] },
      warnings: [],
    });

    const config = configWithPlugin();
    const first = await Effect.runPromise(composePluginTrees({ coreTree, config }));
    const second = await Effect.runPromise(
      composePluginTrees({ coreTree: { id: "reloaded" } as never, config }),
    );

    expect(first.composed?.routeTree).toBe(grafted);
    expect(composeMocks.loadPluginUiTree).toHaveBeenCalledTimes(1);
    expect(composeMocks.composeApp).toHaveBeenCalledTimes(1);
    expect(second.composed).toBe(first.composed);
    expect(second.composed?.routeTree).toBe(grafted);
  });

  it("recomposes in local dev so hot-reloaded core trees are picked up", async () => {
    composeMocks.loadPluginUiTree.mockImplementation(() => Effect.succeed({ id: "plugin-tree" }));
    composeMocks.composeApp
      .mockReturnValueOnce({
        routeTree: grafted,
        mountCounts: {},
        nav: { items: [] },
        warnings: [],
      })
      .mockReturnValueOnce({
        routeTree: { id: "graft-2" } as never,
        mountCounts: {},
        nav: { items: [] },
        warnings: [],
      });

    const localConfig = {
      ...configWithPlugin(),
      ui: { ...createBaseRuntimeConfig().ui, source: "local" },
    } as RuntimeConfig;
    const first = await Effect.runPromise(composePluginTrees({ coreTree, config: localConfig }));
    const second = await Effect.runPromise(composePluginTrees({ coreTree, config: localConfig }));

    expect(composeMocks.composeApp).toHaveBeenCalledTimes(2);
    expect(second.composed?.routeTree).not.toBe(first.composed?.routeTree);
  });

  it("digest change invalidates the cached composition", async () => {
    composeMocks.loadPluginUiTree.mockImplementation(() => Effect.succeed({ id: "plugin-tree" }));
    composeMocks.composeApp
      .mockReturnValueOnce({
        routeTree: grafted,
        mountCounts: {},
        nav: { items: [] },
        warnings: [],
      })
      .mockReturnValueOnce({
        routeTree: { id: "graft-2" } as never,
        mountCounts: {},
        nav: { items: [] },
        warnings: [],
      });

    const config = configWithPlugin();
    await Effect.runPromise(composePluginTrees({ coreTree, config }));

    const bumped = structuredClone(config);
    (bumped.plugins!.auth.ui as { ssrIntegrity: string }).ssrIntegrity = "sha384-rebuilt";
    const second = await Effect.runPromise(
      composePluginTrees({ coreTree: { id: "new-core" } as never, config: bumped }),
    );

    expect(composeMocks.composeApp).toHaveBeenCalledTimes(2);
    expect(second.composed?.digest).not.toBe(
      (await Effect.runPromise(composePluginTrees({ coreTree, config }))).composed?.digest,
    );
  });
});
