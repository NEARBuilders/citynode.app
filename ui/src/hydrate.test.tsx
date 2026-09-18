// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bootstrap = vi.hoisted(() => ({
  config: { hostUrl: "https://example.test", rpcBase: "/api" },
  routerLoads: 0,
  createRouter: vi.fn(() => ({ router: {} })),
  render: vi.fn(),
  hydrateRoot: vi.fn(),
}));

vi.mock("./app", () => ({
  getRuntimeConfig: () => bootstrap.config,
  getCspNonce: () => "test-nonce",
  createApiClient: vi.fn(),
  createAuthClient: vi.fn(),
}));
vi.mock("./router", () => {
  bootstrap.routerLoads++;
  return {
    createRouter: bootstrap.createRouter,
    routeTree: { options: { id: "/__test__root__" } },
  };
});
vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: bootstrap.render }),
  hydrateRoot: bootstrap.hydrateRoot,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  bootstrap.routerLoads = 0;
  bootstrap.config = { hostUrl: "https://example.test", rpcBase: "/api" };
  delete window.__EVERYTHING_DEV_HYDRATE_PROMISE__;
  delete window.__EVERYTHING_DEV_SSR__;
  document.documentElement.removeAttribute("data-everything-ssr");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("client bootstrap", () => {
  it("rejects missing config before loading the router and can retry", async () => {
    bootstrap.config.hostUrl = "";
    const { hydrate } = await import("./hydrate");

    await expect(hydrate()).rejects.toThrow("Missing hostUrl or rpcBase");
    expect(bootstrap.routerLoads).toBe(0);
    expect(bootstrap.createRouter).not.toHaveBeenCalled();
    expect(window.__EVERYTHING_DEV_HYDRATE_PROMISE__).toBeUndefined();

    bootstrap.config.hostUrl = "https://example.test";
    await hydrate();
    expect(bootstrap.createRouter).toHaveBeenCalledOnce();
    expect(bootstrap.render).toHaveBeenCalledOnce();
  });

  it("shares concurrent bootstrap calls and preserves CSR rendering", async () => {
    const { hydrate } = await import("./hydrate");
    await Promise.all([hydrate(), hydrate()]);
    expect(bootstrap.createRouter).toHaveBeenCalledOnce();
    expect(bootstrap.render).toHaveBeenCalledOnce();
    expect(bootstrap.hydrateRoot).not.toHaveBeenCalled();
  });

  it("hydrates the document when the host marks it as server rendered", async () => {
    document.documentElement.setAttribute("data-everything-ssr", "");
    const { hydrate } = await import("./hydrate");
    await hydrate();
    expect(bootstrap.hydrateRoot).toHaveBeenCalledWith(document, expect.anything());
    expect(bootstrap.render).not.toHaveBeenCalled();
  });
});
