export const LEGACY_SETTINGS_TABS = ["node-config", "homepage"] as const;

export type LegacySettingsTab = (typeof LEGACY_SETTINGS_TABS)[number];

export function isLegacySettingsTab(value: unknown): value is LegacySettingsTab {
  return LEGACY_SETTINGS_TABS.some((tab) => tab === value);
}

export function legacySettingsTarget({
  canViewSettings,
  tenantId,
}: {
  canViewSettings: boolean;
  tenantId: string | null | undefined;
}): { to: "settings"; tenantId: string } | { to: "members" } {
  return canViewSettings && tenantId ? { to: "settings", tenantId } : { to: "members" };
}
