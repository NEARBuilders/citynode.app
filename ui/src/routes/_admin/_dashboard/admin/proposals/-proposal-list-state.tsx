import { FileTextIcon } from "@phosphor-icons/react";
import { Button, Card, EmptyState, Skeleton } from "@/components";
import { DataTable, type DataTableColumnDef } from "@/components/data-table";
import type { Proposal } from "./-proposal-columns";
import type { ProposalReviewFilter } from "./-proposal-review";

interface ProposalListStateProps {
  activeFilter: ProposalReviewFilter;
  columns: DataTableColumnDef<Proposal>[];
  proposals: Proposal[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function ProposalListState({
  activeFilter,
  columns,
  proposals,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: ProposalListStateProps) {
  if (isLoading) {
    return (
      <Card className="space-y-3 p-6">
        {[1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </Card>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={FileTextIcon}
        title="Failed to load proposals"
        description={errorMessage || "Something went wrong while loading proposals."}
        action={
          <Button variant="outline" onClick={onRetry}>
            retry
          </Button>
        }
      />
    );
  }

  if (proposals.length === 0) {
    return (
      <EmptyState
        icon={FileTextIcon}
        title={activeFilter === "pending" ? "No pending proposals." : "No proposals found."}
        description={`There are no ${activeFilter === "all" ? "" : `${activeFilter} `}proposals to show.`}
        className="min-h-80"
      />
    );
  }

  return (
    <div className="space-y-4 overflow-x-auto">
      <DataTable columns={columns} data={proposals} />
      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onLoadMore} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "loading..." : "load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
