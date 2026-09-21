import { call, os } from "@orpc/server";
import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth";
import { createTeamMiddleware } from "@/lib/team-auth";

const builder = os.$context<AuthContext>();
const { requireTeam } = createTeamMiddleware(builder);
const whoAmI = builder.use(requireTeam).handler(({ context }) => context.activeTeam?.id ?? null);

function member(
  orgRole: string,
  organization: {
    teams?: Array<{ id: string; name: string; areas: string[] }>;
    activeTeamId?: string | null;
  },
  userRole?: string,
): AuthContext {
  return {
    userId: "u1",
    user: {
      id: "u1",
      name: "U",
      email: "u1@example.com",
      emailVerified: true,
      image: null,
      role: userRole ?? null,
      isAnonymous: false,
    },
    organization: {
      activeOrganizationId: "org-1",
      organization: { id: "org-1", name: "Org", slug: "org" },
      member: { id: "m1", role: orgRole },
      isPersonal: false,
      hasOrganization: true,
      teams: organization.teams ?? [],
      activeTeamId: organization.activeTeamId ?? null,
    },
  };
}

const ops = { id: "team-ops", name: "Node Operator", areas: ["node-operations"] };

describe("requireTeam", () => {
  it("resolves the active team for a member of it", async () => {
    await expect(
      call(whoAmI, undefined, {
        context: member("member", { teams: [ops], activeTeamId: ops.id }),
      }),
    ).resolves.toBe("team-ops");
  });

  it("rejects a member with no active team", async () => {
    await expect(
      call(whoAmI, undefined, { context: member("member", { teams: [ops] }) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("Active team") });
  });

  it("rejects an active team id the member does not belong to", async () => {
    await expect(
      call(whoAmI, undefined, { context: member("member", { teams: [], activeTeamId: ops.id }) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets organization owners, admins and platform admins through without a team", async () => {
    await expect(call(whoAmI, undefined, { context: member("owner", {}) })).resolves.toBeNull();
    await expect(call(whoAmI, undefined, { context: member("admin", {}) })).resolves.toBeNull();
    await expect(
      call(whoAmI, undefined, { context: member("member", {}, "admin") }),
    ).resolves.toBeNull();
  });

  it("rejects unauthenticated and organization-less requests", async () => {
    await expect(call(whoAmI, undefined, { context: {} })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const orgless = { ...member("member", {}), organization: undefined };
    await expect(call(whoAmI, undefined, { context: orgless })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("Active organization"),
    });
  });
});
