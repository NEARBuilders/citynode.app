import { Effect } from "effect";
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
  composeUi: vi.fn(),
  composeClientPayload: vi.fn(),
  isSsrAvailable: vi.fn(),
  renderClientShell: vi.fn((..._args: unknown[]) => new Response("shell", { status: 200 })),
  createPluginsClient: vi.fn(() => ({})),
}));

vi.mock("../../src/services/tenant-runtime", () => ({
  resolveRequestRuntime: mocks.resolveRequestRuntime,
  getTenantRuntimeErrorResponse: mocks.getTenantRuntimeErrorResponse,
  TenantRuntimeError: mocks.TenantRuntimeError,
}));

vi.mock("../../src/services/ui-compose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/ui-compose")>();
  return {
    ...actual,
    composeUi: mocks.composeUi,
    composeClientPayload: mocks.composeClientPayload,
    isSsrAvailable: mocks.isSsrAvailable,
  };
});

vi.mock("../../src/routes/html", () => ({
  renderClientShell: mocks.renderClientShell,
}));

vi.mock("../../src/services/plugins", () => ({
  createPluginsClient: mocks.createPluginsClient,
}));

const { createSsrRender, isSsrAvailable } = await import("../../src/services/ssr-render");

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

const composedVariant = () => ({
  routerModule: {
    renderToStream: vi.fn(() => ({
      stream: "stream",
      statusCode: 200,
      headers: { "x-render": "1" },
    })),
  },
  routeTree: { id: "composed-tree" },
  digest: "digest-1",
  nav: { items: [] },
  clientPayload: {
    digest: "digest-1",
    remotes: [
      { key: "auth", name: "auth-ui", entry: "https://cdn.example.com/auth-ui/remoteEntry.js" },
    ],
    manifests: [],
  },
});

const clientCompose = () => {
  const variant = composedVariant();
  return { digest: variant.digest, clientPayload: variant.clientPayload };
};

describe("createSsrRender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.renderClientShell.mockImplementation(() => new Response("shell", { status: 200 }));
    mocks.isSsrAvailable.mockReturnValue(true);
    mocks.resolveRequestRuntime.mockResolvedValue({
      config: createConfig(),
      tenantAccountId: null,
      gatewayId: "linktree.com",
      ssrAllowed: true,
    });
    mocks.composeUi.mockImplementation(() => Effect.succeed(composedVariant()));
    mocks.composeClientPayload.mockImplementation(() => Effect.succeed(clientCompose()));
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

  it("serves the CSR shell with a compose payload when the tenant stripped its own SSR", async () => {
    mocks.isSsrAvailable.mockReturnValue(false);

    const render = createSsrRender({ config: createConfig(), plugins });
    const response = await render(request(), renderContext());

    expect(mocks.composeUi).not.toHaveBeenCalled();
    expect(mocks.composeClientPayload).toHaveBeenCalledTimes(1);
    expect(mocks.renderClientShell).toHaveBeenCalledTimes(1);
    const shellConfig = mocks.renderClientShell.mock.calls[0]![2] as {
      ui?: { compose?: unknown };
    };
    expect(shellConfig.ui?.compose).toEqual(
      expect.objectContaining({ digest: "digest-1", remotes: expect.any(Array) }),
    );
    expect(response.status).toBe(200);
  });

  it("serves the core-only CSR shell when the client compose payload fails", async () => {
    mocks.isSsrAvailable.mockReturnValue(false);
    mocks.composeClientPayload.mockImplementation(() => Effect.fail(new Error("manifest down")));

    const render = createSsrRender({ config: createConfig(), plugins });
    const response = await render(request(), renderContext());

    expect(mocks.renderClientShell).toHaveBeenCalledTimes(1);
    const shellConfig = mocks.renderClientShell.mock.calls[0]![2] as {
      ui?: { compose?: unknown };
    };
    expect(shellConfig.ui?.compose).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it("renders the composed tree to a stream and applies the CSP header once", async () => {
    const variant = composedVariant();
    mocks.composeUi.mockImplementation(() => Effect.succeed(variant));

    const req = request();
    const render = createSsrRender({ config: createConfig(), plugins });
    const response = await render(req, renderContext());

    expect(mocks.composeUi).toHaveBeenCalledWith(
      expect.objectContaining({ ui: expect.anything() }),
    );
    expect(response.headers.get("x-render")).toBe("1");
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'self'");
    expect(variant.routerModule.renderToStream).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        session: { session: { userId: "u1" }, user: { id: "u1" } },
        cspNonce: "nonce-1",
        routeTree: { id: "composed-tree" },
        pluginNav: { items: [] },
      }),
    );
  });

  it("fails LOUD with a 500 when composition fails — never a silent wrong-tree render", async () => {
    mocks.composeUi.mockImplementation(() => Effect.fail(new Error("compose down")));

    const render = createSsrRender({ config: createConfig(), plugins });
    const response = await render(request(), renderContext());

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("SSR composition failed");
    expect(mocks.renderClientShell).not.toHaveBeenCalled();
  });

  it("falls back to the shell when streaming itself fails", async () => {
    const variant = composedVariant();
    variant.routerModule.renderToStream = vi.fn(() => {
      throw new Error("stream blew up");
    });
    mocks.composeUi.mockImplementation(() => Effect.succeed(variant));

    const render = createSsrRender({ config: createConfig(), plugins });
    await render(request(), renderContext());

    expect(mocks.renderClientShell).toHaveBeenCalledWith(
      "nonce-1",
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ message: "stream blew up" }),
      "default-src 'self'",
      expect.any(String),
    );
  });
});

describe("isSsrAvailable", () => {
  it("requires a production SSR entry, or a local core ui with --ssr requested", async () => {
    const actual = await vi.importActual<typeof import("../../src/services/ui-compose")>(
      "../../src/services/ui-compose",
    );
    const real = actual.isSsrAvailable;
    const wasSsr = process.env.BOS_SSR;
    try {
      const remoteOnly = createConfig();
      (remoteOnly.ui as { ssrUrl?: string }).ssrUrl = undefined;
      expect(real(remoteOnly)).toBe(false);

      const withSsr = createConfig();
      expect(real(withSsr)).toBe(true);

      const localCore = createConfig();
      (localCore.ui as { ssrUrl?: string; source?: string }).ssrUrl = undefined;
      (localCore.ui as { source?: string }).source = "local";
      delete process.env.BOS_SSR;
      expect(real(localCore)).toBe(false);

      process.env.BOS_SSR = "1";
      expect(real(localCore)).toBe(true);
    } finally {
      if (wasSsr === undefined) delete process.env.BOS_SSR;
      else process.env.BOS_SSR = wasSsr;
    }
    void isSsrAvailable;
  });
});
