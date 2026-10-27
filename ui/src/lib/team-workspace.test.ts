import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import type { AuthRequestContext } from "@/lib/auth";
import {
  areasForPath,
  canManageCommunity,
  canOrganizeEvents,
  hasFeatureArea,
  isAreaInView,
  isCommunitySettingsRole,
  isPathAllowed,
  requireTeamArea,
  resolveTeamWorkspace,
  teamWorkspaceQueryOptions,
} from "./team-workspace";

const finance = { id: "team-fin", name: "Finance", areas: ["finance", "stake"] };
const ops = { id: "team-ops", name: "Node Operator", areas: ["node-operations"] };

function context(options: {
  orgRole?: string;
  userRole?: string;
  activeTeamId?: string | null;
  teams?: Array<{ id: string; name: string; areas: string[] }>;
}) {
  return {
    user: { role: options.userRole ?? null },
    organization: {
      activeOrganizationId: "org-1",
      member: { id: "m1", role: options.orgRole ?? "member" },
      teams: options.teams ?? [finance, ops],
      activeTeamId: options.activeTeamId ?? null,
    },
  } as AuthRequestContext;
}

describe("resolveTeamWorkspace", () => {
  it("drops an active team that is no longer in the member's organization teams", () => {
    const workspace = resolveTeamWorkspace(context({ activeTeamId: "removed-team" }));

    expect(workspace.activeTeam).toBeNull();
    expect(isPathAllowed(workspace, "/dashboard/node")).toBe(true);
  });

  it("restricts a member to the active team's areas", () => {
    const workspace = resolveTeamWorkspace(context({ activeTeamId: "team-fin" }));

    expect(workspace.activeTeam?.name).toBe("Finance");
    expect(workspace.allowedAreas).toEqual(["finance", "stake"]);
  });

  it("treats a selected team without recognized areas as All areas and flags it as stale", () => {
    const legacy = { id: "team-legacy", name: "Community", areas: ["things"] };
    const empty = { id: "team-empty", name: "Event Team", areas: [] };
    for (const team of [legacy, empty]) {
      const workspace = resolveTeamWorkspace(context({ activeTeamId: team.id, teams: [team] }));

      expect(workspace.activeTeam).toBeNull();
      expect(workspace.staleActiveTeamId).toBe(team.id);
      expect(workspace.allowedAreas).toBeNull();
      expect(workspace.teams).toEqual([]);
      expect(isPathAllowed(workspace, "/tenant/tenant-1")).toBe(true);
    }
  });

  it("lists only teams with at least one recognized feature area", () => {
    const empty = { id: "team-empty", name: "Event Team", areas: [] };
    const legacy = { id: "team-legacy", name: "Community", areas: ["things"] };
    const mixed = { id: "team-mixed", name: "Mixed", areas: ["things", "events"] };
    const workspace = resolveTeamWorkspace(
      context({ teams: [empty, legacy, mixed, finance], activeTeamId: mixed.id }),
    );

    expect(workspace.teams.map((team) => team.id)).toEqual(["team-mixed", "team-fin"]);
    expect(workspace.activeTeam?.id).toBe("team-mixed");
    expect(workspace.allowedAreas).toEqual(["events"]);
    expect(workspace.staleActiveTeamId).toBeNull();
  });

  it("flags a selected team the member no longer belongs to as stale", () => {
    expect(resolveTeamWorkspace(context({ activeTeamId: "removed-team" })).staleActiveTeamId).toBe(
      "removed-team",
    );
    expect(resolveTeamWorkspace(context({})).staleActiveTeamId).toBeNull();
  });

  it("clears a stale selection for owners too while keeping their bypass", () => {
    const empty = { id: "team-empty", name: "Event Team", areas: [] };
    const workspace = resolveTeamWorkspace(
      context({ orgRole: "owner", activeTeamId: empty.id, teams: [empty, ops] }),
    );

    expect(workspace.staleActiveTeamId).toBe(empty.id);
    expect(workspace.allowedAreas).toBeNull();
    expect(workspace.teams).toEqual([ops]);
  });

  it("leaves members without an active team unrestricted", () => {
    const workspace = resolveTeamWorkspace(context({}));

    expect(workspace.activeTeam).toBeNull();
    expect(workspace.allowedAreas).toBeNull();
    expect(workspace.teams).toHaveLength(2);
  });

  it("never restricts organization owners, admins or platform admins", () => {
    for (const ctx of [
      context({ orgRole: "owner", activeTeamId: "team-fin" }),
      context({ orgRole: "admin", activeTeamId: "team-fin" }),
      context({ userRole: "admin", activeTeamId: "team-fin" }),
    ]) {
      const workspace = resolveTeamWorkspace(ctx);
      expect(workspace.activeTeam?.id).toBe("team-fin");
      expect(workspace.allowedAreas).toBeNull();
    }
  });

  it("treats a missing context as unrestricted with no teams", () => {
    expect(resolveTeamWorkspace(null)).toEqual({
      teams: [],
      activeTeam: null,
      staleActiveTeamId: null,
      allowedAreas: null,
      canManageOrganization: false,
    });
  });

  it("lets organization owners and admins manage the organization", () => {
    expect(resolveTeamWorkspace(context({ orgRole: "owner" })).canManageOrganization).toBe(true);
    expect(resolveTeamWorkspace(context({ orgRole: "admin" })).canManageOrganization).toBe(true);
    expect(resolveTeamWorkspace(context({})).canManageOrganization).toBe(false);
  });
});

describe("route areas", () => {
  it("maps only work-area tools to feature areas", () => {
    expect(areasForPath("/tenant/abc")).toEqual(["node-operations"]);
    expect(areasForPath("/nodes/node-1/content")).toEqual(["node-operations", "events"]);
    expect(areasForPath("/nodes/node-1/events/new")).toEqual(["node-operations", "events"]);
    expect(areasForPath("/dashboard/node")).toBeNull();
    expect(areasForPath("/dashboard/node/proposals")).toBeNull();
    expect(areasForPath("/dashboard/node/proposals/7")).toBeNull();
    expect(areasForPath("/stake")).toBeNull();
    expect(areasForPath("/dashboard")).toBeNull();
    expect(areasForPath("/orgs/acme")).toBeNull();
    expect(areasForPath("/tenants")).toBeNull();
    expect(areasForPath("/dashboard/nodes")).toBeNull();
  });

  const events = { id: "team-events", name: "Events", areas: ["events"] };
  const staking = { id: "team-stake", name: "Staking", areas: ["stake"] };
  const memberDestinations = [
    "/dashboard/node",
    "/dashboard/node/",
    "/dashboard/node/proposals",
    "/dashboard/node/proposals/7",
    "/stake",
  ];

  it.each([
    ["no team", context({})],
    ["an events team", context({ activeTeamId: events.id, teams: [events] })],
    ["a stake team", context({ activeTeamId: staking.id, teams: [staking] })],
    ["a finance team", context({ activeTeamId: "team-fin" })],
    ["a node operations team", context({ activeTeamId: "team-ops" })],
  ])("keeps Overview, Proposals and Stake open with %s", (_, ctx) => {
    const workspace = resolveTeamWorkspace(ctx);

    for (const path of memberDestinations) expect(isPathAllowed(workspace, path)).toBe(true);
  });

  it("limits a stake team to area-free tools", () => {
    const workspace = resolveTeamWorkspace(context({ activeTeamId: staking.id, teams: [staking] }));

    expect(isPathAllowed(workspace, "/nodes/node-1/content")).toBe(false);
    expect(isPathAllowed(workspace, "/tenant/tenant-1")).toBe(false);
  });

  it("limits a finance team to area-free tools", () => {
    const workspace = resolveTeamWorkspace(context({ activeTeamId: "team-fin" }));

    expect(isPathAllowed(workspace, "/nodes/node-1/content")).toBe(false);
    expect(isPathAllowed(workspace, "/tenant/tenant-1")).toBe(false);
  });

  it("opens event tools but not community settings to an events team", () => {
    const workspace = resolveTeamWorkspace(context({ activeTeamId: events.id, teams: [events] }));

    expect(isPathAllowed(workspace, "/nodes/node-1/content")).toBe(true);
    expect(isPathAllowed(workspace, "/nodes/node-1/events/new")).toBe(true);
    expect(isPathAllowed(workspace, "/tenant/tenant-1")).toBe(false);
  });

  it("opens node editing and event tools to a node operations team", () => {
    const workspace = resolveTeamWorkspace(context({ activeTeamId: "team-ops" }));

    expect(isPathAllowed(workspace, "/tenant/tenant-1")).toBe(true);
    expect(isPathAllowed(workspace, "/nodes/node-1/content")).toBe(true);
  });
});

describe("isAreaInView", () => {
  it("shows every area when unrestricted and only granted areas otherwise", () => {
    expect(isAreaInView(null, "finance")).toBe(true);
    expect(isAreaInView(["finance", "stake"], "finance")).toBe(true);
    expect(isAreaInView(["events"], "finance")).toBe(false);
    expect(isAreaInView([], "events")).toBe(false);
  });
});

describe("requireTeamArea", () => {
  const staking = { id: "team-stake", name: "Staking", areas: ["stake"] };

  function guardContext(ctx: AuthRequestContext) {
    const getContext = vi.fn().mockResolvedValue(ctx);
    return {
      getContext,
      context: {
        apiClient: { auth: { getContext } } as unknown as ApiClient,
        queryClient: new QueryClient(),
      },
    };
  }

  it("sends a member home with the area explanation when the active team hides a work-area tool", async () => {
    const { context: guard } = guardContext(
      context({ activeTeamId: staking.id, teams: [staking] }),
    );

    await expect(
      requireTeamArea({ context: guard, location: { pathname: "/tenant/tenant-1" } }),
    ).rejects.toMatchObject({
      options: { to: "/dashboard", search: { restricted: "node-operations" } },
    });
  });

  it.each([
    "/dashboard/node",
    "/dashboard/node/proposals",
    "/stake",
  ])("never bounces a member away from %s", async (pathname) => {
    const { context: guard, getContext } = guardContext(
      context({ activeTeamId: staking.id, teams: [staking] }),
    );

    await expect(requireTeamArea({ context: guard, location: { pathname } })).resolves.toBe(
      undefined,
    );
    expect(getContext).not.toHaveBeenCalled();
  });

  it("does not redirect while a stale empty-area team is still selected", async () => {
    const empty = { id: "team-empty", name: "Event Team", areas: [] };
    const { context: guard } = guardContext(context({ activeTeamId: empty.id, teams: [empty] }));

    await expect(
      requireTeamArea({ context: guard, location: { pathname: "/tenant/tenant-1" } }),
    ).resolves.toBe(undefined);
  });
});

describe("hasFeatureArea", () => {
  it("accepts teams with a recognized area and rejects empty or unknown-only teams", () => {
    expect(hasFeatureArea({ areas: ["events"] })).toBe(true);
    expect(hasFeatureArea({ areas: ["things", "stake"] })).toBe(true);
    expect(hasFeatureArea({ areas: [] })).toBe(false);
    expect(hasFeatureArea({ areas: ["things"] })).toBe(false);
  });
});

describe("community permissions", () => {
  const events = { id: "team-events", name: "Community", areas: ["events"] };

  it("keeps community management with owners, admins and platform admins", () => {
    expect(canManageCommunity(context({ orgRole: "owner" }))).toBe(true);
    expect(canManageCommunity(context({ orgRole: "member", userRole: "admin" }))).toBe(true);
    expect(canManageCommunity(context({ teams: [events] }))).toBe(false);
  });

  it.each([
    ["owner", true],
    ["admin", true],
    ["member", false],
    [null, false],
    [undefined, false],
  ])("treats the %s organization role as a community settings role: %s", (role, expected) => {
    expect(isCommunitySettingsRole(role)).toBe(expected);
  });

  it("lets members of an events team organize events whether or not the team is active", () => {
    expect(canOrganizeEvents(context({ teams: [events] }))).toBe(true);
    expect(canOrganizeEvents(context({ teams: [events], activeTeamId: events.id }))).toBe(true);
    expect(canOrganizeEvents(context({ orgRole: "owner", teams: [] }))).toBe(true);
  });

  it("does not let members without the events area organize events", () => {
    expect(canOrganizeEvents(context({}))).toBe(false);
    expect(canOrganizeEvents(context({ teams: [] }))).toBe(false);
    expect(canOrganizeEvents(null)).toBe(false);
  });

  it("can omit the platform-admin bypass when Overview tools ask for membership", () => {
    const adminOnly = {
      user: { role: "admin" },
      organization: {
        activeOrganizationId: "org-1",
        member: null,
        teams: [],
        activeTeamId: null,
      },
    } as unknown as AuthRequestContext;
    expect(canOrganizeEvents(adminOnly)).toBe(true);
    expect(canOrganizeEvents(adminOnly, { includePlatformAdmin: false })).toBe(false);
  });
});

describe("teamWorkspaceQueryOptions", () => {
  it("loads the workspace from the auth context", async () => {
    const getContext = vi.fn().mockResolvedValue(context({ activeTeamId: "team-ops" }));
    const apiClient = { auth: { getContext } } as unknown as ApiClient;

    const workspace = await new QueryClient().fetchQuery(teamWorkspaceQueryOptions(apiClient));

    expect(workspace.activeTeam?.id).toBe("team-ops");
    expect(workspace.allowedAreas).toEqual(["node-operations"]);
  });
});
