// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrgSwitcherMenuContent } from "@/components/layout/org-switcher-menu";
import { useIdentity } from "@/components/layout/use-identity";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { render } from "@/i18n/test-render";
import { Route as HomeRoute } from "./index";
import { Route as CommunityRoute } from "./node";

const harness = vi.hoisted(() => ({
  user: {} as Record<string, unknown>,
  activeOrganizationId: null as string | null,
  organizations: [] as {
    id: string;
    name: string;
    slug: string;
    status?: string;
    metadata?: unknown;
  }[],
  organizationsFail: false,
  tenants: { "org-1": "Example Community" } as Record<string, string>,
  nodes: [] as { id: string; name: string; metadata: Record<string, unknown> }[],
  authContext: null as unknown,
  attendance: { events: [], unclassified: [], communities: [] } as Record<string, unknown>,
  attendanceReads: [] as string[],
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
  useNavigate: () => async () => {},
  useRouter: () => ({ invalidate: async () => {}, navigate: async () => {} }),
}));

const api = {
  auth: {
    listOrganizations: async () => {
      if (harness.organizationsFail) throw new Error("organizations unavailable");
      return harness.organizations;
    },
    listUserInvitations: async () => [],
    getContext: async () => harness.authContext,
  },
  resolveTenantByOrgId: async ({ orgId }: { orgId: string }) => {
    const name = harness.tenants[orgId];
    if (!name) throw new Error("no tenant");
    return { id: `tenant-${orgId}`, orgId, name };
  },
  listNodes: async () => harness.nodes,
  getNodeSummary: async () => ({
    stakingValidators: { sourceNodeId: "", validators: [] },
    validators: [],
    children: [],
  }),
  getNode: async () => null,
  getDiscoveryNode: async () => null,
  getMyAttendance: async (input: { organizationId?: string }) => {
    harness.attendanceReads.push(input.organizationId ?? "all");
    return harness.attendance;
  },
};

const session = () => ({
  user: harness.user,
  session: { activeOrganizationId: harness.activeOrganizationId },
});

const setActive = vi.fn(async ({ organizationId }: { organizationId: string }) => {
  harness.activeOrganizationId = organizationId;
  return { error: null };
});

vi.mock("@/app", () => ({
  sessionQueryKey: ["session"],
  sessionQueryOptions: () => ({ queryKey: ["session"], queryFn: async () => session() }),
  clearAuthenticatedQueries: async () => {},
  useAuthClient: () => ({
    passkey: { listUserPasskeys: async () => ({ data: [{ id: "passkey-1" }] }) },
    organization: { setActive, setActiveTeam: async () => ({ error: null }) },
    getSession: async () => ({ data: session(), error: null }),
    near: { getProfile: async () => ({ data: null }), disconnect: async () => {} },
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
  harness.organizationsFail = false;
  harness.tenants = { "org-1": "Example Community" };
  harness.nodes = [];
  setActive.mockClear();
  harness.authContext = null;
  harness.attendance = { events: [], unclassified: [], communities: [] };
  harness.attendanceReads.length = 0;
});

function Switcher() {
  const { communities, activeOrgId } = useIdentity();
  return (
    <DropdownMenu open>
      <OrgSwitcherMenuContent organizations={communities} activeOrgId={activeOrgId} />
    </DropdownMenu>
  );
}

function renderHome({ withSwitcher = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const Home = (HomeRoute as unknown as { options: { component: ComponentType } }).options
    .component;
  render(
    <QueryClientProvider client={client}>
      {withSwitcher && <Switcher />}
      <Home />
    </QueryClientProvider>,
  );
}

function stepIds() {
  return [
    ...screen.getByTestId("home-next-steps").querySelectorAll("[data-testid^=home-step-]"),
  ].map((step) => step.getAttribute("data-testid")?.replace("home-step-", ""));
}

async function loadCommunity(nodeId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  const beforeLoad = (
    CommunityRoute as unknown as {
      options: {
        beforeLoad: (args: unknown) => Promise<{
          selectedNode: { id: string } | null;
          tenant: { orgId: string } | null;
          emptyReason: string | null;
          communityCount: number;
        }>;
      };
    }
  ).options.beforeLoad;
  return beforeLoad({
    context: {
      apiClient: api,
      queryClient,
      auth: {
        activeOrganizationId: harness.activeOrganizationId,
        user: { id: "user-1", role: "user" },
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
    harness.organizations = [{ id: "org-1", name: "Example Community", slug: "example" }];
    harness.nodes = [node("node-c", "Lagos"), node("node-a", "Berlin")];
    expect((await loadCommunity("node-c")).selectedNode?.id).toBe("node-c");
    expect((await loadCommunity("missing")).selectedNode?.id).toBe("node-a");
  });
});

describe("Home for a member who joined by QR", () => {
  it("leads with their community, then staking, with no email prompt anywhere", async () => {
    harness.user = { id: "user-1", name: "", email: "passkey-0a1b2c3d@example.com" };
    harness.activeOrganizationId = "org-1";
    harness.organizations = [{ id: "org-1", name: "Example Community", slug: "example" }];
    harness.nodes = [node("node-a", "Berlin")];
    renderHome();

    const first = await screen.findByTestId("home-step-open-community");
    expect(first.textContent).toContain("Open Example Community");
    const steps = [
      ...screen.getByTestId("home-next-steps").querySelectorAll("[data-testid^=home-step-]"),
    ].map((step) => step.getAttribute("data-testid"));
    expect(steps).toEqual(["home-step-open-community", "home-step-stake"]);
    expect(screen.getByTestId("home-identity").textContent).not.toMatch(/Add\b/);
    expect(screen.queryByText(/add your email/i)).toBeNull();
  });

  it("lists the events they checked in at across every community", async () => {
    harness.user = member;
    harness.activeOrganizationId = "org-1";
    harness.organizations = [{ id: "org-1", name: "Example Community", slug: "example" }];
    harness.nodes = [node("node-a", "Berlin")];
    harness.attendance = {
      events: [
        {
          organizationId: "org-2",
          communityName: "Left Community",
          eventId: "event-2",
          eventName: "Harbor meetup",
          checkedInAt: "2026-10-20T10:00:00.000Z",
          startsAt: null,
        },
      ],
      unclassified: [],
      communities: [],
    };
    renderHome();

    const row = await screen.findByTestId("home.attendance-event");
    expect(row.textContent).toContain("Harbor meetup");
    expect(row.textContent).toContain("Left Community");
    expect(harness.attendanceReads).toEqual(["all"]);
  });
});

const member = { id: "user-1", name: "", email: "passkey-0a1b2c3d@example.com" };
const personal = {
  id: "org-personal",
  name: "Personal",
  slug: "personal-space",
  status: "active",
  metadata: { isPersonal: true },
};
const harbor = { id: "org-harbor", name: "Harbor", slug: "harbor", status: "active" };
const delta = { id: "org-delta", name: "Delta", slug: "delta", status: "active" };

describe("Home without a community", () => {
  it("leads a new user whose only organization is personal with Start a community", async () => {
    harness.user = member;
    harness.activeOrganizationId = personal.id;
    harness.organizations = [personal];
    renderHome();

    expect(await screen.findByTestId("home-step-start-community")).toBeTruthy();
    expect(stepIds()).toEqual(["start-community", "stake", "explore"]);
    expect(screen.queryByText(/choose an organization/i)).toBeNull();
    expect(screen.queryByText(/organization/i)).toBeNull();
  });

  it("asks a member with a personal organization active to choose a community", async () => {
    harness.user = member;
    harness.activeOrganizationId = personal.id;
    harness.organizations = [personal, harbor];
    harness.tenants = { [harbor.id]: "Harbor" };
    renderHome();

    const choose = await screen.findByTestId("home-step-choose-org");
    expect(choose.textContent).toContain("Choose a community");
    expect(choose.textContent).toContain("You belong to 1 community.");
    expect(stepIds()).not.toContain("start-community");
    expect(setActive).not.toHaveBeenCalled();
  });

  it("opens the only community for a member who signed in again", async () => {
    harness.user = member;
    harness.activeOrganizationId = null;
    harness.organizations = [personal, harbor];
    harness.tenants = { [harbor.id]: "Harbor" };
    renderHome();

    const open = await screen.findByTestId("home-step-open-community");
    expect(open.textContent).toContain("Open Harbor");
    expect(stepIds()).toEqual(["open-community", "stake"]);
  });

  it("keeps a platform admin's steps without a Start a community step", async () => {
    harness.user = { ...member, role: "admin" };
    harness.activeOrganizationId = personal.id;
    harness.organizations = [personal];
    renderHome();

    expect(await screen.findByTestId("home-step-launch-node")).toBeTruthy();
    expect(stepIds()).toEqual(["launch-node", "admin", "stake", "explore"]);
  });

  it("offers a retry instead of a false Start a community when organizations fail", async () => {
    harness.user = member;
    harness.organizationsFail = true;
    renderHome();

    expect(
      await screen.findByTestId("home-organizations-retry", {}, { timeout: 5000 }),
    ).toBeTruthy();
    expect(stepIds()).not.toContain("start-community");
    harness.organizationsFail = false;
    harness.organizations = [personal];
    fireEvent.click(screen.getByTestId("home-organizations-retry"));
    expect(await screen.findByTestId("home-step-start-community")).toBeTruthy();
  });
});

describe("community switcher and Home", () => {
  it("hides the personal organization and updates Home after switching", async () => {
    harness.user = member;
    harness.activeOrganizationId = personal.id;
    harness.organizations = [personal, harbor, delta];
    harness.tenants = { [harbor.id]: "Harbor", [delta.id]: "Delta" };
    renderHome({ withSwitcher: true });

    expect(await screen.findByTestId("home-step-choose-org")).toBeTruthy();
    expect(await screen.findByTestId(`org-switcher-item-${delta.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`org-switcher-item-${personal.id}`)).toBeNull();

    fireEvent.click(screen.getByTestId(`org-switcher-item-${delta.id}`));

    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ organizationId: delta.id }));
    const open = await screen.findByTestId("home-step-open-community");
    expect(open.textContent).toContain("Open Delta");
    expect(screen.queryByTestId("home-step-choose-org")).toBeNull();
  });
});

describe("My community without a valid active community", () => {
  it("opens the only community instead of No community yet", async () => {
    harness.activeOrganizationId = null;
    harness.organizations = [personal, harbor];
    harness.tenants = { [harbor.id]: "Harbor" };
    harness.nodes = [node("node-a", "Harbor")];
    const result = await loadCommunity();
    expect(result.tenant?.orgId).toBe(harbor.id);
    expect(result.selectedNode?.id).toBe("node-a");
  });

  it("asks to choose when a personal organization is active", async () => {
    harness.activeOrganizationId = personal.id;
    harness.organizations = [personal, harbor, delta];
    const result = await loadCommunity();
    expect(result.emptyReason).toBe("choose");
    expect(result.communityCount).toBe(2);
  });

  it("offers Start a community only to someone with no community", async () => {
    harness.activeOrganizationId = personal.id;
    harness.organizations = [personal];
    expect((await loadCommunity()).emptyReason).toBe("no-org");
  });

  it("refetches organizations when the active one is missing from a stale list", async () => {
    harness.activeOrganizationId = delta.id;
    harness.organizations = [personal, harbor, delta];
    harness.tenants = { [harbor.id]: "Harbor", [delta.id]: "Delta" };
    harness.nodes = [node("node-a", "Delta")];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(queryClient);
    queryClient.setQueryData(["organizations"], [personal, harbor]);
    const beforeLoad = (
      CommunityRoute as unknown as {
        options: { beforeLoad: (args: unknown) => Promise<{ tenant: { orgId: string } | null }> };
      }
    ).options.beforeLoad;
    const result = await beforeLoad({
      context: {
        apiClient: api,
        queryClient,
        auth: { activeOrganizationId: delta.id, user: { id: "user-1", role: "user" } },
      },
      search: {},
    });
    expect(result.tenant?.orgId).toBe(delta.id);
  });

  it("lets a platform admin open a community they aren't a member of", async () => {
    harness.activeOrganizationId = harbor.id;
    harness.organizations = [personal];
    harness.tenants = { [harbor.id]: "Harbor" };
    harness.nodes = [node("node-a", "Harbor")];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(queryClient);
    const beforeLoad = (
      CommunityRoute as unknown as {
        options: { beforeLoad: (args: unknown) => Promise<{ tenant: { orgId: string } | null }> };
      }
    ).options.beforeLoad;
    const result = await beforeLoad({
      context: {
        apiClient: api,
        queryClient,
        auth: { activeOrganizationId: harbor.id, user: { id: "user-1", role: "admin" } },
      },
      search: {},
    });
    expect(result.tenant?.orgId).toBe(harbor.id);
  });
});
