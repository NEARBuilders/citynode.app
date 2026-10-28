type OrganizationLike = {
  id: string;
  slug: string;
  status?: string | null;
  metadata?: unknown;
};

export type CommunityMembership<T extends OrganizationLike> =
  | { status: "unknown" }
  | { status: "none" }
  | { status: "active"; organization: T }
  | { status: "open"; organization: T }
  | { status: "choose"; count: number };

export function isPersonalOrganization(
  organization: OrganizationLike,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  const metadata = organization.metadata as { isPersonal?: unknown } | null | undefined;
  return organization.slug === userId || metadata?.isPersonal === true;
}

export function visibleOrganizations<T extends OrganizationLike>(
  organizations: readonly T[],
  userId: string | null | undefined,
): T[] {
  return organizations.filter((organization) => !isPersonalOrganization(organization, userId));
}

function isOpenable(organization: OrganizationLike) {
  return !organization.status || organization.status === "active";
}

export function resolveCommunityMembership<T extends OrganizationLike>({
  organizations,
  activeOrganizationId,
  userId,
  refreshing = false,
}: {
  organizations: readonly T[] | undefined;
  activeOrganizationId: string | null | undefined;
  userId: string | null | undefined;
  refreshing?: boolean;
}): CommunityMembership<T> {
  if (!organizations || !userId) return { status: "unknown" };
  const activeListed = organizations.some(
    (organization) => organization.id === activeOrganizationId,
  );
  if (activeOrganizationId && !activeListed && refreshing) return { status: "unknown" };
  const visible = visibleOrganizations(organizations, userId);
  const active = visible.find(
    (organization) => organization.id === activeOrganizationId && isOpenable(organization),
  );
  if (active) return { status: "active", organization: active };
  const openable = visible.filter(isOpenable);
  if (openable.length === 0) return { status: "none" };
  const activeIsPersonal = organizations.some(
    (organization) =>
      organization.id === activeOrganizationId && isPersonalOrganization(organization, userId),
  );
  const [only] = openable;
  if (!activeIsPersonal && openable.length === 1 && only) {
    return { status: "open", organization: only };
  }
  return { status: "choose", count: openable.length };
}

export function communityOrganizationId(
  membership: CommunityMembership<OrganizationLike>,
): string | null {
  return membership.status === "active" || membership.status === "open"
    ? membership.organization.id
    : null;
}
