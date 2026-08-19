import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { RelayerInfo } from "better-near-auth";
import type { AuthClient } from "./auth";
import { useAuthClient } from "./auth";

export type RelayerInfoData = RelayerInfo & { enabled: boolean };

export const relayerInfoQueryKey = ["relayer-info"] as const;

export function useRelayerInfoQuery(
  auth: AuthClient = useAuthClient(),
): UseQueryResult<RelayerInfoData | null> {
  return useQuery({
    queryKey: relayerInfoQueryKey,
    queryFn: async () => {
      const { data } = await auth.near.getRelayerInfo();
      return (data ?? null) as RelayerInfoData | null;
    },
    refetchInterval: 30_000,
  });
}
