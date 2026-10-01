import { DotsThreeIcon, SealCheckIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  LocalDate,
  SectionHeader,
  Skeleton,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { NODE_PLUGIN_ID, nodeProposalsQueryOptions } from "./-node-proposals-query";
import {
  applyStatusLabel,
  proposalTitle,
  reviewStatusBadge,
  sortProposals,
} from "./-proposal-summary";

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard/node/proposals/")({
  component: NodeProposals,
});

function NodeProposals() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { selectedNode, canReview } = Route.useRouteContext();
  const nodeId = selectedNode?.id ?? "";
  const { queryKey } = nodeProposalsQueryOptions(apiClient, nodeId);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const proposalsQuery = useQuery(nodeProposalsQueryOptions(apiClient, nodeId));

  const reviewMutation = useMutation({
    mutationFn: async ({
      action,
      expectedUpdatedAt,
    }: {
      action: "approve" | "reject";
      expectedUpdatedAt: string;
    }) => {
      if (action === "approve") {
        return apiClient.proposals.approve({
          pluginId: NODE_PLUGIN_ID,
          entityId: nodeId,
          expectedUpdatedAt,
        });
      }
      return apiClient.proposals.reject({
        pluginId: NODE_PLUGIN_ID,
        entityId: nodeId,
        expectedUpdatedAt,
        reason: "Rejected by node administrator",
      });
    },
    onSuccess: async (_, variables) => {
      toast.success(
        variables.action === "approve"
          ? translate("admin.proposalApproved")
          : translate("admin.proposalRejected"),
      );
      setRejectingId(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  if (!selectedNode) return null;

  const proposals = sortProposals(proposalsQuery.data?.data ?? []);
  const rejecting = proposals.find((proposal) => proposal.id === rejectingId) ?? null;
  let primaryUsed = false;

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("dashboard.changes")}
        description={translate("dashboard.changesHint")}
        action={
          <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/apply" />}>
            {translate("dashboard.proposeChild")}
          </Button>
        }
      />

      {proposalsQuery.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : proposalsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {translate("dashboard.proposalsLoadError")}{" "}
          <Button variant="link" size="xs" onClick={() => proposalsQuery.refetch()}>
            {translate("common.retry")}
          </Button>
        </p>
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={SealCheckIcon}
          title={translate("dashboard.noProposals")}
          description={translate("proposal.noneWaitingNamed", { name: selectedNode.name ?? "" })}
        />
      ) : (
        <ItemGroup data-testid="dashboard-node.proposals">
          {proposals.map((proposal) => {
            const badge = reviewStatusBadge(proposal.reviewStatus, translate);
            const applied = applyStatusLabel(proposal.applyStatus, translate);
            const reviewable = canReview && proposal.reviewStatus === "pending";
            const isPrimary = reviewable && !primaryUsed;
            if (isPrimary) primaryUsed = true;
            return (
              <Item
                key={proposal.id}
                variant="outline"
                data-testid={`dashboard-node.proposal-${proposal.id}`}
              >
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full">
                    <span className="truncate">
                      {proposalTitle(proposal.payload, "Proposal", translate)}
                    </span>
                  </ItemTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {applied && <Badge variant="outline">{applied}</Badge>}
                  </div>
                  <ItemDescription>
                    {translate("common.submitted")}
                    <LocalDate value={proposal.createdAt} format="relative" />
                    {proposal.rejectionReason ? ` · ${proposal.rejectionReason}` : ""}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="w-full justify-end sm:w-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    nativeButton={false}
                    data-testid={`dashboard-node.proposal-details-${proposal.id}`}
                    render={
                      <Link
                        to="/dashboard/node/proposals/$proposalId"
                        params={{ proposalId: proposal.id }}
                        search={{ nodeId }}
                      />
                    }
                  >
                    {translate("things.details")}
                  </Button>
                  {reviewable && (
                    <>
                      <Button
                        size="sm"
                        variant={isPrimary ? "default" : "outline"}
                        disabled={reviewMutation.isPending}
                        data-testid={`dashboard-node.proposal-approve-${proposal.id}`}
                        onClick={() =>
                          reviewMutation.mutate({
                            action: "approve",
                            expectedUpdatedAt: proposal.updatedAt,
                          })
                        }
                      >
                        {translate("common.approve")}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={translate("dashboard.moreActions")}
                            />
                          }
                        >
                          <DotsThreeIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setRejectingId(proposal.id)}
                          >
                            {translate("common.reject")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(open) => {
          if (!open) setRejectingId(null);
        }}
        title={translate("admin.proposal.rejectTitle")}
        description={translate("dashboard.rejectHint")}
        confirmLabel={translate("common.reject")}
        cancelLabel={translate("common.cancel")}
        variant="destructive"
        isPending={reviewMutation.isPending}
        onConfirm={() => {
          if (rejecting)
            reviewMutation.mutate({ action: "reject", expectedUpdatedAt: rejecting.updatedAt });
        }}
      />
    </section>
  );
}
