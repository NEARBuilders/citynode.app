import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export const memberDirectoryQueryKeys = {
  all: ["member-directory"] as const,
  optIn: () => [...memberDirectoryQueryKeys.all, "opt-in"] as const,
  organization: (organizationId: string) =>
    [...memberDirectoryQueryKeys.all, "organization", organizationId] as const,
  nodeCount: (nodeId: string) => [...memberDirectoryQueryKeys.all, "node-count", nodeId] as const,
};

export const memberDirectoryChannelName = "member-directory";

export function memberDirectoryOptInQueryOptions(apiClient: ApiClient) {
  return queryOptions({
    queryKey: memberDirectoryQueryKeys.optIn(),
    queryFn: () => apiClient.getMemberDirectoryOptIn(),
  });
}

export function memberDirectoryQueryOptions(apiClient: ApiClient, organizationId: string) {
  return queryOptions({
    queryKey: memberDirectoryQueryKeys.organization(organizationId),
    queryFn: () => apiClient.getMemberDirectory({ organizationId }),
    staleTime: 60_000,
    refetchOnMount: "always",
    retry: false,
  });
}

export function nodeMemberCountQueryOptions(apiClient: ApiClient, nodeId: string) {
  return queryOptions({
    queryKey: memberDirectoryQueryKeys.nodeCount(nodeId),
    queryFn: () => apiClient.getNodeMemberCount({ nodeId }),
    retry: false,
  });
}
