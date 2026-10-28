import { ORPCError } from "@orpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import {
  attendanceCheckIns,
  attendanceCodeCheckpoints,
  attendanceEventReconciliations,
} from "../db/schema";
import { toOrpcError } from "../lib/errors";

export type AttendanceEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export const UPSTREAM_CODE_PAGE_LIMIT = 20;

export interface CommunityEvent {
  id: string;
  title: string;
  startsAt: string | null;
  communityName: string;
}

export interface UpstreamCode {
  id: string;
  eventId: string | null;
  usedCount: number;
}

export interface UpstreamCodeStatus {
  eventId: string | null;
  eventName: string;
  joined: Array<{ userId: string; createdAt: Date }>;
}

export interface AttendanceUpstream {
  listCodes(eventId?: string): Promise<UpstreamCode[]>;
  codeStatus(codeId: string): Promise<UpstreamCodeStatus>;
}

export interface ReconcileSummary {
  events: number;
  truncated: string[];
  failed: string[];
}

export type CoverageReason = "not_synced" | "truncated" | "failed";

export interface AttendanceRecord {
  events: Array<{
    organizationId: string;
    communityName: string;
    eventId: string;
    eventName: string;
    checkedInAt: string;
    startsAt: string | null;
  }>;
  unclassified: Array<{
    organizationId: string;
    communityName: string;
    codeId: string;
    eventName: string;
    checkedInAt: string;
  }>;
  communities: Array<{
    organizationId: string;
    communityName: string;
    status: "synced" | "incomplete";
    reasons: CoverageReason[];
    syncedAt: string | null;
  }>;
}

export interface AttendanceService {
  reconcile(input: {
    organizationId: string;
    communityName: string;
    events: CommunityEvent[];
    upstream: AttendanceUpstream;
  }): AttendanceEffect<ReconcileSummary>;
  recordedOrganizations(userId: string): AttendanceEffect<string[]>;
  history(input: {
    userId: string;
    communities: Array<{ organizationId: string; communityName: string; events: CommunityEvent[] }>;
  }): AttendanceEffect<AttendanceRecord>;
}

export class AttendanceTag extends Context.Service<AttendanceTag, AttendanceService>()(
  "api/Attendance",
) {}

const isAccessError = (error: unknown) =>
  error instanceof ORPCError && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.code);

export const AttendanceLive = Layer.effect(
  AttendanceTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const query = <T>(run: () => Promise<T>): AttendanceEffect<T> =>
      Effect.tryPromise({ try: run, catch: toOrpcError });

    const recordCode = (input: {
      organizationId: string;
      communityName: string;
      code: UpstreamCode;
      known: Set<string>;
      upstream: AttendanceUpstream;
    }) =>
      Effect.gen(function* () {
        const { organizationId, code } = input;
        const [checkpoint] = yield* query(() =>
          db
            .select({ usedCount: attendanceCodeCheckpoints.usedCount })
            .from(attendanceCodeCheckpoints)
            .where(
              and(
                eq(attendanceCodeCheckpoints.organizationId, organizationId),
                eq(attendanceCodeCheckpoints.codeId, code.id),
              ),
            ),
        );
        if (checkpoint?.usedCount === code.usedCount) return true;
        const status = yield* Effect.tryPromise(() => input.upstream.codeStatus(code.id)).pipe(
          Effect.option,
        );
        if (status._tag === "None") return false;
        const { eventId, eventName, joined } = status.value;
        const classified = !!eventId && input.known.has(eventId);
        yield* query(() =>
          db.transaction(async (tx) => {
            if (joined.length > 0) {
              await tx
                .insert(attendanceCheckIns)
                .values(
                  joined.map((join) => ({
                    organizationId,
                    codeId: code.id,
                    userId: join.userId,
                    eventId,
                    eventName,
                    communityName: input.communityName,
                    classified,
                    checkedInAt: join.createdAt,
                  })),
                )
                .onConflictDoUpdate({
                  target: [
                    attendanceCheckIns.organizationId,
                    attendanceCheckIns.codeId,
                    attendanceCheckIns.userId,
                  ],
                  set: {
                    eventId: sql`excluded.event_id`,
                    eventName: sql`excluded.event_name`,
                    checkedInAt: sql`excluded.checked_in_at`,
                    classified: sql`${attendanceCheckIns.classified} or excluded.classified`,
                  },
                });
            }
            const reconciledAt = new Date();
            await tx
              .insert(attendanceCodeCheckpoints)
              .values({ organizationId, codeId: code.id, usedCount: code.usedCount, reconciledAt })
              .onConflictDoUpdate({
                target: [
                  attendanceCodeCheckpoints.organizationId,
                  attendanceCodeCheckpoints.codeId,
                ],
                set: { usedCount: code.usedCount, reconciledAt },
              });
          }),
        );
        return true;
      });

    const service: AttendanceService = {
      reconcile: ({ organizationId, communityName, events, upstream }) =>
        Effect.gen(function* () {
          const known = new Set(events.map((event) => event.id));
          const latest = yield* Effect.tryPromise({
            try: () => upstream.listCodes(),
            catch: (error) => error,
          }).pipe(
            Effect.catch((error) =>
              isAccessError(error)
                ? Effect.fail(
                    new ORPCError("FORBIDDEN", {
                      message: "Only this community's organizers can confirm attendance",
                    }),
                  )
                : Effect.succeed(null),
            ),
          );
          const results = yield* Effect.forEach(
            events,
            (event) =>
              Effect.gen(function* () {
                const codes = yield* Effect.tryPromise(() => upstream.listCodes(event.id)).pipe(
                  Effect.option,
                );
                if (codes._tag === "None") return { id: event.id, truncated: false, ok: false };
                const recorded = yield* Effect.forEach(codes.value, (code) =>
                  recordCode({
                    organizationId,
                    communityName: event.communityName,
                    code,
                    known,
                    upstream,
                  }),
                );
                return {
                  id: event.id,
                  truncated: codes.value.length >= UPSTREAM_CODE_PAGE_LIMIT,
                  ok: recorded.every(Boolean),
                };
              }),
            { concurrency: 4 },
          );
          const outside = (latest ?? []).filter(
            (code) => !code.eventId || !known.has(code.eventId),
          );
          yield* Effect.forEach(outside, (code) =>
            recordCode({ organizationId, communityName, code, known, upstream }),
          );
          const reconciledAt = new Date();
          for (const result of results) {
            yield* query(() =>
              db
                .insert(attendanceEventReconciliations)
                .values({
                  organizationId,
                  eventId: result.id,
                  truncated: result.truncated,
                  failed: !result.ok,
                  reconciledAt,
                })
                .onConflictDoUpdate({
                  target: [
                    attendanceEventReconciliations.organizationId,
                    attendanceEventReconciliations.eventId,
                  ],
                  set: result.ok
                    ? { truncated: result.truncated, failed: false, reconciledAt }
                    : { failed: true },
                }),
            );
          }
          return {
            events: events.length,
            truncated: results.filter((result) => result.truncated).map((result) => result.id),
            failed: results.filter((result) => !result.ok).map((result) => result.id),
          };
        }),

      recordedOrganizations: (userId) =>
        query(async () => {
          const rows = await db
            .selectDistinct({ organizationId: attendanceCheckIns.organizationId })
            .from(attendanceCheckIns)
            .where(eq(attendanceCheckIns.userId, userId));
          return rows.map((row) => row.organizationId);
        }),

      history: ({ userId, communities }) =>
        Effect.gen(function* () {
          const organizationIds = communities.map((community) => community.organizationId);
          if (organizationIds.length === 0)
            return { events: [], unclassified: [], communities: [] };
          const rows = yield* query(() =>
            db
              .select()
              .from(attendanceCheckIns)
              .where(
                and(
                  eq(attendanceCheckIns.userId, userId),
                  inArray(attendanceCheckIns.organizationId, organizationIds),
                ),
              ),
          );
          const reconciliations = yield* query(() =>
            db
              .select()
              .from(attendanceEventReconciliations)
              .where(inArray(attendanceEventReconciliations.organizationId, organizationIds)),
          );
          const startsAt = new Map(
            communities.flatMap((community) =>
              community.events.map((event) => [
                `${community.organizationId}:${event.id}`,
                event.startsAt,
              ]),
            ),
          );
          const attended = new Map<string, AttendanceRecord["events"][number]>();
          const unclassified: AttendanceRecord["unclassified"] = [];
          for (const row of rows) {
            const checkedInAt = row.checkedInAt.toISOString();
            if (!row.classified || !row.eventId) {
              unclassified.push({
                organizationId: row.organizationId,
                communityName: row.communityName,
                codeId: row.codeId,
                eventName: row.eventName,
                checkedInAt,
              });
              continue;
            }
            const key = `${row.organizationId}:${row.eventId}`;
            const current = attended.get(key);
            if (current && current.checkedInAt <= checkedInAt) continue;
            attended.set(key, {
              organizationId: row.organizationId,
              communityName: row.communityName,
              eventId: row.eventId,
              eventName: row.eventName,
              checkedInAt,
              startsAt: startsAt.get(key) ?? null,
            });
          }
          const newestFirst = <T extends { checkedInAt: string }>(
            a: T,
            b: T,
            tieBreak: (item: T) => string,
          ) => b.checkedInAt.localeCompare(a.checkedInAt) || tieBreak(a).localeCompare(tieBreak(b));
          const coverage = communities.flatMap((community) => {
            const ownRows = reconciliations.filter(
              (row) => row.organizationId === community.organizationId,
            );
            const byEvent = new Map(ownRows.map((row) => [row.eventId, row]));
            const hasHistory = rows.some((row) => row.organizationId === community.organizationId);
            if (community.events.length === 0 && !hasHistory) return [];
            const reasons = new Set<CoverageReason>();
            for (const event of community.events) {
              const row = byEvent.get(event.id);
              if (!row) reasons.add("not_synced");
              else if (row.failed) reasons.add("failed");
              else if (row.truncated) reasons.add("truncated");
            }
            const synced = community.events
              .map((event) => byEvent.get(event.id)?.reconciledAt)
              .filter((date): date is Date => !!date);
            return [
              {
                organizationId: community.organizationId,
                communityName: community.communityName,
                status: reasons.size === 0 ? ("synced" as const) : ("incomplete" as const),
                reasons: [...reasons].sort(),
                syncedAt:
                  synced.length > 0
                    ? new Date(Math.min(...synced.map((date) => date.getTime()))).toISOString()
                    : null,
              },
            ];
          });
          return {
            events: [...attended.values()].sort((a, b) =>
              newestFirst(a, b, (item) => `${item.organizationId}:${item.eventId}`),
            ),
            unclassified: unclassified.sort((a, b) =>
              newestFirst(a, b, (item) => `${item.organizationId}:${item.codeId}`),
            ),
            communities: coverage,
          };
        }),
    };

    return service;
  }),
);
