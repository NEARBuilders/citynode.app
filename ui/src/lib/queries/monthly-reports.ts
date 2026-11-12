import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export const monthlyReportQueryKeys = {
  all: ["monthly-reports"] as const,
  report: (nodeId: string, month: string) =>
    [...monthlyReportQueryKeys.all, "report", nodeId, month] as const,
  statuses: (nodeId: string) => [...monthlyReportQueryKeys.all, "statuses", nodeId] as const,
  communities: () => [...monthlyReportQueryKeys.all, "communities"] as const,
};

export function monthlyReportQueryOptions(apiClient: ApiClient, nodeId: string, month: string) {
  return queryOptions({
    queryKey: monthlyReportQueryKeys.report(nodeId, month),
    queryFn: () => apiClient.getMonthlyReport({ nodeId, month }),
    retry: false,
  });
}

export function monthlyReportStatusesQueryOptions(apiClient: ApiClient, nodeId: string) {
  return queryOptions({
    queryKey: monthlyReportQueryKeys.statuses(nodeId),
    queryFn: () => apiClient.listMonthlyReportStatuses({ nodeId }),
    retry: false,
  });
}

export function reportCommunitiesQueryOptions(apiClient: ApiClient) {
  return queryOptions({
    queryKey: monthlyReportQueryKeys.communities(),
    queryFn: () => apiClient.listReportCommunities(),
    staleTime: 30 * 1000,
    retry: false,
  });
}

export function adminMonthlyReportsQueryOptions(apiClient: ApiClient, month: string) {
  return queryOptions({
    queryKey: [...monthlyReportQueryKeys.all, "admin", month] as const,
    queryFn: () => apiClient.getAdminMonthlyReports({ month }),
    staleTime: 30 * 1000,
  });
}
