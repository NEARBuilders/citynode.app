import type { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Clock, Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import { sharddogCommunityDrops, sharddogEventDrops } from "../db/schema";
import { toOrpcError } from "../lib/errors";
import type { ShardDogClient, ShardDogDropDetails } from "./sharddog-client";

export type ShardDogEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export interface CommunityDrops {
  membershipDropId: string | null;
  eventDrops: Map<string, string>;
}

const DETAILS_TTL_MS = 10 * 60_000;
const FAILED_DETAILS_TTL_MS = 60_000;
const DETAILS_CACHE_LIMIT = 500;

export interface ShardDogService {
  readonly enabled: boolean;
  readonly client: ShardDogClient;
  dropDetails(dropId: string): Effect.Effect<ShardDogDropDetails | null>;
  drops(organizationId: string): ShardDogEffect<CommunityDrops>;
  setMembershipDrop(input: {
    organizationId: string;
    dropId: string | null;
    updatedBy: string;
  }): ShardDogEffect<void>;
  setEventDrop(input: {
    organizationId: string;
    eventId: string;
    dropId: string | null;
    updatedBy: string;
  }): ShardDogEffect<void>;
}

export class ShardDogTag extends Context.Service<ShardDogTag, ShardDogService>()("api/ShardDog") {}

export const ShardDogLive = (config: { enabled: boolean; client: ShardDogClient }) =>
  Layer.effect(
    ShardDogTag,
    Effect.gen(function* () {
      const db = yield* DatabaseTag;

      const query = <T>(run: () => Promise<T>): ShardDogEffect<T> =>
        Effect.tryPromise({ try: run, catch: toOrpcError });

      const detailsCache = new Map<
        string,
        { details: ShardDogDropDetails | null; expiresAt: number }
      >();
      const pendingDetails = new Map<string, Promise<ShardDogDropDetails | null>>();

      const describeOnce = (dropId: string) => {
        const pending = pendingDetails.get(dropId);
        if (pending) return pending;
        const request = config.client
          .describeDrop(dropId)
          .finally(() => pendingDetails.delete(dropId));
        pendingDetails.set(dropId, request);
        return request;
      };

      const service: ShardDogService = {
        enabled: config.enabled,
        client: config.client,
        dropDetails: Effect.fn("ShardDogService.dropDetails")(function* (dropId: string) {
          const now = yield* Clock.currentTimeMillis;
          const cached = detailsCache.get(dropId);
          if (cached && cached.expiresAt > now) return cached.details;
          const fetched = yield* Effect.tryPromise(() => describeOnce(dropId)).pipe(
            Effect.map((details) => ({ details, ttl: DETAILS_TTL_MS })),
            Effect.orElseSucceed(() => ({ details: null, ttl: FAILED_DETAILS_TTL_MS })),
          );
          detailsCache.delete(dropId);
          if (detailsCache.size >= DETAILS_CACHE_LIMIT) {
            const oldest = detailsCache.keys().next().value;
            if (oldest !== undefined) detailsCache.delete(oldest);
          }
          detailsCache.set(dropId, { details: fetched.details, expiresAt: now + fetched.ttl });
          return fetched.details;
        }),
        drops: (organizationId) =>
          query(async () => {
            const [membership, events] = await Promise.all([
              db
                .select({ dropId: sharddogCommunityDrops.dropId })
                .from(sharddogCommunityDrops)
                .where(eq(sharddogCommunityDrops.organizationId, organizationId)),
              db
                .select({ eventId: sharddogEventDrops.eventId, dropId: sharddogEventDrops.dropId })
                .from(sharddogEventDrops)
                .where(eq(sharddogEventDrops.organizationId, organizationId)),
            ]);
            return {
              membershipDropId: membership[0]?.dropId ?? null,
              eventDrops: new Map(events.map((row) => [row.eventId, row.dropId])),
            };
          }),
        setMembershipDrop: ({ organizationId, dropId, updatedBy }) =>
          query(async () => {
            if (dropId === null) {
              await db
                .delete(sharddogCommunityDrops)
                .where(eq(sharddogCommunityDrops.organizationId, organizationId));
              return;
            }
            const updatedAt = new Date();
            await db
              .insert(sharddogCommunityDrops)
              .values({ organizationId, dropId, updatedBy, updatedAt })
              .onConflictDoUpdate({
                target: sharddogCommunityDrops.organizationId,
                set: { dropId, updatedBy, updatedAt },
              });
          }),
        setEventDrop: ({ organizationId, eventId, dropId, updatedBy }) =>
          query(async () => {
            if (dropId === null) {
              await db
                .delete(sharddogEventDrops)
                .where(
                  and(
                    eq(sharddogEventDrops.organizationId, organizationId),
                    eq(sharddogEventDrops.eventId, eventId),
                  ),
                );
              return;
            }
            const updatedAt = new Date();
            await db
              .insert(sharddogEventDrops)
              .values({ organizationId, eventId, dropId, updatedBy, updatedAt })
              .onConflictDoUpdate({
                target: [sharddogEventDrops.organizationId, sharddogEventDrops.eventId],
                set: { dropId, updatedBy, updatedAt },
              });
          }),
      };

      return service;
    }),
  );
