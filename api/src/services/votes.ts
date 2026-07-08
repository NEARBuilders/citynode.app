import { Context, Effect, Layer } from "every-plugin/effect";

export interface VoteEvent {
  pluginId: string;
  thingId: string;
  action: string;
  type: string;
  timestamp: string;
  userId?: string;
  totalCount?: number;
}

export interface VoteService {
  upvote(input: { thingId: string; pluginId: string; type: string; userId: string }): Effect.Effect<{
    thingId: string;
    userId: string;
    totalCount: number;
  }>;
  downvote(input: { thingId: string; pluginId: string; type: string; userId: string }): Effect.Effect<{
    thingId: string;
    totalCount: number;
  }>;
  getUpvoteCount(thingId: string): Effect.Effect<{ thingId: string; totalCount: number }>;
  getUserVote(thingId: string, userId: string): Effect.Effect<{ thingId: string; hasUpvote: boolean }>;
  getUserVotes(
    thingIds: string[],
    userId: string,
  ): Effect.Effect<Record<string, { thingId: string; hasUpvote: boolean }>>;
  getUpvoteCounts(
    thingIds: string[],
  ): Effect.Effect<Record<string, { thingId: string; totalCount: number }>>;
  getUpvoteFeed(limit?: number, cursor?: string): Effect.Effect<{
    data: VoteEvent[];
    meta: {
      total: number;
      hasMore: boolean;
      nextCursor: string | null;
    };
  }>;
}

export class VotesTag extends Context.Tag("api/Votes")<VoteService, VoteService>() {}

export const VotesLive = Layer.succeed(VotesTag, createVotesService());

function createVotesService(): VoteService {
  const votesByThing = new Map<string, Set<string>>();
  const feed: VoteEvent[] = [];

  function getVoteSet(thingId: string) {
    let set = votesByThing.get(thingId);
    if (!set) {
      set = new Set<string>();
      votesByThing.set(thingId, set);
    }
    return set;
  }

  function recordEvent(event: VoteEvent) {
    feed.push(event);
  }

  function currentCount(thingId: string) {
    return votesByThing.get(thingId)?.size ?? 0;
  }

  return {
    upvote: (input) =>
      Effect.sync(() => {
        const voteSet = getVoteSet(input.thingId);
        voteSet.add(input.userId);

        const totalCount = voteSet.size;
        recordEvent({
          pluginId: input.pluginId,
          thingId: input.thingId,
          action: "upvoted",
          type: input.type,
          userId: input.userId,
          totalCount,
          timestamp: new Date().toISOString(),
        });

        return { thingId: input.thingId, userId: input.userId, totalCount };
      }),

    downvote: (input) =>
      Effect.sync(() => {
        const voteSet = getVoteSet(input.thingId);
        voteSet.delete(input.userId);

        const totalCount = voteSet.size;
        recordEvent({
          pluginId: input.pluginId,
          thingId: input.thingId,
          action: "downvoted",
          type: input.type,
          userId: input.userId,
          totalCount,
          timestamp: new Date().toISOString(),
        });

        return { thingId: input.thingId, totalCount };
      }),

    getUpvoteCount: (thingId) => Effect.sync(() => ({ thingId, totalCount: currentCount(thingId) })),

    getUserVote: (thingId, userId) =>
      Effect.sync(() => ({ thingId, hasUpvote: votesByThing.get(thingId)?.has(userId) ?? false })),

    getUserVotes: (thingIds, userId) =>
      Effect.sync(() =>
        Object.fromEntries(
          thingIds.map((thingId) => [thingId, { thingId, hasUpvote: votesByThing.get(thingId)?.has(userId) ?? false }]),
        ),
      ),

    getUpvoteCounts: (thingIds) =>
      Effect.sync(() =>
        Object.fromEntries(thingIds.map((thingId) => [thingId, { thingId, totalCount: currentCount(thingId) }])),
      ),

    getUpvoteFeed: (limit = 50, cursor?: string) =>
      Effect.sync(() => {
        const pageLimit = Math.min(limit, 100);
        const start = Number(cursor ?? "0");
        const normalizedStart = Number.isFinite(start) && start >= 0 ? start : 0;
        const records = [...feed].reverse();
        const page = records.slice(normalizedStart, normalizedStart + pageLimit + 1);
        const hasMore = page.length > pageLimit;
        const data = page.slice(0, pageLimit);

        return {
          data,
          meta: {
            total: records.length,
            hasMore,
            nextCursor: hasMore ? String(normalizedStart + pageLimit) : null,
          },
        };
      }),
  };
}
