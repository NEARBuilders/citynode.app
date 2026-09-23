import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { useApiClient } from "@/app";
import { Button, PageContainer, PageHeader } from "@/components";
import { ThingContent } from "./-thing-content";
import { type ThingProposal, ThingProposalStatus } from "./-thing-proposal-status";

type ApiClient = ReturnType<typeof useApiClient>;
type Thing = NonNullable<Awaited<ReturnType<ApiClient["template"]["getThing"]>>>;
type UpvoteCount = Awaited<ReturnType<ApiClient["votes"]["getUpvoteCount"]>>;
type UserVote = Awaited<ReturnType<ApiClient["votes"]["getUserVote"]>>;

export function ThingDetailsView({
  canGoBack,
  isAdmin,
  isDeletePending,
  isVoteLoading,
  isVotePending,
  proposal,
  thing,
  thingId,
  upvoteCount,
  userVote,
  onBack,
  onDelete,
  onVote,
}: {
  canGoBack: boolean;
  isAdmin: boolean;
  isDeletePending: boolean;
  isVoteLoading: boolean;
  isVotePending: boolean;
  proposal: ThingProposal | null | undefined;
  thing: Thing | undefined;
  thingId: string;
  upvoteCount: UpvoteCount | undefined;
  userVote: UserVote | undefined;
  onBack: () => void;
  onDelete: () => void;
  onVote: (nextHasUpvote: boolean) => void;
}) {
  return (
    <PageContainer variant="default">
      <div className="space-y-4">
        <PageHeader
          title={<span className="truncate font-mono">{thingId}</span>}
          actions={
            canGoBack ? (
              <Button type="button" variant="outline" size="icon-sm" onClick={onBack}>
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

        {proposal && <ThingProposalStatus proposal={proposal} />}
        {thing ? (
          <ThingContent
            thing={thing}
            isAdmin={isAdmin}
            isDeletePending={isDeletePending}
            isVoteLoading={isVoteLoading}
            isVotePending={isVotePending}
            userVote={userVote}
            upvoteCount={upvoteCount}
            onVote={onVote}
            onDelete={onDelete}
          />
        ) : (
          <div className="rounded-[12px] border border-border bg-card p-6 text-sm text-muted-foreground">
            This thing is not live in the registry yet.
          </div>
        )}
      </div>
    </PageContainer>
  );
}
