import type { ORPCError } from "@orpc/server";
import {
  and,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notExists,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { Clock, Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import {
  attendanceCheckIns,
  sharddogAwards,
  sharddogCommunityDrops,
  sharddogEventDrops,
} from "../db/schema";
import { toOrpcError } from "../lib/errors";
import { SETTLED_AFTER_MS } from "./attendance";
import type { ShardDogClient, ShardDogDropDetails } from "./sharddog-client";

export type ShardDogEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export interface CommunityDrops {
  membershipDropId: string | null;
  eventDrops: Map<string, string>;
}

export const MAX_AWARD_ATTEMPTS = 20;

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
  claimUrl: string | null;
  hasAccount: boolean;
  retrying: boolean;
}

export interface AwardedCollectible {
  organizationId: string;
  kind: (typeof sharddogAwards.$inferSelect)["kind"];
  eventId: string | null;
  viewUrl: string;
  awardedAt: Date;
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
  queueAwards(organizationId: string): ShardDogEffect<void>;
  codesAwaitingAccount(organizationId: string): ShardDogEffect<Set<string>>;
  attachAccount(userId: string, accountId: string): ShardDogEffect<void>;
  deliverAwards(filter: { organizationId?: string; userId?: string }): ShardDogEffect<void>;
  awardsFor(userId: string, organizationId?: string): ShardDogEffect<CollectibleAward[]>;
  awardedToAccount(accountId: string): ShardDogEffect<AwardedCollectible[]>;
}

export class ShardDogTag extends Context.Service<ShardDogTag, ShardDogService>()("api/ShardDog") {}

const idempotencyKey = (award: { id: string; dropId: string }) => `${award.id}:${award.dropId}`;
const claimIdempotencyKey = (award: { id: string; dropId: string }) =>
  `${idempotencyKey(award)}:claim`;

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

      const recordFailure = (awardId: string, error: unknown) =>
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
            .where(eq(sharddogAwards.id, awardId)),
        );

      const handOutClaimLink = (award: typeof sharddogAwards.$inferSelect) =>
        Effect.tryPromise(() =>
          config.client.createClaimLink({
            dropId: award.dropId,
            idempotencyKey: claimIdempotencyKey(award),
          }),
        ).pipe(
          Effect.matchEffect({
            onSuccess: ({ claimUrl }) =>
              query(() =>
                db
                  .update(sharddogAwards)
                  .set({
                    claimUrl,
                    dropId: award.dropId,
                    lastError: null,
                  })
                  .where(
                    and(
                      eq(sharddogAwards.id, award.id),
                      eq(sharddogAwards.status, "pending"),
                      isNull(sharddogAwards.claimUrl),
                      isNull(sharddogAwards.accountId),
                    ),
                  ),
              ).pipe(Effect.as(true)),
            onFailure: (error) => recordFailure(award.id, error).pipe(Effect.as(false)),
          }),
        );

      const awardToAccount = (award: typeof sharddogAwards.$inferSelect) =>
        Effect.tryPromise(() =>
          config.client.award({
            dropId: award.dropId,
            accountId: award.accountId ?? "",
            idempotencyKey: idempotencyKey(award),
          }),
        ).pipe(
          Effect.matchEffect({
            onSuccess: ({ viewUrl }) =>
              query(() =>
                db
                  .update(sharddogAwards)
                  .set({
                    status: "awarded",
                    dropId: award.dropId,
                    accountId: award.accountId,
                    viewUrl,
                    awardedAt: new Date(),
                    lastError: null,
                  })
                  .where(
                    and(eq(sharddogAwards.id, award.id), eq(sharddogAwards.status, "pending")),
                  ),
              ).pipe(Effect.as(true)),
            onFailure: (error) => recordFailure(award.id, error).pipe(Effect.as(false)),
          }),
        );

      const deliverOne = (award: typeof sharddogAwards.$inferSelect) =>
        award.accountId ? awardToAccount(award) : handOutClaimLink(award);

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
                dropId: sql`case when ${sharddogAwards.claimUrl} is null then excluded.drop_id else ${sharddogAwards.dropId} end`,
                accountId: sql`coalesce(excluded.account_id, ${sharddogAwards.accountId})`,
                attempts: sql`case when ${sharddogAwards.accountId} is null and excluded.account_id is not null and ${sharddogAwards.claimUrl} is null then 0 when excluded.drop_id = ${sharddogAwards.dropId} then ${sharddogAwards.attempts} else least(${sharddogAwards.attempts}, 1) end`,
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
        codesAwaitingAccount: (organizationId) =>
          query(async () => {
            if (!config.enabled) return new Set<string>();
            const unsent = (badge: SQL) =>
              notExists(
                db
                  .select({ held: sql`1` })
                  .from(sharddogAwards)
                  .where(
                    and(
                      eq(sharddogAwards.organizationId, attendanceCheckIns.organizationId),
                      eq(sharddogAwards.userId, attendanceCheckIns.userId),
                      badge,
                      or(
                        eq(sharddogAwards.status, "awarded"),
                        isNotNull(sharddogAwards.accountId),
                        isNotNull(sharddogAwards.claimUrl),
                      ),
                    ),
                  ),
              );
            const rows = await db
              .selectDistinct({ codeId: attendanceCheckIns.codeId })
              .from(attendanceCheckIns)
              .leftJoin(
                sharddogCommunityDrops,
                eq(sharddogCommunityDrops.organizationId, attendanceCheckIns.organizationId),
              )
              .leftJoin(
                sharddogEventDrops,
                and(
                  eq(sharddogEventDrops.organizationId, attendanceCheckIns.organizationId),
                  eq(sharddogEventDrops.eventId, attendanceCheckIns.eventId),
                ),
              )
              .where(
                and(
                  eq(attendanceCheckIns.organizationId, organizationId),
                  eq(attendanceCheckIns.classified, true),
                  isNull(attendanceCheckIns.accountId),
                  gte(attendanceCheckIns.checkedInAt, new Date(Date.now() - SETTLED_AFTER_MS)),
                  or(
                    and(
                      isNotNull(sharddogCommunityDrops.dropId),
                      unsent(eq(sharddogAwards.kind, "membership")),
                    ),
                    and(
                      isNotNull(sharddogEventDrops.dropId),
                      unsent(eq(sharddogAwards.eventId, attendanceCheckIns.eventId)),
                    ),
                  ),
                ),
              );
            return new Set(rows.map((row) => row.codeId));
          }),
        attachAccount: (userId, accountId) =>
          query(async () => {
            await db
              .update(sharddogAwards)
              .set({ accountId, attempts: 0 })
              .where(
                and(
                  eq(sharddogAwards.userId, userId),
                  eq(sharddogAwards.status, "pending"),
                  isNull(sharddogAwards.accountId),
                  isNull(sharddogAwards.claimUrl),
                  dropStillLinked,
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
                  isNull(sharddogAwards.claimUrl),
                  or(
                    isNotNull(sharddogAwards.accountId),
                    lt(sharddogAwards.attempts, MAX_AWARD_ATTEMPTS),
                  ),
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
          const claimAndDeliver = Effect.fn("ShardDogService.claimAndDeliver")(function* (
            award: typeof sharddogAwards.$inferSelect,
          ) {
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
                .returning({ accountId: sharddogAwards.accountId }),
            );
            const [locked] = claimed;
            if (!locked) return false;
            return yield* deliverOne({ ...award, ...locked });
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
                  or(
                    eq(sharddogAwards.status, "awarded"),
                    isNotNull(sharddogAwards.claimUrl),
                    dropStillLinked,
                  ),
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
              claimUrl: row.claimUrl,
              hasAccount: !!row.accountId,
              retrying: row.attempts < MAX_AWARD_ATTEMPTS,
            }));
          }),
        awardedToAccount: (accountId) =>
          query(async () => {
            const rows = await db
              .select({
                organizationId: sharddogAwards.organizationId,
                kind: sharddogAwards.kind,
                eventId: sharddogAwards.eventId,
                viewUrl: sharddogAwards.viewUrl,
                awardedAt: sharddogAwards.awardedAt,
              })
              .from(sharddogAwards)
              .where(
                and(
                  eq(sharddogAwards.accountId, accountId),
                  eq(sharddogAwards.status, "awarded"),
                  isNotNull(sharddogAwards.viewUrl),
                  isNotNull(sharddogAwards.awardedAt),
                ),
              )
              .orderBy(desc(sharddogAwards.awardedAt), desc(sharddogAwards.id));
            return rows.flatMap((row) =>
              row.viewUrl && row.awardedAt
                ? [
                    {
                      organizationId: row.organizationId,
                      kind: row.kind,
                      eventId: row.eventId,
                      viewUrl: row.viewUrl,
                      awardedAt: row.awardedAt,
                    },
                  ]
                : [],
            );
          }),
      };

      return service;
    }),
  );
