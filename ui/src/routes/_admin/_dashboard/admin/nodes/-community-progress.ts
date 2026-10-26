import { type DiscoveryActivity, upcomingEvents } from "@/components/discovery/event-onboarding";

export type SplitEvents<T> = { upcoming: T[]; past: T[] };

export function splitCommunityEvents(
  activities: readonly DiscoveryActivity[],
  now: number,
): SplitEvents<DiscoveryActivity> {
  const published = activities.filter((activity) => activity.status === "published");
  const upcoming = upcomingEvents(published, now);
  const upcomingIds = new Set(upcoming.map((event) => event.id));
  const past = published
    .filter((activity) => activity.kind === "event" && !upcomingIds.has(activity.id))
    .sort((a, b) => Date.parse(b.startsAt ?? "") - Date.parse(a.startsAt ?? ""));
  return { upcoming, past };
}

export type ProgressQuery<T> = {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
};

export type ProgressState<V> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; value: V };

export function progressState<T, V>(
  query: ProgressQuery<T> | null,
  select: (data: T) => V,
): ProgressState<V> {
  if (!query) return { status: "unavailable" };
  if (query.isError) return { status: "error" };
  if (query.isPending || query.data === undefined) return { status: "loading" };
  return { status: "ready", value: select(query.data) };
}

export type JoinCounts = { redeemed: number; newMembers: number };

export type MonthlyJoins = {
  organizations: readonly ({ organizationId: string } & JoinCounts)[];
};

export function organizationJoinCounts(joins: MonthlyJoins, orgId: string): JoinCounts {
  const row = joins.organizations.find((entry) => entry.organizationId === orgId);
  return { redeemed: row?.redeemed ?? 0, newMembers: row?.newMembers ?? 0 };
}

export function communityJoinsState<J>({
  hasSite,
  tenant,
  joins,
}: {
  hasSite: boolean;
  tenant: ProgressQuery<{ orgId: string | null } | null>;
  joins: ProgressQuery<J>;
}): ProgressState<J> {
  if (!hasSite) return { status: "unavailable" };
  if (tenant.isError) return { status: "error" };
  if (tenant.isPending) return { status: "loading" };
  if (!tenant.data?.orgId) return { status: "unavailable" };
  return progressState(joins, (data) => data);
}

export type AttentionItem =
  | "noSite"
  | "noOrganization"
  | "sitePending"
  | "siteSuspended"
  | "noStaking"
  | "noUpcomingEvents";

export function communityAttention({
  hasSite,
  tenant,
  stakingValidators,
  upcomingEvents,
}: {
  hasSite: boolean;
  tenant: { status: string; orgId: string | null } | null | undefined;
  stakingValidators: number;
  upcomingEvents: number | undefined;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (!hasSite) items.push("noSite");
  if (tenant && !tenant.orgId) items.push("noOrganization");
  if (tenant?.status === "pending") items.push("sitePending");
  if (tenant?.status === "suspended") items.push("siteSuspended");
  if (stakingValidators === 0) items.push("noStaking");
  if (upcomingEvents === 0) items.push("noUpcomingEvents");
  return items;
}
