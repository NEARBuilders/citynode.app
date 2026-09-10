import { ArrowUp, Trash2 } from "lucide-react";
import type { useApiClient } from "@/app";
import { Badge, Button } from "@/components";
import { ThingMetaRow } from "./-thing-meta-row";

type ApiClient = ReturnType<typeof useApiClient>;
type Thing = NonNullable<Awaited<ReturnType<ApiClient["template"]["getThing"]>>>;
type UpvoteCount = Awaited<ReturnType<ApiClient["votes"]["getUpvoteCount"]>>;
type UserVote = Awaited<ReturnType<ApiClient["votes"]["getUserVote"]>>;

export function ThingContent({
  thing,
  isAdmin,
  isDeletePending,
  isVoteLoading,
  isVotePending,
  userVote,
  upvoteCount,
  onDelete,
  onVote,
}: {
  thing: Thing;
  isAdmin: boolean;
  isDeletePending: boolean;
  isVoteLoading: boolean;
  isVotePending: boolean;
  userVote: UserVote | undefined;
  upvoteCount: UpvoteCount | undefined;
  onDelete: () => void;
  onVote: (nextHasUpvote: boolean) => void;
}) {
  return (
    <>
      <div className="rounded-[12px] border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Badge variant="outline" className="text-xs font-mono">
            {thing.type}
          </Badge>
          <Button
            type="button"
            variant={userVote?.hasUpvote ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            aria-pressed={userVote?.hasUpvote ?? false}
            onClick={() => onVote(!(userVote?.hasUpvote ?? false))}
            disabled={isVoteLoading || isVotePending}
          >
            <ArrowUp className="h-3.5 w-3.5" />
            {upvoteCount?.totalCount ?? 0}
            <span>{userVote?.hasUpvote ? "upvoted" : "upvote"}</span>
          </Button>
        </div>

        <div className="space-y-1.5 text-sm">
          <ThingMetaRow label="thingId" mono>
            {thing.thingId}
          </ThingMetaRow>
          <ThingMetaRow label="type" mono>
            {thing.type}
          </ThingMetaRow>
          <ThingMetaRow label="created">{new Date(thing.createdAt).toLocaleString()}</ThingMetaRow>
          <ThingMetaRow label="updated">{new Date(thing.updatedAt).toLocaleString()}</ThingMetaRow>
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
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={onDelete}>
            <Trash2 size={12} />
            {isDeletePending ? "Deleting..." : "Delete thing"}
          </Button>
        </div>
      )}
    </>
  );
}
