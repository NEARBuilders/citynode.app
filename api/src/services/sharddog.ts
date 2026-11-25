import type { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import { sharddogCommunityDrops, sharddogEventDrops } from "../db/schema";
import { toOrpcError } from "../lib/errors";
import type { ShardDogClient } from "./sharddog-client";

export type ShardDogEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export interface CommunityDrops {
  membershipDropId: string | null;
  eventDrops: Map<string, string>;
}

export interface ShardDogService {
  readonly enabled: boolean;
  readonly client: ShardDogClient;
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

      const service: ShardDogService = {
        enabled: config.enabled,
        client: config.client,
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
