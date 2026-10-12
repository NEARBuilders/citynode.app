export const COMMUNITY_JOINS_LIMIT = 10;

export type JoinsTenant = {
  id: string;
  name: string;
  orgId: string | null;
  status: string;
  createdAt: string;
};

export type JoinCounts = { redeemed: number; newMembers: number };

export type OrganizationJoins = {
  organizations: readonly ({ organizationId: string } & JoinCounts)[];
};

export type CommunityJoinRow<T extends JoinsTenant> = {
  tenant: T;
  thisMonth: JoinCounts;
  lastMonth: JoinCounts;
};

const NO_JOINS: JoinCounts = { redeemed: 0, newMembers: 0 };

function olderTenant<T extends JoinsTenant>(a: T, b: T) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? a : b;
  return a.id <= b.id ? a : b;
}

function countsByOrganization(joins: OrganizationJoins | undefined) {
  return new Map<string, JoinCounts>(
    joins?.organizations.map(({ organizationId, redeemed, newMembers }) => [
      organizationId,
      { redeemed, newMembers },
    ]),
  );
}

export function buildCommunityJoinRows<T extends JoinsTenant>(
  tenants: readonly T[],
  current: OrganizationJoins | undefined,
  previous: OrganizationJoins | undefined,
): CommunityJoinRow<T>[] {
  const byOrganization = new Map<string, T>();
  for (const tenant of tenants) {
    if (!tenant.orgId || tenant.status === "pending_deletion") continue;
    const existing = byOrganization.get(tenant.orgId);
    byOrganization.set(tenant.orgId, existing ? olderTenant(existing, tenant) : tenant);
  }
  const thisMonth = countsByOrganization(current);
  const lastMonth = countsByOrganization(previous);
  return [...byOrganization.entries()]
    .map(([orgId, tenant]) => ({
      tenant,
      thisMonth: thisMonth.get(orgId) ?? NO_JOINS,
      lastMonth: lastMonth.get(orgId) ?? NO_JOINS,
    }))
    .sort(
      (a, b) =>
        b.thisMonth.redeemed - a.thisMonth.redeemed || a.tenant.name.localeCompare(b.tenant.name),
    );
}

export function visibleCommunityJoinRows<T>(rows: readonly T[], showAll: boolean): readonly T[] {
  return showAll ? rows : rows.slice(0, COMMUNITY_JOINS_LIMIT);
}
