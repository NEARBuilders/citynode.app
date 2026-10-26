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

const JOIN_TREND_SERIES = 4;

export type JoinMetric = keyof JoinCounts;

export type JoinTrendSeries = { key: string; label: string; other?: true };

type JoinTrendMonth = {
  month: string;
  total: number;
  values: Record<string, number>;
};

export function buildJoinTrend<T extends JoinsTenant>(
  tenants: readonly T[],
  months: readonly { month: string; joins: OrganizationJoins | undefined }[],
  metric: JoinMetric,
  seriesLimit = JOIN_TREND_SERIES,
): { series: JoinTrendSeries[]; months: JoinTrendMonth[] } {
  const perMonth = months.map(({ month, joins }) => ({
    month,
    rows: buildCommunityJoinRows(tenants, joins, undefined),
  }));
  const totals = new Map<string, { label: string; total: number }>();
  for (const { rows } of perMonth) {
    for (const row of rows) {
      const entry = totals.get(row.tenant.id) ?? { label: row.tenant.name, total: 0 };
      entry.total += row.thisMonth[metric];
      totals.set(row.tenant.id, entry);
    }
  }
  const ranked = [...totals.entries()]
    .filter(([, entry]) => entry.total > 0)
    .sort(([, a], [, b]) => b.total - a.total || a.label.localeCompare(b.label));
  const top = ranked.slice(0, seriesLimit);
  const topIds = new Set(top.map(([id]) => id));
  const hasOther = ranked.length > top.length;
  const series: JoinTrendSeries[] = [
    ...top.map(([key, { label }]) => ({ key, label })),
    ...(hasOther ? [{ key: "other", label: "other", other: true as const }] : []),
  ];
  return {
    series,
    months: perMonth.map(({ month, rows }) => {
      const values: Record<string, number> = {};
      let total = 0;
      for (const row of rows) {
        const value = row.thisMonth[metric];
        if (!value) continue;
        const key = topIds.has(row.tenant.id) ? row.tenant.id : "other";
        values[key] = (values[key] ?? 0) + value;
        total += value;
      }
      return { month, total, values };
    }),
  };
}
