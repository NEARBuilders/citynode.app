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

function openTab(tab: string, canManageCommunity: boolean) {
  return (ContentRoute.options.beforeLoad as Guard)({
    context: { canManageCommunity },
    search: { tab },
  });
}

const ownersOnly = { redirect: { to: "/dashboard", search: { restricted: "owners" } } };

describe("community event routes", () => {
  it("let owners, admins and platform admins in as managers", async () => {
    await expect(enterNode(authContext("owner", []))).resolves.toEqual({
      canManageCommunity: true,
    });
    await expect(enterNode(authContext("admin", []))).resolves.toEqual({
      canManageCommunity: true,
    });
    await expect(enterNode(null, "admin")).resolves.toEqual({ canManageCommunity: true });
  });

  it("let an events-team organizer in without manager rights", async () => {
    await expect(enterNode(authContext("member", [events]))).resolves.toEqual({
      canManageCommunity: false,
    });
  });

  it("send members without the events area back with an owners-only notice", async () => {
    await expect(enterNode(authContext("member", []))).rejects.toEqual(ownersOnly);
    await expect(enterNode(authContext("member", [finance]))).rejects.toEqual(ownersOnly);
    await expect(enterNode(null)).rejects.toEqual(ownersOnly);
  });

  it("open Events and Onboarding to organizers but keep the bulletin with managers", () => {
    expect(() => openTab("events", false)).not.toThrow();
    expect(() => openTab("onboarding", false)).not.toThrow();
    expect(() => openTab("bulletin", true)).not.toThrow();
    expect(() => openTab("bulletin", false)).toThrow(
      expect.objectContaining({ redirect: ownersOnly.redirect }),
    );
  });
});
