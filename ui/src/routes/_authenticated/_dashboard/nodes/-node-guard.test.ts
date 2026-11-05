import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { AuthRequestContext } from "@/lib/auth";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  redirect: (options: unknown) => ({ redirect: options }),
  Outlet: () => null,
}));

const { Route: NodeRoute } = await import("./$nodeId");
const { Route: ContentRoute } = await import("./$nodeId/content");

type Guard = (args: unknown) => Promise<unknown> | unknown;

const events = { id: "team-events", name: "Community", areas: ["events"] };
const finance = { id: "team-fin", name: "Treasury", areas: ["finance"] };
const ops = { id: "team-ops", name: "Operations", areas: ["node-operations"] };

function authContext(orgRole: string, teams: Array<typeof events>) {
  return {
    user: { role: null },
    organization: {
      activeOrganizationId: "org-1",
      member: { id: "m1", role: orgRole },
      teams,
      activeTeamId: null,
    },
  } as unknown as AuthRequestContext;
}

function enterNode(context: AuthRequestContext | null, userRole: string | null = null) {
  const getContext = vi.fn().mockResolvedValue(context);
  return (NodeRoute.options.beforeLoad as Guard)({
    context: {
      queryClient: new QueryClient(),
      apiClient: { auth: { getContext } },
      auth: { activeOrganizationId: "org-1", user: { role: userRole } },
    },
  });
}

function openTab(
  tab: string | undefined,
  flags: {
    canManageCommunity: boolean;
    canOrganizeEvents?: boolean;
    canOperateNodes?: boolean;
  },
  params = { nodeId: "node-1" },
) {
  return (ContentRoute.options.beforeLoad as Guard)({
    context: {
      canManageCommunity: flags.canManageCommunity,
      canOrganizeEvents: flags.canOrganizeEvents ?? flags.canManageCommunity,
      canOperateNodes: flags.canOperateNodes ?? flags.canManageCommunity,
    },
    params,
    search: tab ? { tab } : {},
  });
}

const ownersOnly = { redirect: { to: "/dashboard", search: { restricted: "owners" } } };

describe("community event routes", () => {
  it("let owners, admins and platform admins in as managers", async () => {
    await expect(enterNode(authContext("owner", []))).resolves.toEqual({
      canManageCommunity: true,
      canOrganizeEvents: true,
      canOperateNodes: true,
    });
    await expect(enterNode(authContext("admin", []))).resolves.toEqual({
      canManageCommunity: true,
      canOrganizeEvents: true,
      canOperateNodes: true,
    });
    await expect(enterNode(null, "admin")).resolves.toEqual({
      canManageCommunity: true,
      canOrganizeEvents: true,
      canOperateNodes: true,
    });
  });

  it("let an events-team organizer in without manager rights", async () => {
    await expect(enterNode(authContext("member", [events]))).resolves.toEqual({
      canManageCommunity: false,
      canOrganizeEvents: true,
      canOperateNodes: false,
    });
  });

  it("let a node-operations member in without manager or events rights", async () => {
    await expect(enterNode(authContext("member", [ops]))).resolves.toEqual({
      canManageCommunity: false,
      canOrganizeEvents: false,
      canOperateNodes: true,
    });
  });

  it("send members without events or node-operations back with an owners-only notice", async () => {
    await expect(enterNode(authContext("member", []))).rejects.toEqual(ownersOnly);
    await expect(enterNode(authContext("member", [finance]))).rejects.toEqual(ownersOnly);
    await expect(enterNode(null)).rejects.toEqual(ownersOnly);
  });

  it("open Events and Onboarding to organizers and the bulletin to managers or operators", () => {
    expect(() =>
      openTab("events", { canManageCommunity: false, canOrganizeEvents: true }),
    ).not.toThrow();
    expect(() =>
      openTab("onboarding", { canManageCommunity: false, canOrganizeEvents: true }),
    ).not.toThrow();
    expect(() =>
      openTab("bulletin", { canManageCommunity: true, canOrganizeEvents: true }),
    ).not.toThrow();
    expect(() =>
      openTab("bulletin", {
        canManageCommunity: false,
        canOrganizeEvents: false,
        canOperateNodes: true,
      }),
    ).not.toThrow();
    expect(() =>
      openTab("bulletin", {
        canManageCommunity: false,
        canOrganizeEvents: false,
        canOperateNodes: false,
      }),
    ).toThrow(expect.objectContaining({ redirect: ownersOnly.redirect }));
  });

  it("sends a node-operations member without events to the bulletin tab", () => {
    expect(() =>
      openTab(undefined, {
        canManageCommunity: false,
        canOrganizeEvents: false,
        canOperateNodes: true,
      }),
    ).toThrow(
      expect.objectContaining({
        redirect: {
          to: "/nodes/$nodeId/content",
          params: { nodeId: "node-1" },
          search: { tab: "bulletin" },
          replace: true,
        },
      }),
    );
    expect(() =>
      openTab("events", {
        canManageCommunity: false,
        canOrganizeEvents: false,
        canOperateNodes: true,
      }),
    ).toThrow(
      expect.objectContaining({
        redirect: {
          to: "/nodes/$nodeId/content",
          params: { nodeId: "node-1" },
          search: { tab: "bulletin" },
          replace: true,
        },
      }),
    );
  });
});
