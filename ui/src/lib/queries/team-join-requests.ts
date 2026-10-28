import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export const teamJoinQueryKeys = {
  all: ["team-join-board"] as const,
  organization: (organizationId: string) => [...teamJoinQueryKeys.all, organizationId] as const,
};

export function teamJoinBoardQueryOptions(apiClient: ApiClient, organizationId: string) {
  return queryOptions({
    queryKey: teamJoinQueryKeys.organization(organizationId),
    queryFn: () => apiClient.getTeamJoinBoard({ organizationId }),
    staleTime: 30 * 1000,
    retry: false,
  });
}
