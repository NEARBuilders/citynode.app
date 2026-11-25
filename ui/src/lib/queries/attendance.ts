import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export const attendanceQueryKeys = {
  all: ["attendance"] as const,
  records: () => [...attendanceQueryKeys.all, "record"] as const,
  record: (organizationId: string | null) =>
    [...attendanceQueryKeys.records(), organizationId] as const,
  collectibles: (organizationId: string | null) =>
    [...attendanceQueryKeys.records(), "collectibles", organizationId] as const,
  reconcile: (organizationId: string) =>
    [...attendanceQueryKeys.all, "reconcile", organizationId] as const,
};

export function attendanceRecordQueryOptions(apiClient: ApiClient, organizationId: string | null) {
  return queryOptions({
    queryKey: attendanceQueryKeys.record(organizationId),
    queryFn: () => apiClient.getMyAttendance(organizationId ? { organizationId } : {}),
    staleTime: 60_000,
    retry: false,
  });
}

export function attendanceReconcileQueryOptions(apiClient: ApiClient, organizationId: string) {
  return queryOptions({
    queryKey: attendanceQueryKeys.reconcile(organizationId),
    queryFn: () => apiClient.reconcileAttendance({ organizationId }),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function collectiblesQueryOptions(apiClient: ApiClient, organizationId: string | null) {
  return queryOptions({
    queryKey: attendanceQueryKeys.collectibles(organizationId),
    queryFn: () => apiClient.getMyCollectibles(organizationId ? { organizationId } : {}),
    staleTime: 60_000,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.enabled &&
      query.state.data.collectibles.some((collectible) => collectible.status === "pending") &&
      query.state.dataUpdateCount < 12
        ? 5_000
        : false,
  });
}
