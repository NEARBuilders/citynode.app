import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../../src/services/config";

const loadRemoteMock = vi.fn();
const createInstanceMock = vi.fn((..._args: unknown[]) => ({
  loadRemote: loadRemoteMock,
}));
const verifySriForUrlMock = vi.fn();

vi.mock("@module-federation/enhanced/runtime", () => ({
  createInstance: createInstanceMock,
}));

vi.mock("everything-dev/integrity", () => ({
  verifySriForUrl: verifySriForUrlMock,
}));

const { loadRouterModule, resetFederationInstance } = await import(
  "../../src/services/federation.server"
);

function createRuntimeConfig(options?: {
  source?: "local" | "remote";
  ssrIntegrity?: string;
}): RuntimeConfig {
  return {
    env: "production",
    account: "linktree.near",
    networkId: "mainnet",
    host: {
      name: "host",
      url: "https://linktree.com",
      entry: "https://linktree.com/mf-manifest.json",
      source: "remote",
    },
    ui: {
      name: "ui",
      url: "https://cdn.example.com/ui",
      entry: "https://cdn.example.com/ui/mf-manifest.json",
      source: options?.source ?? "remote",
      integrity: "sha384-ui",
      ssrUrl: "https://cdn.example.com/ui-ssr",
      ssrIntegrity: options?.ssrIntegrity,
    },
    api: {
      name: "api",
      url: "https://api.example.com",
      entry: "https://api.example.com/mf-manifest.json",
      source: "remote",
    },
  } as RuntimeConfig;
}

describe("loadRouterModule cache", () => {
  beforeEach(() => {
    resetFederationInstance();
    vi.clearAllMocks();
    verifySriForUrlMock.mockResolvedValue(undefined);
  });

  it("reloads the router module when SSR integrity changes at the same url", async () => {
    const routerOne = {
      default: { renderToStream: vi.fn(), getRouteHead: vi.fn(), createRouter: vi.fn() },
    };
    const routerTwo = {
      default: { renderToStream: vi.fn(), getRouteHead: vi.fn(), createRouter: vi.fn() },
    };
    loadRemoteMock.mockResolvedValueOnce(routerOne).mockResolvedValueOnce(routerTwo);

    const first = await Effect.runPromise(
      loadRouterModule(createRuntimeConfig({ ssrIntegrity: "sha384-ssr-a" })),
    );
    const second = await Effect.runPromise(
      loadRouterModule(createRuntimeConfig({ ssrIntegrity: "sha384-ssr-b" })),
    );

    expect(first).toBe(routerOne.default);
    expect(second).toBe(routerTwo.default);
    expect(createInstanceMock).toHaveBeenCalledTimes(2);
    expect(verifySriForUrlMock).toHaveBeenNthCalledWith(
      1,
      "https://cdn.example.com/ui-ssr/remoteEntry.server.js?v=sha384-ssr-a",
      "sha384-ssr-a",
      { resolveEntryUrl: false },
    );
    expect(verifySriForUrlMock).toHaveBeenNthCalledWith(
      2,
      "https://cdn.example.com/ui-ssr/remoteEntry.server.js?v=sha384-ssr-b",
      "sha384-ssr-b",
      { resolveEntryUrl: false },
    );
  });

  it("reuses the router module when remote SSR integrity stays the same", async () => {
    const router = {
      default: { renderToStream: vi.fn(), getRouteHead: vi.fn(), createRouter: vi.fn() },
    };
    loadRemoteMock.mockResolvedValue(router);

    const first = await Effect.runPromise(
      loadRouterModule(createRuntimeConfig({ ssrIntegrity: "sha384-ssr-a" })),
    );
    const second = await Effect.runPromise(
      loadRouterModule(createRuntimeConfig({ ssrIntegrity: "sha384-ssr-a" })),
    );

    expect(first).toBe(router.default);
    expect(second).toBe(router.default);
    expect(createInstanceMock).toHaveBeenCalledTimes(1);
    expect(verifySriForUrlMock).toHaveBeenCalledTimes(1);
  });

  it("bypasses the router module cache for local ui", async () => {
    const routerOne = {
      default: { renderToStream: vi.fn(), getRouteHead: vi.fn(), createRouter: vi.fn() },
    };
    const routerTwo = {
      default: { renderToStream: vi.fn(), getRouteHead: vi.fn(), createRouter: vi.fn() },
    };
    loadRemoteMock.mockResolvedValueOnce(routerOne).mockResolvedValueOnce(routerTwo);

    const first = await Effect.runPromise(
      loadRouterModule(createRuntimeConfig({ source: "local" })),
    );
    const second = await Effect.runPromise(
      loadRouterModule(createRuntimeConfig({ source: "local" })),
    );

    expect(first).toBe(routerOne.default);
    expect(second).toBe(routerTwo.default);
    expect(createInstanceMock).toHaveBeenCalledTimes(2);
    expect(verifySriForUrlMock).not.toHaveBeenCalled();
  });

  it("bypasses the router module cache for remote ui without SSR integrity", async () => {
    const routerOne = {
      default: { renderToStream: vi.fn(), getRouteHead: vi.fn(), createRouter: vi.fn() },
    };
    const routerTwo = {
      default: { renderToStream: vi.fn(), getRouteHead: vi.fn(), createRouter: vi.fn() },
    };
    loadRemoteMock.mockResolvedValueOnce(routerOne).mockResolvedValueOnce(routerTwo);

    const first = await Effect.runPromise(loadRouterModule(createRuntimeConfig()));
    const second = await Effect.runPromise(loadRouterModule(createRuntimeConfig()));

    expect(first).toBe(routerOne.default);
    expect(second).toBe(routerTwo.default);
    expect(createInstanceMock).toHaveBeenCalledTimes(2);
    expect(verifySriForUrlMock).not.toHaveBeenCalled();
  });

  it("reuses the MF instance across cached reloads of the same remote", async () => {
    const router = {
      default: { renderToStream: vi.fn(), getRouteHead: vi.fn(), createRouter: vi.fn() },
    };
    loadRemoteMock.mockResolvedValue(router);

    const config = createRuntimeConfig({ ssrIntegrity: "sha384-ssr-a" });
    await Effect.runPromise(loadRouterModule(config));
    await Effect.runPromise(loadRouterModule({ ...config }));
    await Effect.runPromise(
      loadRouterModule({ ...config, account: "other.near" } as unknown as RuntimeConfig),
    );

    expect(createInstanceMock).toHaveBeenCalledTimes(1);
    const instanceOptions = createInstanceMock.mock.calls[0]?.[0] as { name: string } | undefined;
    expect(instanceOptions?.name).toMatch(/^host-/);
  });

  it("keeps the failing promise cached so a downed remote is probed once per window", async () => {
    loadRemoteMock.mockRejectedValue(new Error("remote down"));

    const config = createRuntimeConfig({ ssrIntegrity: "sha384-ssr-a" });

    await expect(Effect.runPromise(loadRouterModule(config))).rejects.toThrow();

    const callsAfterFirstFailure = loadRemoteMock.mock.calls.length;
    expect(callsAfterFirstFailure).toBeGreaterThan(0);

    await expect(Effect.runPromise(loadRouterModule(config))).rejects.toThrow();

    expect(loadRemoteMock.mock.calls.length).toBe(callsAfterFirstFailure);
    expect(createInstanceMock).toHaveBeenCalledTimes(1);
  });
});
