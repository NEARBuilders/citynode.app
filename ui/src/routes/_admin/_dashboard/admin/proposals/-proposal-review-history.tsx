import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiClient } from "@/app";
import { Card, EmptyState, SectionHeader, Skeleton } from "@/components";
import { ReviewHistoryCard } from "./-review-history-card";

type ReviewHistoryResponse = Awaited<ReturnType<ApiClient["proposals"]["getReviewHistory"]>>;

export function ProposalReviewHistory({
  pluginId,
  query,
}: {
  pluginId: string;
  query: Pick<UseQueryResult<ReviewHistoryResponse>, "data" | "isLoading" | "isError" | "error">;
}) {
  const history = query.data?.data ?? [];
  return (
    <section className="space-y-3">
      <SectionHeader title="Review history" />
      {query.isLoading ? (
        <Card className="space-y-3 p-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </Card>
      ) : query.isError ? (
        <Card className="p-6 text-sm text-destructive">
          Review history could not be loaded: {query.error?.message}
        </Card>
      ) : history.length === 0 ? (
        <EmptyState
          icon={ClockCounterClockwiseIcon}
          title="No review history"
          description={`No ${pluginId} proposals have been approved or rejected yet.`}
        />
      ) : (
        <div className="space-y-3">
          {history.map((entry) => (
            <ReviewHistoryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}
