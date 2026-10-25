import { describe, expect, it } from "vitest";
import type { AuthRequestContext } from "@/lib/auth";
import { resolveTeamWorkspace } from "@/lib/team-workspace";
import { resolveCommunityTools } from "./-node-access";

const events = { id: "team-events", name: "Events", areas: ["events"] };
const finance = { id: "team-fin", name: "Finance", areas: ["finance"] };
const staking = { id: "team-stake", name: "Staking", areas: ["stake"] };
const ops = { id: "team-ops", name: "Operations", areas: ["node-operations"] };

function context(options: { orgRole?: string; activeTeamId?: string | null }) {
  return {
    user: { role: null },
    organization: {
      activeOrganizationId: "org-1",
      member: { id: "m1", role: options.orgRole ?? "member" },
      teams: [events, finance, staking, ops],
      activeTeamId: options.activeTeamId ?? null,
    },
  } as AuthRequestContext;
}

function tools(ctx: AuthRequestContext) {
  return resolveCommunityTools(ctx, resolveTeamWorkspace(ctx).allowedAreas, "node-1");
}

describe("resolveCommunityTools", () => {
  it("shows event and finance tools from every team when no team is active", () => {
    expect(tools(context({}))).toEqual({ inFinanceTeam: true, canOrganize: true });
  });

  it("hides event and finance tools while a stake team is active", () => {
    expect(tools(context({ activeTeamId: staking.id }))).toEqual({
      inFinanceTeam: false,
      canOrganize: false,
    });
  });

  it("keeps event tools for an active events team and hides finance tools", () => {
    expect(tools(context({ activeTeamId: events.id }))).toEqual({
      inFinanceTeam: false,
      canOrganize: true,
    });
  });

  it("keeps finance tools for an active finance team and hides event tools", () => {
    expect(tools(context({ activeTeamId: finance.id }))).toEqual({
      inFinanceTeam: true,
      canOrganize: false,
    });
  });

  it("keeps event tools for an active node operations team", () => {
    expect(tools(context({ activeTeamId: ops.id }))).toEqual({
      inFinanceTeam: false,
      canOrganize: true,
    });
  });

  it("keeps the owner bypass whatever team is active", () => {
    expect(tools(context({ orgRole: "owner", activeTeamId: staking.id }))).toEqual({
      inFinanceTeam: true,
      canOrganize: true,
    });
  });

  it("does not grant event tools without an events team or organizer role", () => {
    const ctx = {
      user: { role: null },
      organization: {
        activeOrganizationId: "org-1",
        member: { id: "m1", role: "member" },
        teams: [staking],
        activeTeamId: null,
      },
    } as AuthRequestContext;

    expect(tools(ctx)).toEqual({ inFinanceTeam: false, canOrganize: false });
  });
});
