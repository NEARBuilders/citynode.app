import { describe, expect, it } from "vitest";
import type { AuthRequestContext } from "@/lib/auth";
import { isOnboardingOrganizer } from "./onboarding-codes";

function contextFor({
  userRole = "user",
  memberRole,
  teamAreas = [],
}: {
  userRole?: string;
  memberRole?: string;
  teamAreas?: string[][];
}) {
  return {
    user: { id: "u1", role: userRole },
    organization: {
      activeOrganizationId: "org-1",
      member: memberRole ? { role: memberRole } : null,
      teams: teamAreas.map((areas, index) => ({ id: `t${index}`, name: `Team ${index}`, areas })),
      activeTeamId: null,
    },
  } as unknown as AuthRequestContext;
}

describe("isOnboardingOrganizer", () => {
  it("lets owners and admins organize", () => {
    expect(isOnboardingOrganizer(contextFor({ memberRole: "owner" }))).toBe(true);
    expect(isOnboardingOrganizer(contextFor({ memberRole: "admin" }))).toBe(true);
  });

  it("lets a member organize only through a team granted events", () => {
    expect(
      isOnboardingOrganizer(contextFor({ memberRole: "member", teamAreas: [["finance"]] })),
    ).toBe(false);
    expect(
      isOnboardingOrganizer(
        contextFor({ memberRole: "member", teamAreas: [["finance"], ["events"]] }),
      ),
    ).toBe(true);
  });

  it("does not treat a platform admin who isn't a member as an organizer", () => {
    expect(isOnboardingOrganizer(contextFor({ userRole: "admin" }))).toBe(false);
    expect(isOnboardingOrganizer(contextFor({ userRole: "admin", teamAreas: [["events"]] }))).toBe(
      false,
    );
  });

  it("hides onboarding while the auth context is unavailable", () => {
    expect(isOnboardingOrganizer(null)).toBe(false);
    expect(isOnboardingOrganizer(undefined)).toBe(false);
  });
});
