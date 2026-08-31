import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, FileCheck2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Label,
  SectionHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components";
import { DataTable } from "@/components/ui/data-table";
import {
  PROPOSAL_REVIEW_FILTERS,
  type ProposalReviewFilter,
  parseProposalReviewFilter,
  proposalReviewStatusVariant,
} from "./-proposal-review";

type ApiClient = ReturnType<typeof useApiClient>;
type ProposalResult = Awaited<ReturnType<ApiClient["proposals"]["getProposals"]>>;
type Proposal = ProposalResult["data"][number];
type AdminProposalSearch = { status?: ProposalReviewFilter };

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/proposals/")({
  validateSearch: (search: Record<string, unknown>): AdminProposalSearch => ({
    status: parseProposalReviewFilter(search.status),
  }),
  head: () => ({
    meta: [{ title: "Proposal review | app" }],
  }),
  component: AdminProposals,
});

function AdminProposals() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const { status } = Route.useSearch();
  const activeFilter = status ?? "pending";
  const [proposalToReject, setProposalToReject] = useState<Proposal | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const queryKey = ["admin-proposals", activeFilter] as const;

  const proposalsQuery = useQuery({
    queryKey,
    queryFn: () =>
      activeFilter === "all"
        ? apiClient.proposals.getProposals({ limit: 100 })
        : apiClient.proposals.getProposals({ reviewStatus: activeFilter, limit: 100 }),
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
      if (action === "approve") {
        return apiClient.proposals.approve({
          pluginId: proposal.pluginId,
          entityId: proposal.entityId,
          expectedUpdatedAt: proposal.updatedAt,
        });
      }
      return apiClient.proposals.reject({
        pluginId: proposal.pluginId,
        entityId: proposal.entityId,
        expectedUpdatedAt: proposal.updatedAt,
        reason: reason ?? "",
      });
    },
    onSuccess: async (_, variables) => {
      toast.success(variables.action === "approve" ? "Proposal approved" : "Proposal rejected");
      setProposalToReject(null);
      setRejectionReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin-proposals"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to review proposal"),
  });

  const columns = useMemo<ColumnDef<Proposal>[]>(
    () => [
      {
        accessorKey: "pluginId",
        header: "Plugin",
        cell: ({ row }) => <Badge variant="outline">{row.original.pluginId}</Badge>,
      },
      {
        accessorKey: "entityId",
        header: "Entity",
        cell: ({ row }) => (
          <span className="block max-w-52 truncate font-mono text-xs text-muted-foreground">
            {row.original.entityId}
          </span>
        ),
      },
      {
        accessorKey: "createdBy",
        header: "Created by",
        cell: ({ row }) => (
          <span className="block max-w-44 truncate font-mono text-xs text-muted-foreground">
            {row.original.createdBy}
          </span>
        ),
      },
      {
        accessorKey: "reviewStatus",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={proposalReviewStatusVariant(row.original.reviewStatus)}>
            {row.original.reviewStatus}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) =>
          row.original.reviewStatus === "pending" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => reviewMutation.mutate({ proposal: row.original, action: "approve" })}
                disabled={reviewMutation.isPending}
              >
                <Check />
                approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setProposalToReject(row.original)}
                disabled={reviewMutation.isPending}
              >
                <X />
                reject
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">reviewed</span>
          ),
      },
    ],
    [reviewMutation],
  );

  const proposals = proposalsQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Proposal review"
        action={
          <Badge variant="secondary">
            {proposalsQuery.data?.meta.total ?? 0} {activeFilter === "all" ? "total" : activeFilter}
          </Badge>
        }
      />

      <Tabs
        value={activeFilter}
        onValueChange={(value) =>
          navigate({
            search: { status: value === "pending" ? undefined : (value as ProposalReviewFilter) },
          })
        }
      >
        <TabsList className="justify-start overflow-x-auto">
          {PROPOSAL_REVIEW_FILTERS.map((filter) => (
            <TabsTrigger key={filter} value={filter} className="capitalize">
              {filter}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {proposalsQuery.isLoading ? (
        <Card className="space-y-3 p-6">
          {[1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </Card>
      ) : proposalsQuery.isError ? (
        <EmptyState
          icon={FileCheck2}
          title="Failed to load proposals"
          description={
            proposalsQuery.error.message || "Something went wrong while loading proposals."
          }
          action={
            <Button variant="outline" onClick={() => proposalsQuery.refetch()}>
              retry
            </Button>
          }
        />
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title={activeFilter === "pending" ? "No pending proposals" : "No proposals found"}
          description={`There are no ${activeFilter === "all" ? "" : `${activeFilter} `}proposals to show.`}
          className="min-h-[40vh]"
        />
      ) : (
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={proposals} />
        </div>
      )}

      <Dialog
        open={!!proposalToReject}
        onOpenChange={(open) => {
          if (!open) {
            setProposalToReject(null);
            setRejectionReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject proposal</DialogTitle>
            <DialogDescription>
              Add a reason so the proposal author understands what needs to change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Reason</Label>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Explain why this proposal is being rejected"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setProposalToReject(null);
                setRejectionReason("");
              }}
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason.trim() || reviewMutation.isPending || !proposalToReject}
              onClick={() => {
                if (!proposalToReject) return;
                reviewMutation.mutate({
                  proposal: proposalToReject,
                  action: "reject",
                  reason: rejectionReason.trim(),
                });
              }}
            >
              reject proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
