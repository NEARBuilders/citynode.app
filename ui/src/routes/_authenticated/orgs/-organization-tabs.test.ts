import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_TABS,
  resolveOrganizationTab,
  visibleOrganizationTabs,
} from "./-organization-tabs";

const roles = {
  owner: { canManageMembers: true, canOrganize: true },
  admin: { canManageMembers: true, canOrganize: true },
  organizer: { canManageMembers: false, canOrganize: true },
  member: { canManageMembers: false, canOrganize: false },
};

describe("organization tabs by role", () => {
  it.each(["owner", "admin"] as const)("shows every tab to an %s", (role) => {
    expect(visibleOrganizationTabs(roles[role])).toEqual([...ORGANIZATION_TABS]);
  });

  it("shows only the onboarding tab to an organizer", () => {
    expect(visibleOrganizationTabs(roles.organizer)).toEqual(["onboard"]);
  });

  it("shows no tabs to a plain member", () => {
    expect(visibleOrganizationTabs(roles.member)).toEqual([]);
  });
});

describe("organization tab fallback", () => {
  it.each([...ORGANIZATION_TABS])("keeps %s open for an owner", (tab) => {
    expect(resolveOrganizationTab(tab, visibleOrganizationTabs(roles.owner))).toBe(tab);
  });

  it.each([
    "members",
    "teams",
    "invitations",
    "apikeys",
  ])("sends an organizer's %s link to onboarding", (tab) => {
    expect(resolveOrganizationTab(tab, visibleOrganizationTabs(roles.organizer))).toBe("onboard");
  });

  it.each([
    "members",
    "teams",
    "invitations",
    "onboard",
    "apikeys",
    "homepage",
    "node-config",
    "unknown",
    undefined,
  ])("leaves a plain member on the overview for %s", (tab) => {
    expect(resolveOrganizationTab(tab, visibleOrganizationTabs(roles.member))).toBeNull();
  });

  it("falls back to the first visible tab for an invalid value", () => {
    expect(resolveOrganizationTab("unknown", visibleOrganizationTabs(roles.admin))).toBe("members");
  });
});
