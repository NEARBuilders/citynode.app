import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../../src/services/config";
import type { PluginResult } from "../../src/services/plugins";

const mocks = vi.hoisted(() => ({
  resolveRequestRuntime: vi.fn(),
  getTenantRuntimeErrorResponse: vi.fn((error: { status?: number; message?: string }) => ({
    status: error.status ?? 500,
    message: error.message ?? String(error),
  })),
  TenantRuntimeError: class TenantRuntimeError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  loadRouterModule: vi.fn(),
  composePluginTrees: vi.fn(),
  hasComposablePluginUi: vi.fn(),
  renderClientShell: vi.fn(() => new Response("shell", { status: 200 })),
  createPluginsClient: vi.fn(() => ({})),
}));

vi.mock("../../src/services/tenant-runtime", () => ({
  resolveRequestRuntime: mocks.resolveRequestRuntime,
  getTenantRuntimeErrorResponse: mocks.getTenantRuntimeErrorResponse,
  TenantRuntimeError: mocks.TenantRuntimeError,
}));

vi.mock("../../src/services/federation.server", () => ({
  loadRouterModule: mocks.loadRouterModule,
}));

vi.mock("../../src/services/ui-compose", () => ({
  composePluginTrees: mocks.composePluginTrees,
  hasComposablePluginUi: mocks.hasComposablePluginUi,
}));

vi.mock("../../src/routes/html", () => ({
  renderClientShell: mocks.renderClientShell,
}));

vi.mock("../../src/services/plugins", () => ({
  createPluginsClient: mocks.createPluginsClient,
}));

const { createSsrRender, isUiCompositionReady } = await import("../../src/services/ssr-render");

function createConfig(): RuntimeConfig {
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
      url: "https://cdn.example.com/ui",
      entry: "https://cdn.example.com/ui/mf-manifest.json",
      source: "remote",
      integrity: "sha384-ui",
      ssrUrl: "https://cdn.example.com/ui-ssr",
      ssrIntegrity: "sha384-ui-ssr",
    },
    api: {
      name: "api",
      url: "https://api.example.com",
      entry: "https://api.example.com/mf-manifest.json",
      source: "remote",
    },
  } as unknown as RuntimeConfig;
}

const plugins = {
  auth: null,
} as unknown as PluginResult;

const request = () => new Request("https://linktree.com/some-page");
const renderContext = () => ({
  session: { userId: "u1" },
  user: { id: "u1" },
  pluginContext: { "effect/context": "stub" },
  cspNonce: "nonce-1",
  cspHeader: "default-src 'self'",
});

describe("createSsrRender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BOS_UI_COMPOSE;
    mocks.renderClientShell.mockImplementation(() => new Response("shell", { status: 200 }));
    mocks.resolveRequestRuntime.mockResolvedValue({
      config: createConfig(),
      tenantAccountId: null,
      gatewayId: "linktree.com",
      ssrAllowed: true,
    });
  });

  it("turns tenant runtime errors into status responses through the interface", async () => {
    mocks.resolveRequestRuntime.mockRejectedValue(
      new mocks.TenantRuntimeError("Tenant is suspended", 503),
    );

    const response = await createSsrRender({ config: createConfig(), plugins })(
      request(),
      renderContext(),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Tenant is suspended");
    expect(response.headers.get("content-type")).toContain("text/plain");
  });

  it("falls back to the client shell when the tenant stripped its own SSR", async () => {
    const strippedConfig = createConfig();
    (strippedConfig.ui as { ssrUrl?: string }).ssrUrl = undefined;
    mocks.resolveRequestRuntime.mockResolvedValue({
      config: strippedConfig,
      tenantAccountId: "tenant.near",
      gatewayId: "linktree.com",
      ssrAllowed: false,
    });

    const render = createSsrRender({ config: createConfig(), plugins });
    const response = await render(request(), renderContext());

    expect(mocks.loadRouterModule).not.toHaveBeenCalled();
    expect(mocks.renderClientShell).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  it("renders to a stream and applies the CSP header once", async () => {
    const { Effect } = await import("effect");
    const req = request();
    const ssrModule = {
      renderToStream: vi.fn(() => ({
        stream: "stream",
        statusCode: 200,
        headers: { "x-render": "1" },
      })),
      routeTree: {},
    };
    mocks.loadRouterModule.mockReturnValue(Effect.succeed(ssrModule));
    mocks.composePluginTrees.mockImplementation(() =>
      Effect.succeed({
        composed: { routeTree: {}, nav: { items: [] } },
        warnings: [],
      }),
    );

    const render = createSsrRender({ config: createConfig(), plugins });
    const response = await render(req, renderContext());

    expect(mocks.loadRouterModule).toHaveBeenCalledWith(
      expect.objectContaining({ ui: expect.anything() }),
    );
    expect(mocks.composePluginTrees).toHaveBeenCalledTimes(0);
    expect(response.headers.get("x-render")).toBe("1");
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'self'");
    expect(ssrModule.renderToStream).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        session: { session: { userId: "u1" }, user: { id: "u1" } },
        cspNonce: "nonce-1",
      }),
    );
  });

  it("falls back to the shell with the load error when the router module fails", async () => {
    const { Effect } = await import("effect");
    mocks.loadRouterModule.mockReturnValue(Effect.fail(new Error("remote down")));

    const render = createSsrRender({ config: createConfig(), plugins });
    await render(request(), renderContext());

    expect(mocks.renderClientShell).toHaveBeenCalledWith(
      "nonce-1",
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ message: "remote down" }),
      "default-src 'self'",
    );
  });
});

describe("isUiCompositionReady", () => {
  it("requires both the env flag and a composable plugin set", () => {
    mocks.hasComposablePluginUi.mockReturnValue(false);
    expect(isUiCompositionReady(createConfig())).toBe(false);

    mocks.hasComposablePluginUi.mockReturnValue(true);
    const { BOS_UI_COMPOSE: composed, ...env } = process.env;
    delete process.env.BOS_UI_COMPOSE;
    expect(isUiCompositionReady(createConfig())).toBe(false);

    process.env.BOS_UI_COMPOSE = "1";
    expect(isUiCompositionReady(createConfig())).toBe(true);

    if (composed === undefined) {
      delete process.env.BOS_UI_COMPOSE;
    } else {
      process.env.BOS_UI_COMPOSE = composed;
    }
    void env;
  });
});
