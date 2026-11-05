import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";
import {
  readChainTimeNs,
  readDaoProposal,
  readDaoProposalPage,
  readSputnikPolicy,
} from "@/lib/sputnik-proposals";

export const nodeDaoQueryKeys = {
  dao: (nodeId: string) => ["node-dao", nodeId] as const,
  proposals: (daoAccountId: string) => ["node-dao", "proposals", daoAccountId] as const,
  proposal: (daoAccountId: string, id: number) =>
    ["node-dao", "proposal", daoAccountId, id] as const,
  policy: (daoAccountId: string) => ["node-dao", "policy", daoAccountId] as const,
  chainTime: () => ["node-dao", "chain-time"] as const,
};

export function nodeDaoQueryOptions(apiClient: ApiClient, nodeId: string) {
  return queryOptions({
    queryKey: nodeDaoQueryKeys.dao(nodeId),
    queryFn: () => apiClient.getNodeDao({ nodeId }),
    staleTime: 60_000,
    retry: false,
  });
}

export function daoProposalPagesQueryOptions(daoAccountId: string) {
  return infiniteQueryOptions({
    queryKey: nodeDaoQueryKeys.proposals(daoAccountId),
    queryFn: ({ pageParam }) => readDaoProposalPage(daoAccountId, { before: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.nextBefore ?? undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function daoProposalQueryOptions(daoAccountId: string, id: number) {
  return queryOptions({
    queryKey: nodeDaoQueryKeys.proposal(daoAccountId, id),
    queryFn: () => readDaoProposal(daoAccountId, id),
    staleTime: 30_000,
    retry: false,
  });
}

export function daoPolicyQueryOptions(daoAccountId: string) {
  return queryOptions({
    queryKey: nodeDaoQueryKeys.policy(daoAccountId),
    queryFn: () => readSputnikPolicy(daoAccountId),
    staleTime: 60_000,
    retry: false,
  });
}

// KEEP: Sputnik checks proposal periods against block time, not the viewer's clock.
export function chainTimeQueryOptions() {
  return queryOptions({
    queryKey: nodeDaoQueryKeys.chainTime(),
    queryFn: readChainTimeNs,
    staleTime: 30_000,
    retry: false,
  });
}
