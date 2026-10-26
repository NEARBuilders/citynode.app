import { call, os } from "@orpc/server";
import { describe, expect, it } from "vitest";
import type { AuthPluginContext as AuthContext } from "../../src/lib/auth-types.gen";
import {
  canUseTeamArea,
  createRequireTeamArea,
  resolveTeamAccess,
} from "../../src/team-access-policy";

describe("team access policy", () => {
  it("resolves missing organization context to no teams", () => {
    expect(resolveTeamAccess(null)).toEqual({ teams: [], bypass: false });
  });

  it.each([
    { userRole: "user", orgRole: "owner" },
    { userRole: "user", orgRole: "admin" },
    { userRole: "admin", orgRole: "member" },
  ])("bypasses area checks for $userRole / $orgRole", ({ userRole, orgRole }) => {
    const finance = { id: "finance", name: "Finance", areas: ["finance"], permissions: {} };
    expect(
      resolveTeamAccess({
        user: { role: userRole },
        organization: {
          member: { role: orgRole },
          teams: [finance],
          activeTeamId: finance.id,
        },
      }),
    ).toEqual({ teams: [finance], bypass: true });
  });

  it("does not bypass area checks for a plain member", () => {
    const finance = {
      id: "finance",
      name: "Finance",
      areas: ["finance", "unknown-area"],
      permissions: {},
    };

    expect(
      resolveTeamAccess({
        user: { role: "user" },
        organization: {
          member: { role: "member" },
          teams: [finance],
          activeTeamId: "finance",
        },
      }),
    ).toEqual({ teams: [finance], bypass: false });
  });
});

describe("canUseTeamArea", () => {
  const ops = { id: "team-ops", name: "Operations", areas: ["node-operations"], permissions: {} };

  it("refuses an organization caller with no member, even with a team granted the area", () => {
    expect(
      canUseTeamArea(
        { organization: { member: null, teams: [ops], activeTeamId: ops.id } },
        "node-operations",
      ),
    ).toBe(false);
  });
});

describe("createRequireTeamArea", () => {
  const builder = os.$context<AuthContext>();
  const requireNodeOperations = createRequireTeamArea(builder)("node-operations");
  const whoAmI = builder.use(requireNodeOperations).handler(() => "allowed");

  function member(
    orgRole: string,
    organization: {
      teams?: Array<{
        id: string;
        name: string;
        areas: string[];
        permissions: Record<string, string[]>;
      }>;
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
        locale: null,
      },
      organization: {
        activeOrganizationId: "org-1",
        organization: { id: "org-1", name: "Org", slug: "org", status: "active" },
        member: { id: "m1", role: orgRole },
        isPersonal: false,
        hasOrganization: true,
        teams: organization.teams ?? [],
        activeTeamId: organization.activeTeamId ?? null,
      },
    };
  }

  const ops = {
    id: "team-ops",
    name: "Node Operator",
    areas: ["node-operations"],
    permissions: {},
  };
  const finance = { id: "team-finance", name: "Finance", areas: ["finance"], permissions: {} };

  it("allows a member whose active team is granted the area", async () => {
    await expect(
      call(whoAmI, undefined, {
        context: member("member", { teams: [ops], activeTeamId: ops.id }),
      }),
    ).resolves.toBe("allowed");
  });

  it("rejects a member none of whose teams has the area and tells them to ask an owner or admin", async () => {
    await expect(
      call(whoAmI, undefined, {
        context: member("member", { teams: [finance], activeTeamId: finance.id }),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Ask an organization owner or admin to add you to a team with node-operations.",
      data: { requiredPermissions: ["node-operations"] },
    });
  });

  it("allows a member through another team granted the area, whatever team is active", async () => {
    await expect(
      call(whoAmI, undefined, {
        context: member("member", { teams: [finance, ops], activeTeamId: finance.id }),
      }),
    ).resolves.toBe("allowed");
  });

  it("rejects a member with no active team and no team granted the area", async () => {
    await expect(
      call(whoAmI, undefined, { context: member("member", { teams: [finance] }) }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { requiredPermissions: ["node-operations"] },
    });
    await expect(call(whoAmI, undefined, { context: member("member", {}) })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("lets a member with no active team through when one of their teams has the area", async () => {
    await expect(
      call(whoAmI, undefined, { context: member("member", { teams: [finance, ops] }) }),
    ).resolves.toBe("allowed");
  });

  it("rejects a caller with no organization membership", async () => {
    const context = { ...member("member", {}), organization: null } as unknown as AuthContext;
    await expect(call(whoAmI, undefined, { context })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("lets organization owners, admins and platform admins through regardless of area", async () => {
    await expect(
      call(whoAmI, undefined, {
        context: member("owner", { teams: [finance], activeTeamId: finance.id }),
      }),
    ).resolves.toBe("allowed");
    await expect(
      call(whoAmI, undefined, {
        context: member("member", { teams: [finance], activeTeamId: finance.id }, "admin"),
      }),
    ).resolves.toBe("allowed");
  });
});
