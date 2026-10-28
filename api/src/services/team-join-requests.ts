import type { ORPCError } from "@orpc/server";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import { teamJoinEndorsements, teamJoinRequests } from "../db/schema";
import { isUniqueViolation, toOrpcError } from "../lib/errors";

const CLOSED_REQUEST_VISIBLE_MS = 30 * 24 * 3_600_000;

export type TeamJoinRequestEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export type TeamJoinRequestStatus = (typeof teamJoinRequests.$inferSelect)["status"];
export type TeamJoinClosedReason = NonNullable<
  (typeof teamJoinRequests.$inferSelect)["closedReason"]
>;

export type TeamJoinRequestRecord = typeof teamJoinRequests.$inferSelect & {
  endorserUserIds: string[];
};

export interface NewTeamJoinRequest {
  organizationId: string;
  teamId: string;
  teamName: string;
  teamAreas: string[];
  requesterUserId: string;
  requesterName: string | null;
}

export interface TeamJoinRequestsService {
  list(
    organizationId: string,
    viewerUserId: string,
  ): TeamJoinRequestEffect<TeamJoinRequestRecord[]>;
  get(requestId: string): TeamJoinRequestEffect<TeamJoinRequestRecord | null>;
  create(request: NewTeamJoinRequest): TeamJoinRequestEffect<TeamJoinRequestRecord | null>;
  settle(
    requestId: string,
    status: Exclude<TeamJoinRequestStatus, "pending" | "closed">,
    decidedByUserId: string,
  ): TeamJoinRequestEffect<boolean>;
  close(
    closures: ReadonlyArray<{ id: string; reason: TeamJoinClosedReason }>,
  ): TeamJoinRequestEffect<void>;
  endorse(requestId: string, endorserUserId: string): TeamJoinRequestEffect<void>;
}

export class TeamJoinRequestsTag extends Context.Service<
  TeamJoinRequestsTag,
  TeamJoinRequestsService
>()("api/TeamJoinRequests") {}

export const TeamJoinRequestsLive = Layer.effect(
  TeamJoinRequestsTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const query = <T>(run: () => Promise<T>): TeamJoinRequestEffect<T> =>
      Effect.tryPromise({ try: run, catch: toOrpcError });

    const withEndorsements = async (rows: Array<typeof teamJoinRequests.$inferSelect>) => {
      if (rows.length === 0) return [];
      const endorsements = await db
        .select({
          requestId: teamJoinEndorsements.requestId,
          endorserUserId: teamJoinEndorsements.endorserUserId,
        })
        .from(teamJoinEndorsements)
        .where(
          inArray(
            teamJoinEndorsements.requestId,
            rows.map((row) => row.id),
          ),
        );
      const byRequest = new Map<string, string[]>();
      for (const endorsement of endorsements) {
        byRequest.set(endorsement.requestId, [
          ...(byRequest.get(endorsement.requestId) ?? []),
          endorsement.endorserUserId,
        ]);
      }
      return rows.map((row) => ({ ...row, endorserUserIds: byRequest.get(row.id) ?? [] }));
    };

    const service: TeamJoinRequestsService = {
      list: (organizationId, viewerUserId) =>
        query(async () =>
          withEndorsements(
            await db
              .select()
              .from(teamJoinRequests)
              .where(
                and(
                  eq(teamJoinRequests.organizationId, organizationId),
                  or(
                    eq(teamJoinRequests.status, "pending"),
                    and(
                      eq(teamJoinRequests.status, "closed"),
                      gte(
                        teamJoinRequests.decidedAt,
                        new Date(Date.now() - CLOSED_REQUEST_VISIBLE_MS),
                      ),
                    ),
                    eq(teamJoinRequests.requesterUserId, viewerUserId),
                  ),
                ),
              )
              .orderBy(teamJoinRequests.createdAt),
          ),
        ),
      get: (requestId) =>
        query(async () => {
          const rows = await db
            .select()
            .from(teamJoinRequests)
            .where(eq(teamJoinRequests.id, requestId))
            .limit(1);
          const [record] = await withEndorsements(rows);
          return record ?? null;
        }),
      create: (request) =>
        Effect.tryPromise({
          try: async () => {
            const [row] = await db.insert(teamJoinRequests).values(request).returning();
            return row ? { ...row, endorserUserIds: [] } : null;
          },
          catch: (error) => error,
        }).pipe(
          Effect.catch((error) =>
            isUniqueViolation(error) ? Effect.succeed(null) : Effect.fail(toOrpcError(error)),
          ),
        ),
      settle: (requestId, status, decidedByUserId) =>
        query(async () => {
          const now = new Date();
          const rows = await db
            .update(teamJoinRequests)
            .set({ status, decidedByUserId, decidedAt: now, updatedAt: now })
            .where(and(eq(teamJoinRequests.id, requestId), eq(teamJoinRequests.status, "pending")))
            .returning({ id: teamJoinRequests.id });
          return rows.length > 0;
        }),
      close: (closures) =>
        query(async () => {
          const now = new Date();
          const reasons = [...new Set(closures.map((closure) => closure.reason))];
          for (const reason of reasons) {
            await db
              .update(teamJoinRequests)
              .set({ status: "closed", closedReason: reason, decidedAt: now, updatedAt: now })
              .where(
                and(
                  inArray(
                    teamJoinRequests.id,
                    closures
                      .filter((closure) => closure.reason === reason)
                      .map((closure) => closure.id),
                  ),
                  eq(teamJoinRequests.status, "pending"),
                ),
              );
          }
        }),
      endorse: (requestId, endorserUserId) =>
        query(async () => {
          await db
            .insert(teamJoinEndorsements)
            .values({ requestId, endorserUserId })
            .onConflictDoNothing();
        }),
    };

    return service;
  }),
);
