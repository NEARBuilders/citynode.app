import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiClient, useApiClient } from "@/app";

export const TENANT_CONFIG_REFETCH_MS = 15_000;

function publishedConfigQueryOptions(apiClient: ApiClient, accountId: string, gatewayId: string) {
  return queryOptions({
    queryKey: ["node-config", "registry-app", accountId, gatewayId],
    queryFn: async () => {
      try {
        const result = await apiClient.registry.getRegistryApp({ accountId, gatewayId });
        return result.data ?? null;
      } catch {
        return null;
      }
    },
  });
}

export function usePublishedConfig(accountId: string, gatewayId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const options = publishedConfigQueryOptions(apiClient, accountId, gatewayId);

  const registryQuery = useQuery({
    ...options,
    enabled: !!accountId && !!gatewayId,
    refetchInterval: TENANT_CONFIG_REFETCH_MS,
  });

  const fetchPublishedNow = () => queryClient.fetchQuery({ ...options, staleTime: 0 });

  return {
    registryQuery,
    resolvedConfig: registryQuery.data?.resolvedConfig ?? null,
    configPublished: !!registryQuery.data,
    fetchPublishedNow,
  };
}
