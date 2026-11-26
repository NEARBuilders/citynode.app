import type { ORPCError } from "@orpc/server";
import { and, eq, exists, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import {
  attendanceCheckIns,
  sharddogAwards,
  sharddogCommunityDrops,
  sharddogEventDrops,
} from "../db/schema";
import { toOrpcError } from "../lib/errors";
import type { ShardDogClient } from "./sharddog-client";

export type ShardDogEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export interface CommunityDrops {
  membershipDropId: string | null;
  eventDrops: Map<string, string>;
}

const RETRY_STEP_MS = 60_000;

const MAX_RETRY_STEPS = 60;

const DELIVERY_BATCH = 50;

const WRITE_CHUNK = 1_000;

function chunked<T>(items: T[]): T[][] {
  return Array.from({ length: Math.ceil(items.length / WRITE_CHUNK) }, (_, index) =>
    items.slice(index * WRITE_CHUNK, (index + 1) * WRITE_CHUNK),
  );
}

export interface CollectibleAward {
  id: string;
  organizationId: string;
  kind: "membership" | "event";
  eventId: string | null;
  status: "pending" | "awarded";
  viewUrl: string | null;
  hasAccount: boolean;
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
  queueAwards(organizationId: string): ShardDogEffect<void>;
  attachAccount(userId: string, accountId: string): ShardDogEffect<void>;
  deliverAwards(filter: { organizationId?: string; userId?: string }): ShardDogEffect<void>;
  awardsFor(userId: string, organizationId?: string): ShardDogEffect<CollectibleAward[]>;
}

export class ShardDogTag extends Context.Service<ShardDogTag, ShardDogService>()("api/ShardDog") {}

export const ShardDogLive = (config: { enabled: boolean; client: ShardDogClient }) =>
  Layer.effect(
    ShardDogTag,
    Effect.gen(function* () {
      const db = yield* DatabaseTag;

      const query = <T>(run: () => Promise<T>): ShardDogEffect<T> =>
        Effect.tryPromise({ try: run, catch: toOrpcError });

      const dropStillLinked = or(
        and(
          eq(sharddogAwards.kind, "membership"),
          exists(
            db
              .select({ linked: sql`1` })
              .from(sharddogCommunityDrops)
              .where(
                and(
                  eq(sharddogCommunityDrops.organizationId, sharddogAwards.organizationId),
                  eq(sharddogCommunityDrops.dropId, sharddogAwards.dropId),
                ),
              ),
          ),
        ),
        and(
          eq(sharddogAwards.kind, "event"),
          exists(
            db
              .select({ linked: sql`1` })
              .from(sharddogEventDrops)
              .where(
                and(
                  eq(sharddogEventDrops.organizationId, sharddogAwards.organizationId),
                  eq(sharddogEventDrops.eventId, sharddogAwards.eventId),
                  eq(sharddogEventDrops.dropId, sharddogAwards.dropId),
                ),
              ),
          ),
        ),
      );

      const deliverOne = (award: typeof sharddogAwards.$inferSelect) =>
        Effect.tryPromise(() =>
          config.client.award({
            dropId: award.dropId,
            accountId: award.accountId ?? "",
            idempotencyKey: `${award.id}:${award.dropId}`,
          }),
        ).pipe(
          Effect.matchEffect({
            onSuccess: ({ viewUrl }) =>
              query(() =>
                db
                  .update(sharddogAwards)
                  .set({
                    status: "awarded",
                    viewUrl,
                    awardedAt: new Date(),
                    lastError: null,
                  })
                  .where(
                    and(eq(sharddogAwards.id, award.id), eq(sharddogAwards.status, "pending")),
                  ),
              ).pipe(Effect.as(true)),
            onFailure: (error) =>
              query(() =>
                db
                  .update(sharddogAwards)
                  .set({
                    lastError: String(
                      error instanceof Error && error.cause instanceof Error
                        ? error.cause.message
                        : error,
                    ).slice(0, 500),
                  })
                  .where(eq(sharddogAwards.id, award.id)),
              ).pipe(Effect.as(false)),
          }),
        );

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
        queueAwards: (organizationId) =>
          query(async () => {
            if (!config.enabled) return;
            const [membership, eventDrops, checkIns] = await Promise.all([
              db
                .select({ dropId: sharddogCommunityDrops.dropId })
                .from(sharddogCommunityDrops)
                .where(eq(sharddogCommunityDrops.organizationId, organizationId)),
              db
                .select({ eventId: sharddogEventDrops.eventId, dropId: sharddogEventDrops.dropId })
                .from(sharddogEventDrops)
                .where(eq(sharddogEventDrops.organizationId, organizationId)),
              db
                .select({
                  userId: attendanceCheckIns.userId,
                  eventId: attendanceCheckIns.eventId,
                  accountId: attendanceCheckIns.accountId,
                  checkedInAt: attendanceCheckIns.checkedInAt,
                })
                .from(attendanceCheckIns)
                .where(
                  and(
                    eq(attendanceCheckIns.organizationId, organizationId),
                    eq(attendanceCheckIns.classified, true),
                    isNotNull(attendanceCheckIns.eventId),
                  ),
                ),
            ]);
            const membershipDropId = membership[0]?.dropId ?? null;
            const dropByEvent = new Map(eventDrops.map((row) => [row.eventId, row.dropId]));
            const accounts = new Map<string, { accountId: string; at: number }>();
            for (const row of checkIns) {
              if (!row.accountId) continue;
              const at = row.checkedInAt.getTime();
              const known = accounts.get(row.userId);
              if (!known || at > known.at)
                accounts.set(row.userId, { accountId: row.accountId, at });
            }
            const accountOf = (userId: string) => accounts.get(userId)?.accountId ?? null;
            const members = new Set(checkIns.map((row) => row.userId));
            const eventAwards = new Map<
              string,
              { userId: string; eventId: string; dropId: string }
            >();
            for (const row of checkIns) {
              const dropId = row.eventId ? dropByEvent.get(row.eventId) : undefined;
              if (!row.eventId || !dropId) continue;
              eventAwards.set(`${row.userId}:${row.eventId}`, {
                userId: row.userId,
                eventId: row.eventId,
                dropId,
              });
            }
            await db.transaction(async (tx) => {
              const pending = await tx
                .select({
                  id: sharddogAwards.id,
                  kind: sharddogAwards.kind,
                  userId: sharddogAwards.userId,
                  eventId: sharddogAwards.eventId,
                })
                .from(sharddogAwards)
                .where(
                  and(
                    eq(sharddogAwards.organizationId, organizationId),
                    eq(sharddogAwards.status, "pending"),
                    eq(sharddogAwards.attempts, 0),
                  ),
                );
              const stale = pending
                .filter((award) =>
                  award.kind === "membership"
                    ? !membershipDropId
                    : !eventAwards.has(`${award.userId}:${award.eventId}`),
                )
                .map((award) => award.id);
              for (const ids of chunked(stale)) {
                await tx.delete(sharddogAwards).where(inArray(sharddogAwards.id, ids));
              }
              const refresh = {
                dropId: sql`excluded.drop_id`,
                accountId: sql`coalesce(excluded.account_id, ${sharddogAwards.accountId})`,
                attempts: sql`case when excluded.drop_id = ${sharddogAwards.dropId} then ${sharddogAwards.attempts} else least(${sharddogAwards.attempts}, 1) end`,
              };
              const membershipRows = membershipDropId
                ? [...members].map((userId) => ({
                    organizationId,
                    userId,
                    kind: "membership" as const,
                    dropId: membershipDropId,
                    accountId: accountOf(userId),
                  }))
                : [];
              for (const rows of chunked(membershipRows)) {
                await tx
                  .insert(sharddogAwards)
                  .values(rows)
                  .onConflictDoUpdate({
                    target: [sharddogAwards.organizationId, sharddogAwards.userId],
                    targetWhere: sql`kind = 'membership'`,
                    set: refresh,
                    setWhere: sql`${sharddogAwards.status} = 'pending'`,
                  });
              }
              const eventRows = [...eventAwards.values()].map((award) => ({
                organizationId,
                userId: award.userId,
                kind: "event" as const,
                eventId: award.eventId,
                dropId: award.dropId,
                accountId: accountOf(award.userId),
              }));
              for (const rows of chunked(eventRows)) {
                await tx
                  .insert(sharddogAwards)
                  .values(rows)
                  .onConflictDoUpdate({
                    target: [
                      sharddogAwards.organizationId,
                      sharddogAwards.userId,
                      sharddogAwards.eventId,
                    ],
                    targetWhere: sql`kind = 'event'`,
                    set: refresh,
                    setWhere: sql`${sharddogAwards.status} = 'pending'`,
                  });
              }
            });
          }),
        attachAccount: (userId, accountId) =>
          query(async () => {
            await db
              .update(sharddogAwards)
              .set({ accountId })
              .where(
                and(
                  eq(sharddogAwards.userId, userId),
                  eq(sharddogAwards.status, "pending"),
                  isNull(sharddogAwards.accountId),
                ),
              );
          }),
        deliverAwards: Effect.fn("ShardDogService.deliverAwards")(function* (filter) {
          if (!config.enabled) return;
          const startedAt = new Date().toISOString();
          const dueBatch = query(() =>
            db
              .select()
              .from(sharddogAwards)
              .where(
                and(
                  eq(sharddogAwards.status, "pending"),
                  isNotNull(sharddogAwards.accountId),
                  or(
                    isNull(sharddogAwards.attemptedAt),
                    lt(
                      sharddogAwards.attemptedAt,
                      sql`${startedAt}::timestamptz - make_interval(secs => ${RETRY_STEP_MS / 1000} * least(${sharddogAwards.attempts}, ${MAX_RETRY_STEPS}))`,
                    ),
                  ),
                  dropStillLinked,
                  filter.organizationId
                    ? eq(sharddogAwards.organizationId, filter.organizationId)
                    : undefined,
                  filter.userId ? eq(sharddogAwards.userId, filter.userId) : undefined,
                ),
              )
              .orderBy(sql`${sharddogAwards.attemptedAt} asc nulls first`, sharddogAwards.createdAt)
              .limit(DELIVERY_BATCH),
          );
          const claimAndDeliver = (award: typeof sharddogAwards.$inferSelect) =>
            Effect.gen(function* () {
              const claimed = yield* query(() =>
                db
                  .update(sharddogAwards)
                  .set({
                    attemptedAt: new Date(),
                    attempts: sql`${sharddogAwards.attempts} + 1`,
                  })
                  .where(
                    and(
                      eq(sharddogAwards.id, award.id),
                      eq(sharddogAwards.status, "pending"),
                      eq(sharddogAwards.attempts, award.attempts),
                      eq(sharddogAwards.dropId, award.dropId),
                      dropStillLinked,
                    ),
                  )
                  .returning({ id: sharddogAwards.id }),
              );
              if (claimed.length === 0) return false;
              return yield* deliverOne(award);
            });
          while (true) {
            const due = yield* dueBatch;
            const delivered = yield* Effect.forEach(due, claimAndDeliver, { concurrency: 4 });
            if (due.length < DELIVERY_BATCH || !delivered.includes(true)) return;
          }
        }),
        awardsFor: (userId, organizationId) =>
          query(async () => {
            const rows = await db
              .select()
              .from(sharddogAwards)
              .where(
                and(
                  eq(sharddogAwards.userId, userId),
                  organizationId ? eq(sharddogAwards.organizationId, organizationId) : undefined,
                  or(eq(sharddogAwards.status, "awarded"), dropStillLinked),
                ),
              )
              .orderBy(sharddogAwards.createdAt);
            return rows.map((row) => ({
              id: row.id,
              organizationId: row.organizationId,
              kind: row.kind,
              eventId: row.eventId,
              status: row.status,
              viewUrl: row.viewUrl,
              hasAccount: !!row.accountId,
            }));
          }),
      };

      return service;
    }),
  );
