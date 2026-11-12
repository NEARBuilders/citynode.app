import { describe, expect, it } from "vitest";
import type { AuthRequestContext } from "@/lib/auth";
import { formatRemaining, isOnboardingOrganizer, onboardingCodeState } from "./onboarding-codes";

const NOW = Date.parse("2026-11-12T00:00:00.000Z");

function code(
  overrides: Partial<{
    expiresAt: Date | null;
    revokedAt: Date | null;
    usedCount: number;
    maxUses: number;
  }> = {},
) {
  return {
    expiresAt: new Date(NOW + 86_400_000),
    revokedAt: null,
    usedCount: 0,
    maxUses: 10,
    ...overrides,
  };
}

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

describe("onboardingCodeState", () => {
  it("keeps a future expiry active", () => {
    expect(onboardingCodeState(code(), NOW)).toBe("active");
  });

  it("treats a missing expiry as expired", () => {
    expect(onboardingCodeState(code({ expiresAt: null }), NOW)).toBe("expired");
  });
});

describe("formatRemaining", () => {
  it("shows expired when the timestamp is missing", () => {
    expect(formatRemaining(null, NOW)).toBe("Expired");
  });
});
