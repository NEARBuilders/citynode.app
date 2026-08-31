import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, FileCheck2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { Badge, Button, Card, EmptyState, SectionHeader } from "@/components";

const NODE_PLUGIN_ID = "api";

export const Route = createFileRoute(
  "/_layout/_authenticated/_dashboard/dashboard/node/proposals/",
)({
  component: NodeProposals,
});

function NodeProposals() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { selectedNode, canReview } = Route.useRouteContext();
  const nodeId = selectedNode?.id ?? "";
  const queryKey = ["node-proposals", nodeId] as const;

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
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to review proposal"),
  });

  if (!selectedNode) return null;

  const proposals = proposalsQuery.data?.data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Node proposals" />
        <Button asChild size="sm">
          <Link to="/apply">
            <Plus />
            new proposal
          </Link>
        </Button>
      </div>

      {proposalsQuery.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading proposals…</Card>
      ) : proposalsQuery.isError ? (
        <Card className="p-8 text-center text-sm text-destructive">
          Unable to load this node&apos;s proposals.
        </Card>
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No node proposals"
          description={`No proposals currently target ${selectedNode.name}.`}
          className="min-h-[40vh]"
        />
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal) => {
            const pending = proposal.reviewStatus === "pending";
            return (
              <Card key={proposal.id} className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-mono text-xs text-muted-foreground">{proposal.id}</p>
                    <p className="text-sm text-foreground">
                      Submitted {new Date(proposal.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={reviewStatusVariant(proposal.reviewStatus)}>
                      {proposal.reviewStatus}
                    </Badge>
                    <Badge variant="outline">{proposal.applyStatus.replace("_", " ")}</Badge>
                  </div>
                </div>

                <pre className="max-h-72 overflow-auto rounded-[8px] border border-border bg-muted/40 p-4 text-xs text-foreground">
                  {JSON.stringify(proposal.payload, null, 2)}
                </pre>

                {proposal.rejectionReason && (
                  <p className="text-sm text-destructive">{proposal.rejectionReason}</p>
                )}

                {canReview && pending ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        reviewMutation.mutate({
                          action: "approve",
                          expectedUpdatedAt: proposal.updatedAt,
                        })
                      }
                      disabled={reviewMutation.isPending}
                    >
                      <Check />
                      approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        reviewMutation.mutate({
                          action: "reject",
                          expectedUpdatedAt: proposal.updatedAt,
                        })
                      }
                      disabled={reviewMutation.isPending}
                    >
                      <X />
                      reject
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {canReview ? "This proposal is no longer awaiting review." : "Read-only access"}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function reviewStatusVariant(status: "pending" | "approved" | "rejected" | "removed") {
  if (status === "rejected") return "destructive" as const;
  if (status === "pending") return "secondary" as const;
  if (status === "removed") return "outline" as const;
  return "default" as const;
}
