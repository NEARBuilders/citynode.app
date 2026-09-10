import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileCheck2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getAccount, getActiveRuntime, useApiClient } from "@/app";
import { Button, Card, EmptyState, SectionHeader, Skeleton } from "@/components";
import { useDaoConnection } from "@/lib/dao-connect";
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import { invalidateTenantQueries } from "@/lib/queries/tenants";
import { publishDaoTenantConfig } from "@/lib/tenant-deploy";
import { nodeProposalPayloadSchema } from "@/routes/_layout/_authenticated/_dashboard/-node-application";
import { approveAndApplyProposal } from "./-proposal-application";
import type { Proposal } from "./-proposal-columns";
import {
  adminProposalDetailQueryOptions,
  proposalReviewHistoryQueryOptions,
  proposalReviewQueryKeys,
} from "./-proposal-review";
import { ProposalReviewActions } from "./-proposal-review-actions";
import { ProposalReviewHistory } from "./-proposal-review-history";
import { ProposalSummary } from "./-proposal-summary";

type ProposalDetailSearch = { pluginId?: string; entityId?: string };

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/proposals/$proposalId")({
  validateSearch: (search: Record<string, unknown>): ProposalDetailSearch => ({
    pluginId: typeof search.pluginId === "string" ? search.pluginId : undefined,
    entityId: typeof search.entityId === "string" ? search.entityId : undefined,
  }),
  head: ({ params }) => ({
    meta: [{ title: `${params.proposalId} | Proposal review | app` }],
  }),
  component: ProposalDetailPage,
});

function ProposalDetailPage() {
  const { proposalId } = Route.useParams();
  const { pluginId, entityId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { runtimeConfig } = Route.useRouteContext();
  const gatewayId = getActiveRuntime(runtimeConfig)?.gatewayId ?? "citynode.app";
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
    if (verifiedDaoAccountId && verifiedDaoAccountId !== daoConnection.daoAccountId) {
      setVerifiedDaoAccountId(null);
    }
  }, [daoConnection.daoAccountId, verifiedDaoAccountId]);

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
      if (action === "reject") {
        const rejected = await apiClient.proposals.reject({
          pluginId: proposal.pluginId,
          entityId: proposal.entityId,
          expectedUpdatedAt: proposal.updatedAt,
          reason: reason?.trim() ?? "",
        });
        return { action, proposal: rejected.data };
      }

      if (proposal.pluginId === "node") {
        const payload = nodeProposalPayloadSchema.parse(proposal.payload);
        if (
          !daoConnection.daoAccountId ||
          daoConnection.daoAccountId !== payload.accountId ||
          verifiedDaoAccountId !== payload.accountId
        ) {
          throw new Error(`Connect and verify ${payload.accountId} through Trezu before approval`);
        }
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
          ? "Proposal rejected"
          : proposal.applyStatus === "applied"
            ? "Proposal approved and resource created"
            : "Proposal approved",
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
      toast.error(error.message || "Failed to review proposal");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: proposalQueryKey }),
        queryClient.invalidateQueries({ queryKey: proposalReviewQueryKeys.all }),
      ]);
    },
  });

  if (!pluginId || !entityId) {
    return (
      <EmptyState
        icon={FileCheck2}
        title="Proposal location is missing"
        description="Open this proposal from the review queue so its plugin and entity can be resolved."
        action={
          <Button asChild variant="outline">
            <Link to="/admin/proposals">back to proposals</Link>
          </Button>
        }
      />
    );
  }

  if (proposalQuery.isLoading) {
    return (
      <Card className="space-y-3 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }

  if (proposalQuery.isError || !proposalQuery.data) {
    return (
      <EmptyState
        icon={FileCheck2}
        title="Proposal not found"
        description={proposalQuery.error?.message || "This proposal is no longer available."}
        action={
          <Button asChild variant="outline">
            <Link to="/admin/proposals">back to proposals</Link>
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
      daoConnection.daoAccountId === proposalDaoAccountId &&
      verifiedDaoAccountId === proposalDaoAccountId);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Review proposal"
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/proposals">
              <ArrowLeft />
              back to proposals
            </Link>
          </Button>
        }
      />

      <ProposalSummary proposal={proposal} />

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

      <ProposalReviewHistory pluginId={pluginId} query={reviewHistoryQuery} />
    </div>
  );
}
