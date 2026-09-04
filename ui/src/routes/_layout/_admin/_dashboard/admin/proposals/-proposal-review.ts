import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export const PROPOSAL_REVIEW_FILTERS = ["pending", "approved", "rejected", "all"] as const;

export type ProposalReviewFilter = (typeof PROPOSAL_REVIEW_FILTERS)[number];

export const DEFAULT_PROPOSAL_REVIEW_FILTER: ProposalReviewFilter = "all";

export const proposalReviewQueryKeys = {
  all: ["admin-proposals"] as const,
  lists: () => [...proposalReviewQueryKeys.all, "list"] as const,
  list: (filter: ProposalReviewFilter) => [...proposalReviewQueryKeys.lists(), filter] as const,
  pendingCount: () => [...proposalReviewQueryKeys.all, "pending-count"] as const,
  details: () => [...proposalReviewQueryKeys.all, "detail"] as const,
  detail: (proposalId: string, pluginId?: string, entityId?: string) =>
    [...proposalReviewQueryKeys.details(), proposalId, pluginId, entityId] as const,
  histories: () => [...proposalReviewQueryKeys.all, "review-history"] as const,
  history: (pluginId?: string) => [...proposalReviewQueryKeys.histories(), pluginId] as const,
};

export function parseProposalReviewFilter(value: unknown): ProposalReviewFilter | undefined {
  return typeof value === "string" &&
    PROPOSAL_REVIEW_FILTERS.includes(value as ProposalReviewFilter)
    ? (value as ProposalReviewFilter)
    : undefined;
}

export function proposalReviewStatusVariant(
  status: "pending" | "approved" | "rejected" | "removed",
) {
  if (status === "rejected") return "destructive" as const;
  if (status === "pending") return "secondary" as const;
  if (status === "removed") return "outline" as const;
  return "default" as const;
}

export function pendingProposalCountQueryOptions(apiClient: ApiClient) {
  return queryOptions({
    queryKey: proposalReviewQueryKeys.pendingCount(),
    queryFn: () => apiClient.proposals.getProposals({ reviewStatus: "pending" as const, limit: 1 }),
    staleTime: 15 * 1000,
  });
}

export function adminProposalListQueryOptions(apiClient: ApiClient, filter: ProposalReviewFilter) {
  return infiniteQueryOptions({
    queryKey: proposalReviewQueryKeys.list(filter),
    queryFn: ({ pageParam }) =>
      apiClient.proposals.getProposals({
        ...(filter !== "all" && { reviewStatus: filter }),
        limit: 50,
        ...(pageParam !== undefined && { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    staleTime: 15 * 1000,
  });
}

export function adminProposalDetailQueryOptions(
  apiClient: ApiClient,
  proposalId: string,
  pluginId?: string,
  entityId?: string,
) {
  return queryOptions({
    queryKey: proposalReviewQueryKeys.detail(proposalId, pluginId, entityId),
    queryFn: async () => {
      if (!pluginId || !entityId) throw new Error("Proposal location is missing");
      const result = await apiClient.proposals.getProposals({ pluginId, entityId, limit: 1 });
      return result.data.find((proposal) => proposal.id === proposalId) ?? null;
    },
    enabled: !!pluginId && !!entityId,
  });
}

export function proposalReviewHistoryQueryOptions(apiClient: ApiClient, pluginId?: string) {
  return queryOptions({
    queryKey: proposalReviewQueryKeys.history(pluginId),
    queryFn: () => {
      if (!pluginId) throw new Error("Plugin ID is missing");
      return apiClient.proposals.getReviewHistory({ pluginId, limit: 100 });
    },
    enabled: !!pluginId,
    staleTime: 15 * 1000,
  });
}
