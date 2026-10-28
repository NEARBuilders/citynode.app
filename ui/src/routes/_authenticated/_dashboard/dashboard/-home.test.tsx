// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { Route as HomeRoute } from "./index";
import { Route as CommunityRoute } from "./node";

const harness = vi.hoisted(() => ({
  user: {} as Record<string, unknown>,
  activeOrganizationId: null as string | null,
  organizations: [] as { id: string; name: string; slug: string; metadata?: unknown }[],
  nodes: [] as { id: string; name: string; metadata: Record<string, unknown> }[],
  authContext: null as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => ({}),
  }),
  Link: ({
    children,
    to,
    search: _search,
    hash: _hash,
    params: _params,
    ...props
  }: {
    children?: ReactNode;
    to?: string;
    search?: unknown;
    hash?: string;
    params?: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => null,
  useRouterState: () => "/dashboard",
}));

const api = {
  auth: {
    listOrganizations: async () => harness.organizations,
    listUserInvitations: async () => [],
    getContext: async () => harness.authContext,
  },
  resolveTenantByOrgId: async ({ orgId }: { orgId: string }) => ({
    id: "tenant-1",
    orgId,
    name: "Example Community",
  }),
  listNodes: async () => harness.nodes,
  getNodeSummary: async () => ({
    stakingValidators: { sourceNodeId: "", validators: [] },
    validators: [],
    children: [],
  }),
  getNode: async () => null,
  getDiscoveryNode: async () => null,
};

vi.mock("@/app", () => ({
  sessionQueryOptions: () => ({
    queryKey: ["session"],
    queryFn: async () => ({
      user: harness.user,
      session: { activeOrganizationId: harness.activeOrganizationId },
    }),
  }),
  useAuthClient: () => ({
    passkey: { listUserPasskeys: async () => ({ data: [{ id: "passkey-1" }] }) },
  }),
  useApiClient: () => api,
  pluginPath: (path: string) => path,
}));

vi.mock("@/lib/use-near-account", () => ({ useNearAccount: () => null }));

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  harness.user = {};
  harness.activeOrganizationId = null;
  harness.organizations = [];
  harness.nodes = [];
  harness.authContext = null;
});

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const Home = (HomeRoute as unknown as { options: { component: ComponentType } }).options
    .component;
  render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>,
  );
}

async function loadCommunity(nodeId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  const beforeLoad = (
    CommunityRoute as unknown as {
      options: {
        beforeLoad: (args: unknown) => Promise<{ selectedNode: { id: string } | null }>;
      };
    }
  ).options.beforeLoad;
  return beforeLoad({
    context: {
      apiClient: api,
      queryClient,
      auth: {
        activeOrganizationId: harness.activeOrganizationId,
        user: { role: "user" },
      },
    },
    search: { nodeId },
  });
}

const node = (id: string, name: string) => ({
  id,
  name,
  metadata: { bulletin: `Bulletin for ${name} ${id}` },
});

describe("Home and My community pick the same node", () => {
  it("default to the first node by name, with the ID breaking a tie", async () => {
    harness.user = { id: "user-1", name: "Member", email: "member@example.com" };
    harness.activeOrganizationId = "org-1";
    harness.organizations = [{ id: "org-1", name: "Example Community", slug: "example" }];
    harness.nodes = [node("node-c", "Lagos"), node("node-b", "Berlin"), node("node-a", "Berlin")];

    const overview = await loadCommunity();
    expect(overview.selectedNode?.id).toBe("node-a");

    renderHome();
    expect(await screen.findByText("Bulletin for Berlin node-a")).toBeTruthy();
    expect(screen.queryByText("Bulletin for Lagos node-c")).toBeNull();
  });

  it("lets My community honor an explicit node while Home keeps the default", async () => {
    harness.activeOrganizationId = "org-1";
    harness.nodes = [node("node-c", "Lagos"), node("node-a", "Berlin")];
    expect((await loadCommunity("node-c")).selectedNode?.id).toBe("node-c");
    expect((await loadCommunity("missing")).selectedNode?.id).toBe("node-a");
  });
});
