export const ORGANIZATION_TABS = ["members", "teams", "invitations", "onboard", "apikeys"] as const;

export type OrganizationTab = (typeof ORGANIZATION_TABS)[number];

export function isOrganizationTab(value: unknown): value is OrganizationTab {
  return ORGANIZATION_TABS.some((tab) => tab === value);
}

export function visibleOrganizationTabs({
  canManageMembers,
  canOrganize,
}: {
  canManageMembers: boolean;
  canOrganize: boolean;
}): OrganizationTab[] {
  if (canManageMembers) return [...ORGANIZATION_TABS];
  return canOrganize ? ["onboard"] : [];
}

export function resolveOrganizationTab(
  requested: unknown,
  visible: readonly OrganizationTab[],
): OrganizationTab | null {
  return visible.find((tab) => tab === requested) ?? visible[0] ?? null;
}
