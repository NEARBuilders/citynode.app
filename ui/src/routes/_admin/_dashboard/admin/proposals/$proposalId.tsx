import { GavelIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { Button, Card, CardContent, EmptyState, PageHeader, Skeleton } from "@/components";
import { appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import type { Proposal } from "@/lib/queries/proposals";
import { invalidateTenantQueries } from "@/lib/queries/tenants";
import { BackLink } from "../-admin-ui";
import { approveProposal, rejectProposal } from "./-proposal-application";
import { ProposalStatusCell } from "./-proposal-columns";
import {
  adminProposalDetailQueryOptions,
  proposalReviewHistoryQueryOptions,
  proposalReviewQueryKeys,
  proposalTitle,
  proposalTypeLabel,
} from "./-proposal-review";
import { ProposalReviewActions } from "./-proposal-review-actions";
import { ProposalReviewHistory } from "./-proposal-review-history";
import { ProposalOutcome, ProposalRequest, ProposalTechnicalDetails } from "./-proposal-summary";

type ProposalDetailSearch = { pluginId?: string; entityId?: string };

export const Route = createFileRoute("/_admin/_dashboard/admin/proposals/$proposalId")({
  validateSearch: (search: Record<string, unknown>): ProposalDetailSearch => ({
    pluginId: typeof search.pluginId === "string" ? search.pluginId : undefined,
    entityId: typeof search.entityId === "string" ? search.entityId : undefined,
  }),
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "meta.proposalAdmin",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: ProposalDetailPage,
});

function ProposalDetailPage() {
  const translate = useAppTranslation();
  const { proposalId } = Route.useParams();
  const { pluginId, entityId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [rejectionReason, setRejectionReason] = useState("");
  const proposalQueryKey = proposalReviewQueryKeys.detail(proposalId, pluginId, entityId);
  const proposalQuery = useQuery(
    adminProposalDetailQueryOptions(apiClient, proposalId, pluginId, entityId),
  );
  const reviewHistoryQuery = useQuery(proposalReviewHistoryQueryOptions(apiClient, pluginId));

  const reviewMutation = useMutation({
    mutationKey: proposalQueryKey,
    mutationFn: async ({
      proposal,
      action,
      reason,
    }: {
      proposal: Proposal;
      action: "approve" | "reject";
      reason?: string;
    }) => {
      if (action === "reject") {
        const rejected = await rejectProposal({
          apiClient,
          proposal,
          reason: reason?.trim() ?? "",
        });
        return { action, proposal: rejected };
      }
      const approved = await approveProposal({ apiClient, proposal });
      queryClient.setQueryData(proposalQueryKey, approved);
      return { action, proposal: approved };
    },
    onSuccess: async ({ action, proposal }) => {
      toast.success(
        action === "reject"
          ? translate("admin.proposalRejected")
          : proposal.pluginId === "node"
            ? translate("admin.proposalApprovedOfficial")
            : translate("admin.proposalApproved"),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: proposalReviewQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: proposalReviewQueryKeys.histories() }),
        invalidateNodeQueries(queryClient),
        invalidateTenantQueries(queryClient),
      ]);
      await navigate({ to: "/admin/proposals" });
    },
    onError: async (error: Error) => {
      toast.error(appErrorMessage(error, translate));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: proposalQueryKey }),
        queryClient.invalidateQueries({ queryKey: proposalReviewQueryKeys.all }),
      ]);
    },
  });

  if (!pluginId || !entityId) {
    return (
      <EmptyState
        icon={GavelIcon}
        title={translate("admin.proposal.openList")}
        description={translate("admin.proposal.missingDetails")}
        action={
          <Button variant="outline" nativeButton={false} render={<Link to="/admin/proposals" />}>
            {translate("admin.proposal.back")}
          </Button>
        }
      />
    );
  }

  if (proposalQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (proposalQuery.isError || !proposalQuery.data) {
    return (
      <EmptyState
        icon={GavelIcon}
        title={translate("admin.proposal.notFound")}
        description={translate("admin.proposal.unavailable")}
        action={
          <Button variant="outline" nativeButton={false} render={<Link to="/admin/proposals" />}>
            {translate("admin.proposal.back")}
          </Button>
        }
      />
    );
  }

  const proposal = proposalQuery.data;
  const isPending = proposal.reviewStatus === "pending";

  return (
    <>
      <PageHeader
        label={<BackLink to="/admin/proposals">{translate("common.proposals")}</BackLink>}
        title={proposalTitle(proposal, translate)}
        description={
          <span className="flex flex-wrap items-center gap-3">
            {proposalTypeLabel(proposal.pluginId, translate)}
            <ProposalStatusCell proposal={proposal} t={translate} />
          </span>
        }
        headerTestId="admin-proposal.heading"
      />

      <Card>
        <CardContent className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <section className="flex min-w-0 flex-col gap-6">
            <h2 className="text-xl font-semibold text-foreground">
              {proposal.pluginId === "node"
                ? translate("admin.proposal.request")
                : translate("common.submission")}
            </h2>
            <ProposalRequest proposal={proposal} />
          </section>
          <div className="flex min-w-0 flex-col gap-8">
            {isPending ? (
              <ProposalReviewActions
                rejectionReason={rejectionReason}
                isReviewing={reviewMutation.isPending}
                onRejectionReasonChange={(event) => setRejectionReason(event.target.value)}
                onApprove={() => reviewMutation.mutate({ proposal, action: "approve" })}
                onReject={() =>
                  reviewMutation.mutate({
                    proposal,
                    action: "reject",
                    reason: rejectionReason.trim(),
                  })
                }
              />
            ) : (
              <ProposalOutcome proposal={proposal} />
            )}
          </div>
        </CardContent>
      </Card>

      <ProposalTechnicalDetails proposal={proposal} />

      <ProposalReviewHistory query={reviewHistoryQuery} />
    </>
  );
}
