import { queryOptions } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { ClientServiceConfig } from "everything-dev/ui/api";
import { useMemo } from "react";
import { type AgentsClient, createAgentsClient, createGrantScopedAgentsClient } from "@/api";

export function useAgentsConfig(): ClientServiceConfig {
  const context = useRouter().options.context as {
    runtimeConfig?: { hostUrl?: string; rpcBase?: string };
  };
  const hostUrl = context.runtimeConfig?.hostUrl;
  const rpcBase = context.runtimeConfig?.rpcBase;
  if (!hostUrl || !rpcBase) {
    throw new Error("Runtime API config unavailable — the agents panel needs hostUrl and rpcBase");
  }
  return { hostUrl, rpcBase: rpcBase as `/${string}` };
}

export function useAgentsClient(): AgentsClient {
  const config = useAgentsConfig();
  return useMemo(() => createAgentsClient(config), [config.hostUrl, config.rpcBase]);
}

export function useGrantAgentsClient(grantToken: string | null): AgentsClient {
  const config = useAgentsConfig();
  return useMemo(
    () =>
      grantToken ? createGrantScopedAgentsClient(config, grantToken) : createAgentsClient(config),
    [config.hostUrl, config.rpcBase, grantToken],
  );
}

export const agentKeys = {
  all: (agentId: string) => ["agents", agentId] as const,
  detail: (agentId: string) => [...agentKeys.all(agentId), "detail"] as const,
  wallet: (agentId: string) => [...agentKeys.all(agentId), "wallet"] as const,
  balances: (agentId: string, source: "public" | "confidential") =>
    [...agentKeys.all(agentId), "balances", source] as const,
  policy: (agentId: string) => [...agentKeys.all(agentId), "policy"] as const,
  budget: (agentId: string) => [...agentKeys.all(agentId), "budget"] as const,
  timelock: (agentId: string) => [...agentKeys.all(agentId), "timelock"] as const,
  history: (agentId: string) => [...agentKeys.all(agentId), "history"] as const,
  grants: (agentId: string) => [...agentKeys.all(agentId), "grants"] as const,
};

export function agentDetailOptions(apiClient: AgentsClient, agentId: string) {
  return queryOptions({
    queryKey: agentKeys.detail(agentId),
    queryFn: () => apiClient.getAgent({ agentId }),
  });
}

export function agentWalletOptions(apiClient: AgentsClient, agentId: string) {
  return queryOptions({
    queryKey: agentKeys.wallet(agentId),
    queryFn: () => apiClient.getWallet({ agentId }),
  });
}

export function agentBalancesOptions(apiClient: AgentsClient, agentId: string) {
  return queryOptions({
    queryKey: agentKeys.balances(agentId, "public"),
    queryFn: () => apiClient.getBalances({ agentId, source: "public" }),
    refetchInterval: 30_000,
  });
}

export function agentPolicyOptions(apiClient: AgentsClient, agentId: string) {
  return queryOptions({
    queryKey: agentKeys.policy(agentId),
    queryFn: () => apiClient.getPolicy({ agentId }),
  });
}

export function agentBudgetOptions(apiClient: AgentsClient, agentId: string) {
  return queryOptions({
    queryKey: agentKeys.budget(agentId),
    queryFn: () => apiClient.getBudget({ agentId }),
  });
}

export function agentTimelockOptions(apiClient: AgentsClient, agentId: string) {
  return queryOptions({
    queryKey: agentKeys.timelock(agentId),
    queryFn: () => apiClient.getTimelock({ agentId }),
  });
}

export function agentHistoryOptions(apiClient: AgentsClient, agentId: string) {
  return queryOptions({
    queryKey: agentKeys.history(agentId),
    queryFn: async () => {
      const { data } = await apiClient.getHistory({ agentId, limit: 25 });
      return data ?? null;
    },
    refetchInterval: 15_000,
  });
}

export function agentGrantsOptions(apiClient: AgentsClient, agentId: string) {
  return queryOptions({
    queryKey: agentKeys.grants(agentId),
    queryFn: async () => {
      const { data } = await apiClient.listGrants({ agentId });
      return data ?? null;
    },
  });
}

export function agentTokenCatalogOptions(apiClient: AgentsClient) {
  return queryOptions({
    queryKey: ["agents", "token-catalog"],
    queryFn: async () => {
      const { data } = await apiClient.getTokenCatalog({});
      return data ?? null;
    },
    staleTime: 5 * 60_000,
  });
}
