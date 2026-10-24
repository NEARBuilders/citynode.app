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
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient, AuthClient } from "@/app";
import { TooltipProvider } from "@/components/ui/tooltip";
import { render } from "@/i18n/test-render";

const mocks = vi.hoisted(() => ({
  apiClient: null as unknown,
  auth: null as unknown,
  openSettings: vi.fn(async () => true),
}));

vi.mock("@/app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app")>()),
  useApiClient: () => mocks.apiClient,
  useAuthClient: () => mocks.auth,
}));

vi.mock("../tenant/-use-open-community-settings", () => ({
  useOpenCommunitySettings: () => ({
    needsSwitch: () => false,
    open: mocks.openSettings,
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("./-members-tab", () => ({
  MembersTab: () => <div data-testid="panel-members" />,
}));
vi.mock("./-teams-tab", () => ({
  TeamsTab: () => <div data-testid="panel-teams" />,
}));
vi.mock("./-invitations-tab", () => ({
  InvitationsTab: () => <div data-testid="panel-invitations" />,
}));
vi.mock("./-api-keys-tab", () => ({
  ApiKeysTab: () => <div data-testid="panel-apikeys" />,
}));
vi.mock("./-onboarding-tab", () => ({
  OnboardingTab: () => <div data-testid="panel-onboard" />,
}));

const { Route } = await import("./$slug");

const ORG_ID = "org-detail-1";
const USER_ID = "user-detail-1";
const SLUG = "city-nodes";

type Role = "owner" | "admin" | "member";

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.clearAllMocks();
});

function setup({
  role,
  organizer = false,
  roleResult,
  platformRole,
  tenantId,
}: {
  role: Role | null;
  organizer?: boolean;
  roleResult?: () => Promise<{ role: string | null }>;
  platformRole?: string;
  tenantId?: string;
}) {
  const session = {
    user: { id: USER_ID, name: "Viewer", email: "viewer@example.com", role: platformRole },
    session: { id: "session-1", activeOrganizationId: ORG_ID },
  };
  const api = {
    listOrganizations: vi.fn().mockResolvedValue([
      {
        id: ORG_ID,
        name: "City Nodes",
        slug: SLUG,
        logo: null,
        metadata: null,
        status: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]),
    getActiveMemberRole: vi.fn(roleResult ?? (async () => ({ role }))),
    listInvitations: vi.fn().mockResolvedValue([]),
    listTeams: vi.fn().mockResolvedValue([]),
    listTeamMembers: vi.fn().mockResolvedValue([]),
    getContext: vi.fn().mockResolvedValue({
      user: { id: USER_ID },
      organization: {
        id: ORG_ID,
        member: role ? { role } : null,
        activeTeamId: null,
        teams: organizer ? [{ id: "team-events", name: "Events", areas: ["events"] }] : [],
      },
    }),
  };
  const apiKeyList = vi.fn().mockResolvedValue({ data: { apiKeys: [] }, error: null });
  const listMembers = vi.fn().mockResolvedValue({
    data: {
      members: role ? [{ id: "member-self", userId: USER_ID, role, user: session.user }] : [],
    },
    error: null,
  });
  const apiClient = {
    auth: api,
    resolveTenantByOrgId: vi.fn().mockResolvedValue(tenantId ? { id: tenantId } : null),
  } as unknown as ApiClient;
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: session, error: null }),
    apiKey: { list: apiKeyList },
    organization: { listMembers },
  } as unknown as AuthClient;
  mocks.apiClient = apiClient;
  mocks.auth = auth;
  return { api, apiKeyList, listMembers, apiClient, auth };
}

async function showOrganization(url: string, { apiClient, auth }: ReturnType<typeof setup>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  const context = {
    apiClient,
    authClient: auth,
    queryClient,
    runtimeConfig: { title: "City Nodes", hostUrl: "http://localhost" },
  };
  const root = createRootRouteWithContext<typeof context>()({ component: Outlet });
  const route = Route.update({
    ...Route.options,
    getParentRoute: () => root,
    path: "/orgs/$slug",
    id: undefined,
  } as never);
  const orgsRoute = createRoute({ getParentRoute: () => root, path: "/orgs" });
  const router = createRouter({
    routeTree: root.addChildren([route as never, orgsRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
    context: context as never,
    defaultPendingMinMs: 0,
  });
  await act(() => router.load());
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("City Nodes", { selector: "h1" });
  return router;
}

const RESTRICTED = ["members", "teams", "invitations", "apikeys"] as const;

function expectNoRestrictedTabs() {
  for (const tab of RESTRICTED) {
    expect(screen.queryByTestId(`orgs-tab-${tab}`)).toBeNull();
    expect(screen.queryByTestId(`panel-${tab}`)).toBeNull();
  }
}

describe("organization page tabs", () => {
  it.each(["owner", "admin"] as const)("shows every tab and panel to an %s", async (role) => {
    const mocked = setup({ role });
    await showOrganization(`/orgs/${SLUG}`, mocked);
    for (const tab of [...RESTRICTED, "onboard"]) {
      expect(await screen.findByTestId(`orgs-tab-${tab}`)).toBeTruthy();
    }
    expect(screen.getByTestId("orgs-tab-members").getAttribute("aria-selected")).toBe("true");
    expect(mocked.api.getActiveMemberRole).toHaveBeenCalledWith({ organizationId: ORG_ID });
    await waitFor(() => expect(mocked.api.listInvitations).toHaveBeenCalled());
    await waitFor(() => expect(mocked.apiKeyList).toHaveBeenCalled());
    await waitFor(() => expect(mocked.api.listTeams).toHaveBeenCalled());
  });

  it.each([
    ...RESTRICTED,
    "onboard",
    "homepage",
    "not-a-tab",
  ])("keeps a plain member on the overview for ?tab=%s", async (tab) => {
    const mocked = setup({ role: "member" });
    await showOrganization(`/orgs/${SLUG}?tab=${tab}`, mocked);
    await waitFor(() => expect(mocked.api.getActiveMemberRole).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("orgs-tabs-loading")).toBeNull());
    expect(screen.queryByRole("tablist")).toBeNull();
    expectNoRestrictedTabs();
    expect(screen.queryByTestId("orgs-tab-onboard")).toBeNull();
    expect(screen.queryByTestId("panel-onboard")).toBeNull();
    expect(mocked.api.listInvitations).not.toHaveBeenCalled();
    expect(mocked.apiKeyList).not.toHaveBeenCalled();
    expect(mocked.api.listTeams).not.toHaveBeenCalled();
    expect(mocked.api.listTeamMembers).not.toHaveBeenCalled();
  });

  it("gives an organizer only the onboarding tab, even from a Members link", async () => {
    const mocked = setup({ role: "member", organizer: true });
    await showOrganization(`/orgs/${SLUG}?tab=members`, mocked);
    const onboard = await screen.findByTestId("orgs-tab-onboard");
    expect(onboard.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("panel-onboard")).toBeTruthy();
    expectNoRestrictedTabs();
    expect(mocked.api.listInvitations).not.toHaveBeenCalled();
    expect(mocked.apiKeyList).not.toHaveBeenCalled();
    expect(mocked.api.listTeams).not.toHaveBeenCalled();
  });

  it("keeps a platform admin without an owner or admin role off the restricted tabs", async () => {
    const mocked = setup({ role: "member", platformRole: "admin" });
    await showOrganization(`/orgs/${SLUG}?tab=apikeys`, mocked);
    await waitFor(() => expect(screen.queryByTestId("orgs-tabs-loading")).toBeNull());
    expectNoRestrictedTabs();
    expect(mocked.apiKeyList).not.toHaveBeenCalled();
  });

  it("shows nothing restricted while the role loads", async () => {
    const mocked = setup({ role: "owner", roleResult: () => new Promise(() => {}) });
    await showOrganization(`/orgs/${SLUG}?tab=members`, mocked);
    expect(screen.getByTestId("orgs-tabs-loading")).toBeTruthy();
    expectNoRestrictedTabs();
    expect(mocked.api.listInvitations).not.toHaveBeenCalled();
    expect(mocked.apiKeyList).not.toHaveBeenCalled();
    expect(mocked.api.listTeams).not.toHaveBeenCalled();
  });

  it("fails closed with a retry when the role can't be loaded", async () => {
    let fail = true;
    const mocked = setup({
      role: "owner",
      roleResult: async () => {
        if (fail) throw new Error("network down");
        return { role: "owner" };
      },
    });
    await showOrganization(`/orgs/${SLUG}?tab=invitations`, mocked);
    expect(await screen.findByTestId("orgs-role-error")).toBeTruthy();
    expect(
      screen.getByText("Couldn't check your role in this organization.", { exact: false }),
    ).toBeTruthy();
    expectNoRestrictedTabs();
    expect(mocked.api.listInvitations).not.toHaveBeenCalled();
    fail = false;
    fireEvent.click(screen.getByTestId("orgs-role-retry"));
    const invitations = await screen.findByTestId("orgs-tab-invitations");
    expect(invitations.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByTestId("orgs-role-error")).toBeNull();
  });

  it("removes the restricted tabs when the viewer's role drops to member", async () => {
    let role: Role = "owner";
    const mocked = setup({ role: "owner", roleResult: async () => ({ role }) });
    const router = await showOrganization(`/orgs/${SLUG}?tab=teams`, mocked);
    expect(await screen.findByTestId("orgs-tab-teams")).toBeTruthy();
    role = "member";
    const queryClient = clients[clients.length - 1];
    await act(() => queryClient.invalidateQueries({ queryKey: ["org-active-role", ORG_ID] }));
    await waitFor(() => expect(screen.queryByTestId("orgs-tab-teams")).toBeNull());
    expectNoRestrictedTabs();
    expect(router.state.location.pathname).toBe(`/orgs/${SLUG}`);
  });

  it("returns an owner to the Members tab when a legacy settings link can't open", async () => {
    mocks.openSettings.mockResolvedValueOnce(false);
    const mocked = setup({ role: "owner", tenantId: "tenant-1" });
    const router = await showOrganization(`/orgs/${SLUG}?tab=homepage`, mocked);
    const members = await screen.findByTestId("orgs-tab-members");
    expect(members.getAttribute("aria-selected")).toBe("true");
    expect(mocks.openSettings).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, tenantId: "tenant-1" }),
    );
    expect(router.state.location.search).not.toHaveProperty("tab", "homepage");
  });

  it("returns a platform admin to the overview when a legacy settings link can't open", async () => {
    mocks.openSettings.mockResolvedValueOnce(false);
    const mocked = setup({ role: "member", platformRole: "admin", tenantId: "tenant-1" });
    const router = await showOrganization(`/orgs/${SLUG}?tab=node-config`, mocked);
    await waitFor(() => expect(mocks.openSettings).toHaveBeenCalled());
    await waitFor(() =>
      expect(router.state.location.search).not.toHaveProperty("tab", "node-config"),
    );
    await waitFor(() => expect(screen.queryByTestId("orgs-tabs-loading")).toBeNull());
    expect(screen.queryByRole("tablist")).toBeNull();
    expectNoRestrictedTabs();
  });
});
