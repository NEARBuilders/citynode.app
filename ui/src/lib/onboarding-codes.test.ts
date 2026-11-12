import { describe, expect, it } from "vitest";
import type { AuthRequestContext } from "@/lib/auth";
import { isOnboardingOrganizer, onboardingCodeState } from "./onboarding-codes";

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
  const hour = 3_600_000;
  const now = Date.parse("2026-11-12T00:00:00.000Z");
  const code = (overrides: Partial<Parameters<typeof onboardingCodeState>[0]> = {}) => ({
    expiresAt: new Date(now + hour),
    revokedAt: null,
    usedCount: 0,
    maxUses: 10,
    ...overrides,
  });

  it("treats a code without an expiry as never expiring", () => {
    expect(onboardingCodeState(code({ expiresAt: null }), now)).toBe("active");
    expect(onboardingCodeState(code({ expiresAt: null }), now + 10_000 * 86_400_000)).toBe(
      "active",
    );
  });

  it("still closes a code without an expiry when it is revoked or used up", () => {
    expect(onboardingCodeState(code({ expiresAt: null, revokedAt: new Date(now) }), now)).toBe(
      "revoked",
    );
    expect(onboardingCodeState(code({ expiresAt: null, usedCount: 10 }), now)).toBe("used-up");
  });

  it("expires a dated code once its time passes", () => {
    expect(onboardingCodeState(code(), now)).toBe("active");
    expect(onboardingCodeState(code(), now + 2 * hour)).toBe("expired");
  });
});
