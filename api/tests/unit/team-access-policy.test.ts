import { describe, expect, it } from "vitest";
import { resolveTeamAccess } from "../../src/team-access-policy";

describe("team access policy", () => {
  it.each([
    null,
    "stale-team",
  ])("does not restrict an unresolved active team: %s", (activeTeamId) => {
    const finance = { id: "finance", name: "Finance", areas: ["finance"] };
    expect(resolveTeamAccess({ organization: { teams: [finance], activeTeamId } })).toEqual({
      teams: [finance],
      activeTeam: null,
      bypass: false,
      allowedAreas: null,
    });
  });

  it("treats missing organization context as unrestricted without an active team", () => {
    expect(resolveTeamAccess(null)).toEqual({
      teams: [],
      activeTeam: null,
      bypass: false,
      allowedAreas: null,
    });
  });

  it.each([
    { userRole: "user", orgRole: "owner" },
    { userRole: "user", orgRole: "admin" },
    { userRole: "admin", orgRole: "member" },
  ])("leaves $userRole / $orgRole unrestricted", ({ userRole, orgRole }) => {
    const finance = { id: "finance", name: "Finance", areas: ["finance"] };
    expect(
      resolveTeamAccess({
        user: { role: userRole },
        organization: {
          member: { role: orgRole },
          teams: [finance],
          activeTeamId: finance.id,
        },
      }),
    ).toEqual({ teams: [finance], activeTeam: finance, bypass: true, allowedAreas: null });
  });

  it("grants a member only recognized areas of their selected team", () => {
    const finance = { id: "finance", name: "Finance", areas: ["finance", "unknown-area"] };

    expect(
      resolveTeamAccess({
        user: { role: "user" },
        organization: {
          member: { role: "member" },
          teams: [finance],
          activeTeamId: "finance",
        },
      }),
    ).toEqual({ teams: [finance], activeTeam: finance, bypass: false, allowedAreas: ["finance"] });
  });
});
