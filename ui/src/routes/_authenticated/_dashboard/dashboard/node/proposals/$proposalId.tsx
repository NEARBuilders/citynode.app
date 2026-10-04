import { ArrowLeftIcon, SealCheckIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { Badge, Button, EmptyState, LocalDate, SectionHeader, Skeleton } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { nodeProposalsQueryOptions } from "./-node-proposals-query";
import { applyStatusLabel, proposalTitle, reviewStatusBadge } from "./-proposal-summary";

export const Route = createFileRoute(
  "/_authenticated/_dashboard/dashboard/node/proposals/$proposalId",
)({
  component: NodeProposalDetail,
});

function NodeProposalDetail() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const { proposalId } = Route.useParams();
  const { selectedNode } = Route.useRouteContext();
  const nodeId = selectedNode?.id ?? "";
  const proposalsQuery = useQuery(nodeProposalsQueryOptions(apiClient, nodeId));

  if (!selectedNode) return null;

  const proposal = proposalsQuery.data?.data.find((item) => item.id === proposalId);
  const back = (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 self-start"
      nativeButton={false}
      data-testid="dashboard-node.proposal-back"
      render={<Link to="/dashboard/node/proposals" search={{ nodeId }} />}
    >
      <ArrowLeftIcon />
      {translate("common.proposals")}
    </Button>
  );

  if (proposalsQuery.isLoading) {
    return (
      <section className="flex flex-col gap-6" aria-busy="true">
        {back}
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </section>
    );
  }

  if (!proposal) {
    return (
      <section className="flex flex-col gap-6">
        {back}
        <EmptyState
          icon={SealCheckIcon}
          title={
            proposalsQuery.isError
              ? translate("dashboard.proposalLoadError")
              : translate("admin.proposal.notFound")
          }
          description={
            proposalsQuery.isError
              ? translate("events.connectionHint")
              : translate("proposal.otherCommunityNamed", { name: selectedNode.name ?? "" })
          }
          action={
            proposalsQuery.isError ? (
              <Button variant="outline" onClick={() => proposalsQuery.refetch()}>
                {translate("common.retry")}
              </Button>
            ) : undefined
          }
        />
      </section>
    );
  }

  const badge = reviewStatusBadge(proposal.reviewStatus, translate);
  const applied = applyStatusLabel(proposal.applyStatus, translate);
  const payload = (proposal.payload ?? {}) as Record<string, unknown>;
  const motivation = typeof payload.motivation === "string" ? payload.motivation : null;

  return (
    <section className="flex flex-col gap-6" data-testid="dashboard-node.proposal-detail">
      <div className="flex flex-col gap-3">
        {back}
        <SectionHeader
          title={proposalTitle(proposal.payload, "Proposal", translate)}
          description={
            <>
              {translate("common.submitted")}
              <LocalDate value={proposal.createdAt} format="datetime" />
              {proposal.rejectionReason ? ` · ${proposal.rejectionReason}` : ""}
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {applied && <Badge variant="outline">{applied}</Badge>}
        </div>
      </div>
      {motivation && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{translate("dashboard.motivation")}</span>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{motivation}</p>
        </div>
      )}
    </section>
  );
}
