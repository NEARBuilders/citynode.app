import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";
import { readDaoProposal, readDaoProposalPage } from "@/lib/sputnik-proposals";

export const nodeDaoQueryKeys = {
  dao: (nodeId: string) => ["node-dao", nodeId] as const,
  proposals: (daoAccountId: string) => ["node-dao", "proposals", daoAccountId] as const,
  proposal: (daoAccountId: string, id: number) =>
    ["node-dao", "proposal", daoAccountId, id] as const,
};

/** The DAO recorded as the community's owner, read live from City Node (public). */
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
