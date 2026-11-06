import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export const eventReportQueryKeys = {
  all: ["event-reports"] as const,
  report: (activityId: string) => [...eventReportQueryKeys.all, "report", activityId] as const,
  statuses: (nodeId: string) => [...eventReportQueryKeys.all, "statuses", nodeId] as const,
};

export function eventReportQueryOptions(apiClient: ApiClient, activityId: string) {
  return queryOptions({
    queryKey: eventReportQueryKeys.report(activityId),
    queryFn: () => apiClient.getEventReport({ activityId }),
    retry: false,
  });
}

export function eventReportStatusesQueryOptions(apiClient: ApiClient, nodeId: string) {
  return queryOptions({
    queryKey: eventReportQueryKeys.statuses(nodeId),
    queryFn: () => apiClient.listEventReportStatuses({ nodeId }),
    retry: false,
  });
}

export function eventCheckInCountQueryOptions(
  apiClient: ApiClient,
  organizationId: string | null,
  eventId: string,
) {
  return queryOptions({
    queryKey: [...eventReportQueryKeys.all, "check-ins", organizationId, eventId] as const,
    queryFn: async () => {
      const codes = await apiClient.auth.listOnboardingCodes({
        eventId,
        ...(organizationId ? { organizationId } : {}),
      });
      return codes.reduce((sum, code) => sum + code.usedCount, 0);
    },
    enabled: !!organizationId,
    retry: false,
  });
}
