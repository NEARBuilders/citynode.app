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
  passkeys: [{ id: "passkey-1" }] as { id: string }[],
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
    listOnboardingCodes: async () => [],
    getOnboardingStats: async ({ month }: { month: string }) => ({
      month,
      totals: { redeemed: 0, newMembers: 0 },
      organizations: [],
    }),
  },
  getDiscoveryProfile: async () => null,
  listDiscoveryActivities: async () => [],
  resolveTenantByOrgId: async ({ orgId }: { orgId: string }) => {
    const name = harness.tenants[orgId];
    if (!name) throw new Error("no tenant");
    return { id: `tenant-${orgId}`, orgId, name };
  },
  listNodes: async () => harness.nodes,
  listEventReportStatuses: async () => [],
  listMonthlyReportStatuses: async () => [],
  getMonthlyReport: async () => ({ stats: null }),
  getTeamJoinBoard: async () => ({ canReview: true, teams: [], requests: [] }),
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
    passkey: { listUserPasskeys: async () => ({ data: harness.passkeys }) },
    organization: { setActive, setActiveTeam: async () => ({ error: null }) },
    getSession: async () => ({ data: session(), error: null }),
    near: { getProfile: async () => ({ data: null }), disconnect: async () => {} },
  }),
  useApiClient: () => api,
  pluginPath: (path: string) => path,
}));

vi.mock("@/lib/use-near-account", () => ({ useNearAccount: () => null }));
vi.mock("@/lib/use-relayer", () => ({
  useRelayerInfoQuery: () => ({ data: null, isLoading: false, isError: false }),
}));

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
  harness.passkeys = [{ id: "passkey-1" }];
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
    expect(screen.queryByTestId("home-admin-overview")).toBeNull();
  });

  it("gives a Finance team member the payouts step", async () => {
    harness.user = member;
    harness.activeOrganizationId = harbor.id;
    harness.organizations = [personal, harbor];
    harness.tenants = { [harbor.id]: "Harbor" };
    harness.authContext = {
      organization: {
        member: { role: "member" },
        teams: [{ id: "team-finance", name: "Finance", areas: ["finance"] }],
        activeTeamId: null,
      },
    };
    renderHome();

    expect(await screen.findByTestId("home-step-payouts")).toBeTruthy();
    expect(stepIds()).toEqual(["open-community", "payouts", "stake"]);
  });

  it("leaves the payouts step out for a plain member", async () => {
    harness.user = member;
    harness.activeOrganizationId = harbor.id;
    harness.organizations = [personal, harbor];
    harness.tenants = { [harbor.id]: "Harbor" };
    harness.authContext = { organization: { member: { role: "member" }, teams: [] } };
    renderHome();

    expect(await screen.findByTestId("home-step-open-community")).toBeTruthy();
    expect(stepIds()).toEqual(["open-community", "stake"]);
  });

  it("opens a platform admin's Home with the platform overview, not a launch step", async () => {
    harness.user = { ...member, role: "admin" };
    harness.activeOrganizationId = personal.id;
    harness.organizations = [personal];
    renderHome();

    expect(await screen.findByTestId("home-admin-overview")).toBeTruthy();
    expect(await screen.findByTestId("home-step-stake")).toBeTruthy();
    expect(stepIds()).toEqual(["stake", "explore"]);
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

describe("who sees the community overview on Home", () => {
  const inHarbor = (organization: unknown, user: Record<string, unknown> = member) => {
    harness.user = user;
    harness.activeOrganizationId = harbor.id;
    harness.organizations = [personal, harbor];
    harness.tenants = { [harbor.id]: "Harbor" };
    harness.nodes = [node("node-h", "Harbor")];
    harness.authContext = { organization };
  };
  const owner = { member: { role: "owner" }, teams: [] };
  const follows = (first: HTMLElement, second: HTMLElement) =>
    Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("leads an owner's Home with the overview, then a setup line instead of the checklist", async () => {
    inHarbor(owner);
    renderHome();

    const overview = await screen.findByTestId("home-owner.overview");
    expect(screen.getByTestId("home.heading").textContent).toContain(
      "How Harbor is doing this month",
    );
    const setup = await screen.findByTestId("home-owner.setup");
    expect(setup.textContent).toContain("Get Harbor running");
    expect(setup.textContent).toContain("0 of 4 done");
    expect(screen.getByTestId("home-owner.setup-open").getAttribute("href")).toBe(
      "/dashboard/node",
    );
    expect(screen.queryByTestId("home-node-setup")).toBeNull();
    expect(screen.queryByTestId("home-setup-map")).toBeNull();
    const steps = await screen.findByTestId("home-next-steps");
    expect(follows(overview, setup)).toBe(true);
    expect(follows(setup, steps)).toBe(true);
    expect(stepIds()).toEqual(["open-community", "payouts", "stake"]);
    expect(follows(steps, screen.getByText("Bulletin for Harbor node-h"))).toBe(true);
  });

  it("gives an events-team organizer the overview without the setup line", async () => {
    inHarbor({
      member: { role: "member" },
      teams: [{ id: "team-events", name: "Events", areas: ["events"] }],
      activeTeamId: null,
    });
    renderHome();

    expect(await screen.findByTestId("home-owner.overview")).toBeTruthy();
    expect(await screen.findByTestId("home-owner.reports-list")).toBeTruthy();
    expect(stepIds()).toEqual(["open-community", "stake"]);
    expect(screen.queryByTestId("home-owner.setup")).toBeNull();
  });

  it("leaves Home unchanged for Finance-only members and plain members", async () => {
    inHarbor({
      member: { role: "member" },
      teams: [{ id: "team-finance", name: "Finance", areas: ["finance"] }],
      activeTeamId: null,
    });
    renderHome();
    expect(await screen.findByTestId("home-step-payouts")).toBeTruthy();
    expect(screen.queryByTestId("home-owner.overview")).toBeNull();
    expect(stepIds()[0]).toBe("open-community");

    cleanup();
    inHarbor({ member: { role: "member" }, teams: [] });
    renderHome();
    expect(await screen.findByTestId("home-step-open-community")).toBeTruthy();
    expect(screen.queryByTestId("home-owner.overview")).toBeNull();
    expect(screen.getByTestId("home.heading").textContent).toContain("Pick up where you left off.");
  });

  it("shows no overview to someone without a community", async () => {
    harness.user = member;
    harness.activeOrganizationId = personal.id;
    harness.organizations = [personal];
    harness.authContext = { organization: owner };
    renderHome();
    expect(await screen.findByTestId("home-step-start-community")).toBeTruthy();
    expect(screen.queryByTestId("home-owner.overview")).toBeNull();
  });

  it("gives a platform admin who owns a community the platform overview only, with My community", async () => {
    inHarbor(owner, { ...member, role: "admin" });
    renderHome();

    expect(await screen.findByTestId("home-admin-overview")).toBeTruthy();
    const open = await screen.findByTestId("home-step-open-community");
    expect(open.querySelector("a")?.getAttribute("href")).toBe("/dashboard/node");
    expect(screen.queryByTestId("home-owner.overview")).toBeNull();
    expect(screen.queryByTestId("home-owner.setup")).toBeNull();
  });

  it("keeps account safety featured above the overview", async () => {
    inHarbor(owner, { ...member, isAnonymous: true });
    harness.passkeys = [];
    renderHome();

    const safety = await screen.findByTestId("home-owner.account-safety");
    expect(safety.querySelector("[data-testid=home-step-save-account]")).toBeTruthy();
    expect(follows(safety, await screen.findByTestId("home-owner.overview"))).toBe(true);
    await screen.findByTestId("home-next-steps");
    expect(stepIds()).toEqual(["open-community", "payouts", "stake"]);
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
