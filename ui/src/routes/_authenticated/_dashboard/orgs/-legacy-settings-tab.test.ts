import { describe, expect, it } from "vitest";
import { isLegacySettingsTab, legacySettingsTarget } from "./-legacy-settings-tab";

describe("legacy organization settings tabs", () => {
  it.each(["node-config", "homepage"])("recognizes the retired %s tab", (tab) => {
    expect(isLegacySettingsTab(tab)).toBe(true);
  });

  it.each([
    "members",
    "teams",
    "onboard",
    "apikeys",
    undefined,
  ])("keeps %s as a live tab", (tab) => {
    expect(isLegacySettingsTab(tab)).toBe(false);
  });

  it("sends owners, admins and platform admins to the community's settings", () => {
    expect(legacySettingsTarget({ canViewSettings: true, tenantId: "tenant-1" })).toEqual({
      to: "settings",
      tenantId: "tenant-1",
    });
  });

  it("keeps members on the Members tab", () => {
    expect(legacySettingsTarget({ canViewSettings: false, tenantId: "tenant-1" })).toEqual({
      to: "members",
    });
  });

  it("falls back to the Members tab when the organization has no community", () => {
    expect(legacySettingsTarget({ canViewSettings: true, tenantId: null })).toEqual({
      to: "members",
    });
  });
});
