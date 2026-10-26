import type { ORPCError } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import { memberCountObservations, memberDirectoryOptIns } from "../db/schema";
import { toOrpcError } from "../lib/errors";

export type MemberDirectoryEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export interface MemberCountObservation {
  count: number;
  observedAt: string;
}

export interface MemberDirectoryService {
  isOptedIn(userId: string): MemberDirectoryEffect<boolean>;
  setOptIn(
    userId: string,
    optedIn: boolean,
    primaryAccountId: string | null,
  ): MemberDirectoryEffect<boolean>;
  refreshPrimaryAccount(
    userId: string,
    primaryAccountId: string | null,
  ): MemberDirectoryEffect<void>;
  optedInAccounts(userIds: string[]): MemberDirectoryEffect<Map<string, string | null>>;
  recordCount(organizationId: string, count: number): MemberDirectoryEffect<MemberCountObservation>;
  latestCount(organizationId: string): MemberDirectoryEffect<MemberCountObservation | null>;
}

export class MemberDirectoryTag extends Context.Service<
  MemberDirectoryTag,
  MemberDirectoryService
>()("api/MemberDirectory") {}

export const MemberDirectoryLive = Layer.effect(
  MemberDirectoryTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const query = <T>(run: () => Promise<T>): MemberDirectoryEffect<T> =>
      Effect.tryPromise({ try: run, catch: toOrpcError });

    const service: MemberDirectoryService = {
      isOptedIn: (userId) =>
        query(async () => {
          const [row] = await db
            .select({ optedIn: memberDirectoryOptIns.optedIn })
            .from(memberDirectoryOptIns)
            .where(eq(memberDirectoryOptIns.userId, userId))
            .limit(1);
          return row?.optedIn ?? false;
        }),
      setOptIn: (userId, optedIn, primaryAccountId) =>
        query(async () => {
          const values = {
            optedIn,
            primaryAccountId: optedIn ? primaryAccountId : null,
            updatedAt: new Date(),
          };
          await db
            .insert(memberDirectoryOptIns)
            .values({ userId, ...values })
            .onConflictDoUpdate({ target: memberDirectoryOptIns.userId, set: values });
          return optedIn;
        }),
      refreshPrimaryAccount: (userId, primaryAccountId) =>
        query(async () => {
          await db
            .update(memberDirectoryOptIns)
            .set({ primaryAccountId, updatedAt: new Date() })
            .where(eq(memberDirectoryOptIns.userId, userId));
        }),
      optedInAccounts: (userIds) =>
        query(async () => {
          if (userIds.length === 0) return new Map<string, string | null>();
          const rows = await db
            .select({
              userId: memberDirectoryOptIns.userId,
              optedIn: memberDirectoryOptIns.optedIn,
              primaryAccountId: memberDirectoryOptIns.primaryAccountId,
            })
            .from(memberDirectoryOptIns)
            .where(inArray(memberDirectoryOptIns.userId, userIds));
          return new Map(
            rows.filter((row) => row.optedIn).map((row) => [row.userId, row.primaryAccountId]),
          );
        }),
      recordCount: (organizationId, count) =>
        query(async () => {
          const observedAt = new Date();
          await db
            .insert(memberCountObservations)
            .values({ organizationId, count, observedAt })
            .onConflictDoUpdate({
              target: memberCountObservations.organizationId,
              set: { count, observedAt },
            });
          return { count, observedAt: observedAt.toISOString() };
        }),
      latestCount: (organizationId) =>
        query(async () => {
          const [row] = await db
            .select()
            .from(memberCountObservations)
            .where(eq(memberCountObservations.organizationId, organizationId))
            .limit(1);
          return row ? { count: row.count, observedAt: row.observedAt.toISOString() } : null;
        }),
    };

    return service;
  }),
);
