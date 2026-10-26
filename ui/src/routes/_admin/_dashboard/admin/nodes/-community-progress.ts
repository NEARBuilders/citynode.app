import type { ApiClient } from "@/app";

export type CommunityEvent = Pick<
  Awaited<ReturnType<ApiClient["listDiscoveryActivities"]>>[number],
  "kind" | "status" | "publishedAt" | "startsAt" | "endsAt" | "luma"
>;

function isListedEvent(activity: CommunityEvent, now: number) {
  return (
    activity.kind === "event" &&
    activity.status === "published" &&
    !activity.luma?.hidden &&
    activity.luma?.available !== false &&
    Date.parse(activity.publishedAt) <= now
  );
}

export type SplitEvents<T> = { upcoming: T[]; past: T[] };

export function splitCommunityEvents<T extends CommunityEvent>(
  activities: readonly T[],
  now: number,
): SplitEvents<T> {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const activity of activities) {
    if (!isListedEvent(activity, now)) continue;
    const boundary = activity.endsAt ?? activity.startsAt;
    if (!boundary || Date.parse(boundary) >= now) upcoming.push(activity);
    else past.push(activity);
  }
  const startOf = (event: T) =>
    event.startsAt ? Date.parse(event.startsAt) : Number.POSITIVE_INFINITY;
  upcoming.sort((a, b) => startOf(a) - startOf(b));
  past.sort((a, b) => startOf(b) - startOf(a));
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
