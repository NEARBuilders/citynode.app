import { GavelIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getAccount, getGatewayId, useApiClient } from "@/app";
import { Button, Card, CardContent, EmptyState, PageHeader, Skeleton } from "@/components";
import { appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { useDaoConnection } from "@/lib/dao-connect";
import { pageTitle } from "@/lib/page-title";
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import { invalidateTenantQueries } from "@/lib/queries/tenants";
import { publishDaoTenantConfig } from "@/lib/tenant-deploy";
import { nodeProposalPayloadSchema } from "@/routes/_authenticated/_dashboard/-node-application";
import { BackLink } from "../-admin-ui";
import { approveAndApplyProposal } from "./-proposal-application";
import type { Proposal } from "./-proposal-columns";
import {
  adminProposalDetailQueryOptions,
  proposalReviewHistoryQueryOptions,
  proposalReviewQueryKeys,
  proposalTitle,
  proposalTypeLabel,
} from "./-proposal-review";
import { ProposalReviewActions } from "./-proposal-review-actions";
import { ProposalReviewHistory } from "./-proposal-review-history";
import {
  ProposalDetails,
  ProposalOutcome,
  ProposalStatusBadges,
  ProposalSubject,
} from "./-proposal-summary";

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
  const { runtimeConfig } = Route.useRouteContext();
  const gatewayId = getGatewayId(runtimeConfig);
  const baseAccount = getAccount(runtimeConfig);
  const daoConnection = useDaoConnection();
  const [rejectionReason, setRejectionReason] = useState("");
  const [verifiedDaoAccountId, setVerifiedDaoAccountId] = useState<string | null>(null);
  const handleDaoVerified = useCallback(
    ({ daoAccountId }: { daoAccountId: string }) => setVerifiedDaoAccountId(daoAccountId),
    [],
  );
  const proposalQueryKey = proposalReviewQueryKeys.detail(proposalId, pluginId, entityId);
  const proposalQuery = useQuery(
    adminProposalDetailQueryOptions(apiClient, proposalId, pluginId, entityId),
  );
  const reviewHistoryQuery = useQuery(proposalReviewHistoryQueryOptions(apiClient, pluginId));

  useEffect(() => {
    if (
      verifiedDaoAccountId &&
      (daoConnection.status !== "connected" || verifiedDaoAccountId !== daoConnection.daoAccountId)
    ) {
      setVerifiedDaoAccountId(null);
    }
  }, [daoConnection.daoAccountId, daoConnection.status, verifiedDaoAccountId]);

  const reviewMutation = useMutation({
    mutationFn: async ({
      proposal,
      action,
      reason,
    }: {
      proposal: Proposal;
      action: "approve" | "reject";
      reason?: string;
    }) => {
      if (!gatewayId) {
        throw new Error(
          "Runtime configuration is missing the gateway id — this deployment is misconfigured",
        );
      }
      if (action === "reject") {
        const rejected = await apiClient.proposals.reject({
          pluginId: proposal.pluginId,
          entityId: proposal.entityId,
          expectedUpdatedAt: proposal.updatedAt,
          reason: reason?.trim() ?? "",
        });
        return { action, proposal: rejected.data };
      }

      const reviewedProposal = await approveAndApplyProposal({
        apiClient,
        proposal,
        gatewayId,
        baseAccount,
        publishTenantConfig: (input) => publishDaoTenantConfig(apiClient, input),
        onProposalChange: (nextProposal) =>
          queryClient.setQueryData(proposalQueryKey, nextProposal),
      });
      return { action, proposal: reviewedProposal };
    },
    onSuccess: async ({ action, proposal }) => {
      toast.success(
        action === "reject"
          ? translate("admin.proposalRejected")
          : proposal.applyStatus === "applied"
            ? translate("admin.proposalApprovedCreated")
            : translate("admin.proposalApproved"),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: proposalReviewQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["thing-proposal", proposal.entityId] }),
        queryClient.invalidateQueries({ queryKey: ["thing", proposal.entityId] }),
        queryClient.invalidateQueries({ queryKey: ["things-list"] }),
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
  const parsedNodePayload =
    proposal.pluginId === "node" ? nodeProposalPayloadSchema.safeParse(proposal.payload) : null;
  const proposalDaoAccountId = parsedNodePayload?.success ? parsedNodePayload.data.accountId : null;
  const daoIsVerified =
    proposal.pluginId !== "node" ||
    (!!proposalDaoAccountId &&
      daoConnection.status === "connected" &&
      daoConnection.daoAccountId === proposalDaoAccountId &&
      verifiedDaoAccountId === proposalDaoAccountId);

  return (
    <>
      <PageHeader
        label={<BackLink to="/admin/proposals">{translate("common.proposals")}</BackLink>}
        title={proposalTitle(proposal, translate)}
        description={`${proposalTypeLabel(proposal.pluginId, translate)} · ${proposal.entityId}`}
        actions={<ProposalStatusBadges proposal={proposal} />}
        headerTestId="admin-proposal.heading"
      />

      <div className="grid gap-12 lg:grid-cols-3 lg:gap-10">
        <div className="flex min-w-0 flex-col gap-12 lg:col-span-2">
          <ProposalSubject proposal={proposal} />
          <ProposalDetails proposal={proposal} />
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardContent className="p-5 sm:p-6">
              {isPending ? (
                <ProposalReviewActions
                  isPending={isPending}
                  isNodeProposal={proposal.pluginId === "node"}
                  proposalDaoAccountId={proposalDaoAccountId}
                  daoIsVerified={daoIsVerified}
                  rejectionReason={rejectionReason}
                  isReviewing={reviewMutation.isPending}
                  onDaoVerified={handleDaoVerified}
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
            </CardContent>
          </Card>
        </aside>
      </div>

      <ProposalReviewHistory pluginId={pluginId} query={reviewHistoryQuery} />
    </>
  );
}
