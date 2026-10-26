import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiClient } from "@/app";
import { Button, EmptyState } from "@/components";
import { ItemGroup } from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { Disclosure, ListSkeleton } from "../-admin-ui";
import { ReviewHistoryCard } from "./-review-history-card";

const HISTORY_PREVIEW = 8;

type ReviewHistoryResponse = Awaited<ReturnType<ApiClient["proposals"]["getReviewHistory"]>>;

export function ProposalReviewHistory({
  query,
}: {
  query: Pick<UseQueryResult<ReviewHistoryResponse>, "data" | "isLoading" | "isError" | "error">;
}) {
  const translate = useAppTranslation();
  const history = query.data?.data ?? [];
  const [showAll, setShowAll] = useState(false);
  return (
    <section className="flex flex-col gap-3" data-testid="admin-proposal-history">
      <Disclosure
        label={translate("admin.proposal.showDecisions")}
        openLabel={translate("admin.proposal.hideDecisions")}
        testId="admin-proposal-history-toggle"
      >
        {query.isLoading ? (
          <ListSkeleton rows={2} />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {translate("admin.decisionsFailed")}
          </p>
        ) : history.length === 0 ? (
          <EmptyState
            icon={ClockCounterClockwiseIcon}
            title={translate("admin.proposal.noDecisions")}
            description={translate("admin.proposal.noDecisionsHint")}
            className="py-10"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <ItemGroup>
              {(showAll ? history : history.slice(0, HISTORY_PREVIEW)).map((entry) => (
                <ReviewHistoryCard key={entry.id} entry={entry} />
              ))}
            </ItemGroup>
            {!showAll && history.length > HISTORY_PREVIEW && (
              <Button variant="ghost" className="self-center" onClick={() => setShowAll(true)}>
                {translate("common.showAllCount", { count: history.length })}
              </Button>
            )}
          </div>
        )}
      </Disclosure>
    </section>
  );
}
