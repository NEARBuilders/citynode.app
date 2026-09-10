import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useApiClient } from "@/app";
import { Badge, SectionHeader } from "@/components";
import { createProposalColumns } from "./-proposal-columns";
import { normalizeProposalReviewFilter, ProposalReviewFilters } from "./-proposal-filters";
import { ProposalListState } from "./-proposal-list-state";
import {
  adminProposalListQueryOptions,
  DEFAULT_PROPOSAL_REVIEW_FILTER,
  type ProposalReviewFilter,
  parseProposalReviewFilter,
} from "./-proposal-review";

type AdminProposalSearch = { status?: ProposalReviewFilter };

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/proposals/")({
  validateSearch: (search: Record<string, unknown>): AdminProposalSearch => ({
    status: parseProposalReviewFilter(search.status),
  }),
  loaderDeps: ({ search }) => ({
    status: search.status ?? DEFAULT_PROPOSAL_REVIEW_FILTER,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureInfiniteQueryData(
      adminProposalListQueryOptions(context.apiClient, deps.status),
    ),
  head: () => ({
    meta: [{ title: "Proposal review | app" }],
  }),
  component: AdminProposals,
});

function AdminProposals() {
  const apiClient = useApiClient();
  const navigate = Route.useNavigate();
  const { status } = Route.useSearch();
  const activeFilter = status ?? DEFAULT_PROPOSAL_REVIEW_FILTER;
  const proposalsQuery = useInfiniteQuery(adminProposalListQueryOptions(apiClient, activeFilter));

  const columns = useMemo(createProposalColumns, []);

  const proposals = proposalsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const total = proposalsQuery.data?.pages[0]?.meta.total ?? 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Proposal review"
        action={
          <Badge variant="secondary">
            {total} {activeFilter === "all" ? "total" : activeFilter}
          </Badge>
        }
      />

      <ProposalReviewFilters
        value={activeFilter}
        onChange={(value) => navigate({ search: { status: normalizeProposalReviewFilter(value) } })}
      />

      <ProposalListState
        activeFilter={activeFilter}
        columns={columns}
        proposals={proposals}
        isLoading={proposalsQuery.isLoading}
        isError={proposalsQuery.isError}
        errorMessage={proposalsQuery.error?.message}
        onRetry={() => void proposalsQuery.refetch()}
        hasNextPage={proposalsQuery.hasNextPage}
        isFetchingNextPage={proposalsQuery.isFetchingNextPage}
        onLoadMore={() => void proposalsQuery.fetchNextPage()}
      />
    </div>
  );
}
