import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, FileCheck2, History, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getActiveRuntime, useApiClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Label,
  SectionHeader,
  Skeleton,
  Textarea,
} from "@/components";
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import { invalidateTenantQueries } from "@/lib/queries/tenants";
import { nodeProposalPayloadSchema } from "@/routes/_layout/_authenticated/_dashboard/-node-application";
import { approveAndApplyProposal } from "./-proposal-application";
import { proposalReviewStatusVariant } from "./-proposal-review";

type ApiClient = ReturnType<typeof useApiClient>;
type ProposalResult = Awaited<ReturnType<ApiClient["proposals"]["getProposals"]>>;
type Proposal = ProposalResult["data"][number];
type ReviewHistoryResult = Awaited<ReturnType<ApiClient["proposals"]["getReviewHistory"]>>;
type ReviewHistoryEntry = ReviewHistoryResult["data"][number];
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
  const [rejectionReason, setRejectionReason] = useState("");
  const proposalQueryKey = ["admin-proposal", proposalId, pluginId, entityId] as const;

  const proposalQuery = useQuery({
    queryKey: proposalQueryKey,
    queryFn: async () => {
      if (!pluginId || !entityId) throw new Error("Proposal location is missing");
      const result = await apiClient.proposals.getProposals({ pluginId, entityId, limit: 1 });
      return result.data.find((proposal) => proposal.id === proposalId) ?? null;
    },
    enabled: !!pluginId && !!entityId,
  });

  const reviewHistoryQuery = useQuery({
    queryKey: ["proposal-review-history", pluginId],
    queryFn: () => {
      if (!pluginId) throw new Error("Plugin ID is missing");
      return apiClient.proposals.getReviewHistory({ pluginId, limit: 100 });
    },
    enabled: !!pluginId,
    staleTime: 15 * 1000,
  });

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

      const reviewedProposal = await approveAndApplyProposal({
        apiClient,
        proposal,
        gatewayId,
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
        queryClient.invalidateQueries({ queryKey: ["admin-proposals"] }),
        queryClient.invalidateQueries({ queryKey: ["thing-proposal", proposal.entityId] }),
        queryClient.invalidateQueries({ queryKey: ["thing", proposal.entityId] }),
        queryClient.invalidateQueries({ queryKey: ["things-list"] }),
        queryClient.invalidateQueries({ queryKey: ["proposal-review-history"] }),
        invalidateNodeQueries(queryClient),
        invalidateTenantQueries(queryClient),
      ]);
      await navigate({ to: "/admin/proposals" });
    },
    onError: async (error: Error) => {
      toast.error(error.message || "Failed to review proposal");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: proposalQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["admin-proposals"] }),
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
  const reviewHistory = reviewHistoryQuery.data?.data ?? [];
  const isPending = proposal.reviewStatus === "pending";

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

      <Card className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-mono text-xs text-muted-foreground">{proposal.id}</p>
            <h2 className="font-mono text-lg font-semibold text-foreground">{proposal.entityId}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={proposalReviewStatusVariant(proposal.reviewStatus)}>
              {proposal.reviewStatus}
            </Badge>
            <Badge variant="outline">apply: {proposal.applyStatus.replace("_", " ")}</Badge>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <MetaRow label="Plugin" value={proposal.pluginId} mono />
          <MetaRow label="Entity" value={proposal.entityId} mono />
          <MetaRow label="Created by" value={proposal.createdBy} mono />
          <MetaRow label="Submissions" value={String(proposal.submissionCount)} />
          <MetaRow label="Created" value={new Date(proposal.createdAt).toLocaleString()} />
          <MetaRow label="Updated" value={new Date(proposal.updatedAt).toLocaleString()} />
        </div>

        {proposal.rejectionReason && (
          <div className="rounded-[8px] border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger-fg">
            <p className="font-semibold">Rejection reason</p>
            <p className="mt-1">{proposal.rejectionReason}</p>
          </div>
        )}

        {proposal.applyError && (
          <div className="rounded-[8px] border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
            <p className="font-semibold text-destructive">Apply error</p>
            <p className="mt-1">{proposal.applyError}</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payload
          </p>
          <pre className="max-h-96 overflow-auto rounded-[8px] border border-border bg-muted/40 p-4 font-mono text-xs text-foreground">
            {JSON.stringify(proposal.payload, null, 2)}
          </pre>
        </div>

        {proposal.pluginId === "node" && <NodeProposalDetails payload={proposal.payload} />}
      </Card>

      {isPending ? (
        <Card className="space-y-4 p-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Review action</h2>
            <p className="text-sm text-muted-foreground">
              Approve to publish this thing, or add required notes before rejecting it.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Review notes</Label>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Required when rejecting"
              rows={4}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => reviewMutation.mutate({ proposal, action: "approve" })}
              disabled={reviewMutation.isPending}
            >
              <Check />
              {reviewMutation.isPending ? "reviewing..." : "approve"}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                reviewMutation.mutate({
                  proposal,
                  action: "reject",
                  reason: rejectionReason.trim(),
                })
              }
              disabled={!rejectionReason.trim() || reviewMutation.isPending}
            >
              <X />
              reject
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          This proposal has already been reviewed.
        </Card>
      )}

      <section className="space-y-3">
        <SectionHeader title="Review history" />
        {reviewHistoryQuery.isLoading ? (
          <Card className="space-y-3 p-6">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </Card>
        ) : reviewHistoryQuery.isError ? (
          <Card className="p-6 text-sm text-destructive">
            Review history could not be loaded: {reviewHistoryQuery.error.message}
          </Card>
        ) : reviewHistory.length === 0 ? (
          <EmptyState
            icon={History}
            title="No review history"
            description={`No ${pluginId} proposals have been approved or rejected yet.`}
          />
        ) : (
          <div className="space-y-3">
            {reviewHistory.map((entry) => (
              <ReviewHistoryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NodeProposalDetails({ payload }: { payload: unknown }) {
  const parsed = nodeProposalPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return (
      <div className="rounded-[8px] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        This node proposal has an invalid payload and cannot be applied safely.
      </div>
    );
  }

  const proposal = parsed.data;
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Node application
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetaRow label="Applicant account" value={proposal.accountId} mono />
        <MetaRow label="Submitting account" value={proposal.submitterAccountId} mono />
        <MetaRow label="Organization" value={proposal.orgId} mono />
        <MetaRow label="Kind" value={proposal.kind} />
        <MetaRow label="Parent" value={proposal.parentId ?? "root"} mono />
        <MetaRow label="Name" value={proposal.name} />
      </div>
      <div className="rounded-[8px] border border-border bg-muted/20 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Motivation
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{proposal.motivation}</p>
      </div>
    </div>
  );
}

function ReviewHistoryCard({ entry }: { entry: ReviewHistoryEntry }) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{entry.actorLabel || entry.actor}</p>
          <p className="font-mono text-xs text-muted-foreground">{entry.entityId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={entry.action === "rejected" ? "destructive" : "default"}>
            {entry.action}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(entry.createdAt).toLocaleString()}
          </span>
        </div>
      </div>
      {entry.details !== null && (
        <pre className="overflow-auto rounded-[8px] border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      )}
    </Card>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[8px] border border-border bg-muted/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 break-all text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </p>
    </div>
  );
}
