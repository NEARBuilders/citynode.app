// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouterContext } from "@/app";
import { render } from "@/i18n/test-render";
import { Route } from "./$tenantId";

const TENANT_ID = "00000000-0000-4000-8000-000000000071";
const NODE_ID = "00000000-0000-4000-8000-000000000072";
const GATEWAY_ID = "citynode.app";
const ORG_ID = "org-tenant-1";
const USER_ID = "user-tenant-1";

vi.mock("../dashboard/node/-community-header", () => ({
  CommunityHeader: () => <div data-testid="community-header" />,
  ensureCommunityHeaderData: vi.fn(async () => undefined),
}));

vi.mock("./-tenant-profile", () => ({
  TenantProfile: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="tenant.section.profile">{nodeId}</div>
  ),
}));

vi.mock("./-node-validators", () => ({
  TenantNodeValidators: ({ tenantId }: { tenantId: string }) => (
    <div data-testid="tenant-node-validators">{tenantId}</div>
  ),
}));

vi.mock("@/components/connect-dao", () => ({
  ConnectDao: () => null,
}));

vi.mock("@/components/enable-gasless-writes", () => ({
  EnableGaslessWrites: () => null,
}));

vi.mock("@/lib/dao-connect", () => ({
  useDaoConnection: () => ({ status: "idle", daoAccountId: null }),
}));

vi.mock("@/lib/use-near-account", () => ({
  useNearAccount: () => "wallet.near",
}));

vi.mock("@/lib/tenant-deploy", () => ({
  publishTenantConfigForMode: vi.fn(async () => undefined),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

type Tenant = {
  id: string;
  accountId: string;
  orgId: string;
  name: string;
  status: "active";
  ownerKind: "platform";
  allowUiOverrides: boolean;
  allowBackendOverrides: boolean;
  allowSsr: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
};

function makeTenant(name = "Harbor"): Tenant {
  return {
    id: TENANT_ID,
    accountId: "community.near",
    orgId: ORG_ID,
    name,
    status: "active",
    ownerKind: "platform",
    allowUiOverrides: true,
    allowBackendOverrides: false,
    allowSsr: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

const runtimeConfig: RouterContext["runtimeConfig"] = {
  env: "development",
  account: "base.near",
  networkId: "mainnet",
  assetsUrl: "http://localhost/assets",
  apiBase: "/api",
  rpcBase: "/api/rpc",
  hostUrl: "http://localhost",
  runtime: {
    accountId: "base.near",
    gatewayId: GATEWAY_ID,
    runtimeBasePath: "/",
    title: "City Nodes",
    description: "",
    hostUrl: "http://localhost",
  },
};

const api = vi.hoisted(() => ({
  tenant: null as Tenant | null,
  listNodes: vi.fn(),
  listTenantBindingsForTenant: vi.fn(),
  updateTenant: vi.fn(),
}));

function installApi() {
  api.tenant = makeTenant();
  api.listNodes.mockImplementation(async ({ tenantId }: { tenantId: string }) => {
    if (tenantId !== TENANT_ID) throw new Error(`listNodes ${tenantId}`);
    return [
      {
        id: NODE_ID,
        parentId: null,
        tenantId: TENANT_ID,
        slug: "harbor",
        name: "Harbor",
        kind: "city",
        metadata: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
  });
  api.listTenantBindingsForTenant.mockImplementation(async ({ tenantId }: { tenantId: string }) => {
    if (tenantId !== TENANT_ID) throw new Error(`bindings ${tenantId}`);
    return [
      {
        id: "00000000-0000-4000-8000-000000000073",
        tenantId: TENANT_ID,
        hostname: "harbor.citynode.app",
        isPrimary: true,
        isVerified: true,
        verificationToken: "token",
        verifiedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
  });
  api.updateTenant.mockImplementation(
    async ({ tenantId, name }: { tenantId: string; name: string }) => {
      if (tenantId !== TENANT_ID) throw new Error(`updateTenant ${tenantId}`);
      api.tenant = makeTenant(name);
      return api.tenant;
    },
  );
}

const apiClient = {
  listTenants: vi.fn(async () => (api.tenant ? [api.tenant] : [])),
  resolveTenant: vi.fn(async ({ accountId }: { accountId: string }) =>
    accountId === "community.near" && api.tenant ? { id: api.tenant.id } : null,
  ),
  resolveBindingByHostname: vi.fn(async () => null),
  resolveNodeBySlug: vi.fn(async ({ slug }: { slug: string }) =>
    slug === "harbor" && api.tenant ? { tenantId: api.tenant.id } : null,
  ),
  listNodes: api.listNodes,
  listTenantBindingsForTenant: api.listTenantBindingsForTenant,
  updateTenant: api.updateTenant,
  getNode: vi.fn(async () => null),
  auth: {
    listOrganizations: vi.fn(async () => []),
    getContext: vi.fn(async () => null),
  },
};

const authClient = {
  getSession: vi.fn(async () => ({
    data: { user: { id: USER_ID, role: "user" } },
    error: null,
  })),
  organization: {
    listMembers: vi.fn(async () => ({
      data: { members: [{ userId: USER_ID, role: "owner" }] },
      error: null,
    })),
  },
};

async function openSettings(key: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const context = {
    apiClient,
    queryClient,
    runtimeConfig,
    authClient,
    auth: { activeOrganizationId: ORG_ID },
  };
  const root = createRootRouteWithContext<typeof context>()({ component: Outlet });
  const settingsOptions = {
    ...Route.options,
    getParentRoute: () => root,
    path: "/tenant/$tenantId",
    id: undefined,
  };
  const settings = Route.update(settingsOptions);
  const dashboard = createRoute({
    getParentRoute: () => root,
    path: "/dashboard",
    component: () => <div data-testid="dashboard" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([settings, dashboard]),
    history: createMemoryHistory({ initialEntries: [`/tenant/${key}`] }),
    context,
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  installApi();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("community settings tenant id", () => {
  it.each([
    ["id", TENANT_ID],
    ["slug", "harbor"],
    ["account name", "community.near"],
  ] as const)("loads and renames through the %s", async (_label, key) => {
    await openSettings(key);

    expect(await screen.findByText("Harbor")).toBeTruthy();
    expect(screen.getByTestId("tenant.section.profile").textContent).toBe(NODE_ID);
    expect(screen.getByTestId("tenant-node-validators").textContent).toBe(TENANT_ID);
    const nodeIds = api.listNodes.mock.calls.map((call) => call[0].tenantId);
    const bindingIds = api.listTenantBindingsForTenant.mock.calls.map((call) => call[0].tenantId);
    expect(nodeIds.length).toBeGreaterThan(0);
    expect(bindingIds.length).toBeGreaterThan(0);
    expect(nodeIds.every((tenantId) => tenantId === TENANT_ID)).toBe(true);
    expect(bindingIds.every((tenantId) => tenantId === TENANT_ID)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Community name" }), {
      target: { value: "Renamed Harbor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateTenant).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        name: "Renamed Harbor",
      }),
    );
    expect(await screen.findByText("Renamed Harbor")).toBeTruthy();
  });

  it("redirects an unknown key before loading settings", async () => {
    const router = await openSettings("missing");

    expect(await screen.findByTestId("dashboard")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/dashboard");
    expect(api.listNodes).not.toHaveBeenCalled();
    expect(api.listTenantBindingsForTenant).not.toHaveBeenCalled();
    expect(api.updateTenant).not.toHaveBeenCalled();
  });
});
