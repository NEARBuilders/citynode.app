import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export type Organization = Awaited<ReturnType<ApiClient["auth"]["listOrganizations"]>>[number];

const ORGANIZATION_STALE_TIME = 30 * 1000;

export const organizationQueryKeys = {
  all: ["organizations"] as const,
  list: (userId: string | undefined) => [...organizationQueryKeys.all, "list", userId] as const,
  byId: (organizationId: string) =>
    [...organizationQueryKeys.all, "detail", organizationId] as const,
};

export function organizationByIdQueryOptions(apiClient: ApiClient, organizationId: string) {
  return queryOptions({
    queryKey: organizationQueryKeys.byId(organizationId),
    queryFn: () => apiClient.auth.getOrganizationForAdmin({ organizationId }),
    staleTime: ORGANIZATION_STALE_TIME,
  });
}

export function organizationsQueryOptions(apiClient: ApiClient, userId: string | undefined) {
  return queryOptions({
    queryKey: organizationQueryKeys.list(userId),
    queryFn: () => apiClient.auth.listOrganizations(),
    enabled: !!userId,
    staleTime: ORGANIZATION_STALE_TIME,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2000),
  });
}
