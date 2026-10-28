import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";
import { eligibleCodes, summarizeReturningMembers } from "@/lib/returning-members";

export const returningMembersQueryKeys = {
  all: ["returning-members"] as const,
  organization: (organizationId: string, nodeIds: readonly string[]) =>
    [...returningMembersQueryKeys.all, organizationId, [...nodeIds].sort()] as const,
};

const UPSTREAM_READ_CONCURRENCY = 6;

async function mapLimited<T, R>(items: readonly T[], read: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await read(items[index] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(UPSTREAM_READ_CONCURRENCY, items.length) }, worker),
  );
  return results;
}

export async function readReturningMembers(
  apiClient: ApiClient,
  organizationId: string,
  nodeIds: readonly string[],
  now: () => Date = () => new Date(),
) {
  const activities = await Promise.all(
    nodeIds.map((nodeId) => apiClient.listDiscoveryActivities({ nodeId })),
  );
  const eventIds = new Set(
    activities.flat().flatMap((activity) => (activity.kind === "event" ? [activity.id] : [])),
  );
  const listings = await mapLimited([...eventIds], async (eventId) => ({
    eventId,
    codes: await apiClient.auth.listOnboardingCodes({ organizationId, eventId }),
  }));
  const checkIns = await mapLimited(eligibleCodes(eventIds, listings), async (code) => {
    const status = await apiClient.auth.getOnboardingStatus({
      codeId: code.id,
      organizationId,
    });
    return { eventId: code.eventId, joined: status.joined };
  });
  return summarizeReturningMembers({
    eventIds,
    listings,
    checkIns,
    readAt: now().toISOString(),
  });
}

export function returningMembersQueryOptions(
  apiClient: ApiClient,
  organizationId: string,
  nodeIds: readonly string[],
) {
  return queryOptions({
    queryKey: returningMembersQueryKeys.organization(organizationId, nodeIds),
    queryFn: () => readReturningMembers(apiClient, organizationId, nodeIds),
    staleTime: 30 * 1000,
    retry: false,
  });
}
