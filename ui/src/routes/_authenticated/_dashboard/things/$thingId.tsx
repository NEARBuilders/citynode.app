import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { Button, PageContainer } from "@/components";
import { Skeleton } from "@/components/ui/skeleton";
import { invalidateThingAfterDelete, thingQueryKeys } from "./-thing-cache";
import { ThingDetailsView } from "./-thing-details-view";
import { optimisticUpvoteCount } from "./-thing-votes";

type ApiClient = ReturnType<typeof useApiClient>;
type UpvoteCount = Awaited<ReturnType<ApiClient["votes"]["getUpvoteCount"]>>;
type UserVote = Awaited<ReturnType<ApiClient["votes"]["getUserVote"]>>;

export const Route = createFileRoute("/_authenticated/_dashboard/things/$thingId")({
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
    queryKey: thingQueryKeys.proposal(thingId),
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
    queryKey: thingQueryKeys.detail(thingId),
    queryFn: () => apiClient.template.getThing({ thingId }),
    enabled:
      proposalQuery.isError ||
      (proposalQuery.isSuccess &&
        (!proposalQuery.data || proposalQuery.data.applyStatus === "applied")),
    retry: false,
  });

  const upvoteCountQueryKey = thingQueryKeys.upvoteCount(thingId);
  const userVoteQueryKey = thingQueryKeys.userVote(thingId);

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
        queryClient.invalidateQueries({ queryKey: thingQueryKeys.upvoteCounts }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.template.deleteThing({ thingId }),
    onSuccess: async () => {
      toast.success("Thing deleted");
      try {
        await invalidateThingAfterDelete(queryClient, thingId);
      } catch {
        toast.warning("Thing deleted, but the Things list could not refresh.");
      }
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
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/things" />}>
            back to things
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <ThingDetailsView
      canGoBack={canGoBack}
      isAdmin={isAdmin}
      isDeletePending={deleteMutation.isPending}
      isVoteLoading={upvoteCountQuery.isLoading || userVoteQuery.isLoading}
      isVotePending={voteMutation.isPending}
      proposal={proposal}
      thing={thing}
      thingId={thingId}
      upvoteCount={upvoteCountQuery.data}
      userVote={userVoteQuery.data}
      onBack={() => router.history.back()}
      onVote={(nextHasUpvote) => voteMutation.mutate(nextHasUpvote)}
      onDelete={() => {
        if (window.confirm("Delete this thing permanently?")) deleteMutation.mutate();
      }}
    />
  );
}
