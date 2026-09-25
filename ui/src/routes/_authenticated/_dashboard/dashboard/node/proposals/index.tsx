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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  applyStatusLabel,
  proposalTitle,
  reviewStatusBadge,
  sortProposals,
} from "./-proposal-summary";

const NODE_PLUGIN_ID = "api";

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard/node/proposals/")({
  component: NodeProposals,
});

function NodeProposals() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { selectedNode, canReview } = Route.useRouteContext();
  const nodeId = selectedNode?.id ?? "";
  const queryKey = ["node-proposals", nodeId] as const;
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const proposalsQuery = useQuery({
    queryKey,
    queryFn: () =>
      apiClient.proposals.getProposals({
        pluginId: NODE_PLUGIN_ID,
        entityId: nodeId,
        limit: 100,
      }),
    enabled: !!nodeId,
    staleTime: 30 * 1000,
  });

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
      toast.success(variables.action === "approve" ? "Proposal approved" : "Proposal rejected");
      setRejectingId(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to review proposal"),
  });

  if (!selectedNode) return null;

  const proposals = sortProposals(proposalsQuery.data?.data ?? []);
  const details = proposals.find((proposal) => proposal.id === detailsId) ?? null;
  const rejecting = proposals.find((proposal) => proposal.id === rejectingId) ?? null;
  let primaryUsed = false;

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title="Changes"
        description="Proposed changes to this community and where they stand."
        action={
          <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/apply" />}>
            Propose a sub-community
          </Button>
        }
      />

      {proposalsQuery.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : proposalsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load proposals.{" "}
          <Button variant="link" size="xs" onClick={() => proposalsQuery.refetch()}>
            Try again
          </Button>
        </p>
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={SealCheckIcon}
          title="No proposals yet"
          description={`Nothing is waiting for review in ${selectedNode.name}.`}
        />
      ) : (
        <ItemGroup data-testid="dashboard-node.proposals">
          {proposals.map((proposal) => {
            const badge = reviewStatusBadge(proposal.reviewStatus);
            const applied = applyStatusLabel(proposal.applyStatus);
            const reviewable = canReview && proposal.reviewStatus === "pending";
            const isPrimary = reviewable && !primaryUsed;
            if (isPrimary) primaryUsed = true;
            return (
              <Item
                key={proposal.id}
                variant="outline"
                data-testid={`dashboard-node.proposal-${proposal.id}`}
              >
                <ItemContent>
                  <ItemTitle>
                    {proposalTitle(proposal.payload, "Proposal")}
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {applied && <Badge variant="outline">{applied}</Badge>}
                  </ItemTitle>
                  <ItemDescription>
                    Submitted <LocalDate value={proposal.createdAt} format="relative" />
                    {proposal.rejectionReason ? ` · ${proposal.rejectionReason}` : ""}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button size="sm" variant="ghost" onClick={() => setDetailsId(proposal.id)}>
                    Details
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
                        Approve
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" aria-label="More actions" />
                          }
                        >
                          <DotsThreeIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setRejectingId(proposal.id)}
                          >
                            Reject
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
        title="Reject this proposal?"
        description="The submitter will see it as rejected. This can't be undone."
        confirmLabel="Reject"
        cancelLabel="Cancel"
        variant="destructive"
        isPending={reviewMutation.isPending}
        onConfirm={() => {
          if (rejecting)
            reviewMutation.mutate({ action: "reject", expectedUpdatedAt: rejecting.updatedAt });
        }}
      />

      <Sheet
        open={!!details}
        onOpenChange={(open) => {
          if (!open) setDetailsId(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="px-6 pt-8 pr-16">
            <SheetTitle>
              {details ? proposalTitle(details.payload, "Proposal") : "Proposal"}
            </SheetTitle>
            <SheetDescription>
              Submitted {details && <LocalDate value={details.createdAt} format="datetime" />}
            </SheetDescription>
          </SheetHeader>
          {details && (
            <pre className="mx-6 mb-8 overflow-auto rounded-xl bg-muted p-4 font-mono text-xs">
              {JSON.stringify(details.payload, null, 2)}
            </pre>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
