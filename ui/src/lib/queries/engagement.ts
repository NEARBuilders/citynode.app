import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

const ENGAGEMENT_STALE_TIME = 60_000;

export const engagementQueryKeys = {
  all: ["engagement"] as const,
  communities: () => [...engagementQueryKeys.all, "communities"] as const,
  teamRequests: (organizationId: string) =>
    [...engagementQueryKeys.all, "team-requests", organizationId] as const,
  events: () => [...engagementQueryKeys.all, "events"] as const,
  platformAttendance: (month: string) =>
    [...engagementQueryKeys.all, "platform-attendance", month] as const,
};

export function communityEngagementQueryOptions(apiClient: ApiClient) {
  return queryOptions({
    queryKey: engagementQueryKeys.communities(),
    queryFn: () => apiClient.getCommunityEngagement(),
    staleTime: ENGAGEMENT_STALE_TIME,
  });
}

export function communityTeamRequestsQueryOptions(apiClient: ApiClient, organizationId: string) {
  return queryOptions({
    queryKey: engagementQueryKeys.teamRequests(organizationId),
    queryFn: () => apiClient.getCommunityTeamRequests({ organizationId }),
    staleTime: ENGAGEMENT_STALE_TIME,
  });
}

export function adminEventsQueryOptions(apiClient: ApiClient) {
  return queryOptions({
    queryKey: engagementQueryKeys.events(),
    queryFn: () => apiClient.getAdminEvents(),
    staleTime: ENGAGEMENT_STALE_TIME,
  });
}

export function platformAttendanceQueryOptions(apiClient: ApiClient, month: string) {
  return queryOptions({
    queryKey: engagementQueryKeys.platformAttendance(month),
    queryFn: () => apiClient.getPlatformAttendance({ month }),
    staleTime: ENGAGEMENT_STALE_TIME,
  });
}
