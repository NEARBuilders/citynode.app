import { useQuery } from "@tanstack/react-query";
import { type ApiClient, useApiClient } from "@/app";

export const TENANT_CONFIG_REFETCH_MS = 15_000;

type RegistryAppResult = Awaited<ReturnType<ApiClient["registry"]["getRegistryApp"]>>["data"];

export function usePublishedConfig(accountId: string, gatewayId: string) {
  const apiClient = useApiClient();

  const registryQuery = useQuery({
    queryKey: ["node-config", "registry-app", accountId, gatewayId],
    queryFn: async () => {
      try {
        const result = await apiClient.registry.getRegistryApp({ accountId, gatewayId });
        return result.data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!accountId && !!gatewayId,
    refetchInterval: TENANT_CONFIG_REFETCH_MS,
  });

  const fetchPublishedNow = (): Promise<RegistryAppResult | null> =>
    apiClient.registry
      .getRegistryApp({ accountId, gatewayId })
      .then((result) => result.data ?? null)
      .catch(() => null);

  return {
    registryQuery,
    resolvedConfig: registryQuery.data?.resolvedConfig ?? null,
    configPublished: !!registryQuery.data,
    fetchPublishedNow,
  };
}
