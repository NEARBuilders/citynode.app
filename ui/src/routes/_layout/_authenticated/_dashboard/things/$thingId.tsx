import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowUp, Clock3, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { Badge, Button, PageContainer, PageHeader } from "@/components";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { optimisticUpvoteCount } from "./-thing-votes";

type ApiClient = ReturnType<typeof useApiClient>;
type ProposalResult = Awaited<ReturnType<ApiClient["proposals"]["getProposals"]>>;
type Proposal = ProposalResult["data"][number];
type UpvoteCount = Awaited<ReturnType<ApiClient["votes"]["getUpvoteCount"]>>;
type UserVote = Awaited<ReturnType<ApiClient["votes"]["getUserVote"]>>;

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/things/$thingId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.thingId} | Things | everything.dev` },
      { name: "description", content: `Detail view for thing ${params.thingId}.` },
    ],
  }),
  component: ThingDetailsPage,
});

function ThingDetailsPage() {
  const { thingId } = Route.useParams();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const canGoBack = router.history.canGoBack?.() ?? false;
  const { session } = Route.useRouteContext();
  const isAdmin = session?.user?.role === "admin";

  const proposalQuery = useQuery({
    queryKey: ["thing-proposal", thingId],
    queryFn: async () => {
      const result = await apiClient.proposals.getProposals({
        pluginId: "template",
        entityId: thingId,
        limit: 1,
      });
      return result.data[0] ?? null;
    },
    refetchInterval: (query) => {
      const proposal = query.state.data;
      return proposal?.reviewStatus === "approved" && proposal.applyStatus === "applying"
        ? 2_000
        : false;
    },
  });

  const thingQuery = useQuery({
    queryKey: ["thing", thingId],
    queryFn: () => apiClient.template.getThing({ thingId }),
    enabled:
      proposalQuery.isError ||
      (proposalQuery.isSuccess &&
        (!proposalQuery.data || proposalQuery.data.applyStatus === "applied")),
    retry: false,
  });

  const upvoteCountQueryKey = ["thing-upvote-count", thingId] as const;
  const userVoteQueryKey = ["thing-user-vote", thingId] as const;

  const upvoteCountQuery = useQuery({
    queryKey: upvoteCountQueryKey,
    queryFn: () => apiClient.votes.getUpvoteCount({ entityId: thingId }),
    enabled: !!thingQuery.data,
    staleTime: 15 * 1000,
  });

  const userVoteQuery = useQuery({
    queryKey: userVoteQueryKey,
    queryFn: () => apiClient.votes.getUserVote({ entityId: thingId }),
    enabled: !!thingQuery.data,
    staleTime: 15 * 1000,
  });

  const voteMutation = useMutation({
    mutationFn: (nextHasUpvote: boolean) =>
      nextHasUpvote
        ? apiClient.votes.upvote({ entityId: thingId })
        : apiClient.votes.downvote({ entityId: thingId }),
    onMutate: async (nextHasUpvote) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: upvoteCountQueryKey }),
        queryClient.cancelQueries({ queryKey: userVoteQueryKey }),
      ]);
      const previousCount = queryClient.getQueryData<UpvoteCount>(upvoteCountQueryKey);
      const previousUserVote = queryClient.getQueryData<UserVote>(userVoteQueryKey);
      queryClient.setQueryData<UpvoteCount>(upvoteCountQueryKey, {
        entityId: thingId,
        totalCount: optimisticUpvoteCount(previousCount?.totalCount, nextHasUpvote),
      });
      queryClient.setQueryData<UserVote>(userVoteQueryKey, {
        entityId: thingId,
        hasUpvote: nextHasUpvote,
      });
      return { previousCount, previousUserVote };
    },
    onSuccess: (result, nextHasUpvote) => {
      queryClient.setQueryData<UpvoteCount>(upvoteCountQueryKey, {
        entityId: thingId,
        totalCount: result.totalCount,
      });
      queryClient.setQueryData<UserVote>(userVoteQueryKey, {
        entityId: thingId,
        hasUpvote: nextHasUpvote,
      });
      toast.success(nextHasUpvote ? "Thing upvoted" : "Upvote removed");
    },
    onError: (error: Error, _nextHasUpvote, context) => {
      queryClient.setQueryData(upvoteCountQueryKey, context?.previousCount);
      queryClient.setQueryData(userVoteQueryKey, context?.previousUserVote);
      toast.error(error.message || "Unable to update your vote");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upvoteCountQueryKey }),
        queryClient.invalidateQueries({ queryKey: userVoteQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["thing-upvote-counts"] }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.template.deleteThing({ thingId }),
    onSuccess: () => {
      toast.success("Thing deleted");
      void router.navigate({ to: "/things" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const thing = thingQuery.data;
  const proposal = proposalQuery.data;
  const isLoading =
    (thingQuery.isLoading || proposalQuery.isLoading) && !thingQuery.data && !proposalQuery.data;

  if (isLoading) {
    return (
      <PageContainer variant="default">
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-48" />
        </div>
      </PageContainer>
    );
  }

  if (!thing && !proposal) {
    return (
      <PageContainer variant="default">
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="text-base font-semibold text-foreground">Thing not found.</p>
          {proposalQuery.isError && (
            <p className="text-sm text-muted-foreground">
              Proposal status could not be loaded: {proposalQuery.error.message}
            </p>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link to="/things">back to things</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer variant="default">
      <div className="space-y-4">
        <PageHeader
          title={<span className="font-mono truncate">{thingId}</span>}
          actions={
            canGoBack ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => router.history.back()}
              >
                <ArrowLeft />
              </Button>
            ) : (
              <Button asChild variant="outline" size="icon-sm">
                <Link to="/things">
                  <ArrowLeft />
                </Link>
              </Button>
            )
          }
        />

        {proposal && <ProposalStatusBanner proposal={proposal} />}

        {!thing ? (
          <div className="rounded-[12px] border border-border bg-card p-6 text-sm text-muted-foreground">
            This thing is not live in the registry yet.
          </div>
        ) : (
          <>
            <div className="rounded-[12px] border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Badge variant="outline" className="text-xs font-mono">
                  {thing.type}
                </Badge>
                <Button
                  type="button"
                  variant={userVoteQuery.data?.hasUpvote ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  aria-pressed={userVoteQuery.data?.hasUpvote ?? false}
                  onClick={() => voteMutation.mutate(!(userVoteQuery.data?.hasUpvote ?? false))}
                  disabled={
                    upvoteCountQuery.isLoading || userVoteQuery.isLoading || voteMutation.isPending
                  }
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  {upvoteCountQuery.data?.totalCount ?? 0}
                  <span>{userVoteQuery.data?.hasUpvote ? "upvoted" : "upvote"}</span>
                </Button>
              </div>

              <div className="space-y-1.5 text-sm">
                <MetaRow label="thingId" mono>
                  {thing.thingId}
                </MetaRow>
                <MetaRow label="type" mono>
                  {thing.type}
                </MetaRow>
                <MetaRow label="created">{new Date(thing.createdAt).toLocaleString()}</MetaRow>
                <MetaRow label="updated">{new Date(thing.updatedAt).toLocaleString()}</MetaRow>
              </div>

              <div className="rounded-[8px] border border-border bg-muted/10 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Payload
                </div>
                <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-all leading-relaxed">
                  {JSON.stringify(thing.payload, null, 2)}
                </pre>
              </div>
            </div>

            {isAdmin && (
              <div className="rounded-[12px] border border-destructive/30 bg-destructive/5 p-6 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-destructive">
                    Admin
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    if (window.confirm("Delete this thing permanently?")) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 size={12} />
                  {deleteMutation.isPending ? "Deleting..." : "Delete thing"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}

function ProposalStatusBanner({ proposal }: { proposal: Proposal }) {
  const approvedDescription =
    proposal.applyStatus === "applied"
      ? "Approved and live in the thing registry."
      : proposal.applyStatus === "failed"
        ? `Approved, but applying it failed${proposal.applyError ? `: ${proposal.applyError}` : "."}`
        : "Approved and being applied to the thing registry.";
  const content =
    proposal.reviewStatus === "pending"
      ? {
          title: "Pending review",
          description: "An admin must approve this proposal before the thing goes live.",
          className:
            "border-status-warning-border bg-status-warning-bg text-status-warning-foreground",
        }
      : proposal.reviewStatus === "approved"
        ? {
            title: proposal.applyStatus === "applied" ? "Approved" : "Approved · applying",
            description: approvedDescription,
            className:
              "border-status-success-border bg-status-success-bg text-status-success-foreground",
          }
        : proposal.reviewStatus === "rejected"
          ? {
              title: "Rejected",
              description: proposal.rejectionReason || "This proposal was not approved.",
              className: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
            }
          : {
              title: "Removed",
              description: "This proposal is no longer active.",
              className: "border-border bg-muted text-muted-foreground",
            };

  return (
    <div className={cn("rounded-[12px] border-2 p-4", content.className)}>
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-semibold">{content.title}</p>
          <p className="text-sm">{content.description}</p>
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2 rounded-[6px] bg-muted/10 px-2.5 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`text-foreground break-all ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {children}
      </span>
    </div>
  );
}
