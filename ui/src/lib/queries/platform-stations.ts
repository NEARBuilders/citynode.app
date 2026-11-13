import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export const platformStationsQueryKey = ["platform-stations"] as const;

export function platformStationsQueryOptions(apiClient: ApiClient) {
  return queryOptions({
    queryKey: platformStationsQueryKey,
    queryFn: () => apiClient.getPlatformStations(),
  });
}
