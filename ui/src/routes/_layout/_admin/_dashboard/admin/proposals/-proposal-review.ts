import type { ApiClient } from "@/app";

export const PROPOSAL_REVIEW_FILTERS = ["pending", "approved", "rejected", "all"] as const;

export const pendingProposalCountQueryKey = ["admin-proposals", "pending-count"] as const;

export type ProposalReviewFilter = (typeof PROPOSAL_REVIEW_FILTERS)[number];

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
  return {
    queryKey: pendingProposalCountQueryKey,
    queryFn: () => apiClient.proposals.getProposals({ reviewStatus: "pending" as const, limit: 1 }),
    staleTime: 15 * 1000,
  };
}
