import { ORPCError } from "@orpc/server";
import { and, eq, gte, inArray, isNotNull, lt, max, min, sql } from "drizzle-orm";
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

export const ORGANIZATION_SWEEP = "*";

const SETTLED_AFTER_MS = 14 * 24 * 3_600_000;

export interface CommunityEvent {
  id: string;
  title: string;
  startsAt: string | null;
}

export interface UpstreamCode {
  id: string;
  eventId: string | null;
  usedCount: number;
}

export interface UpstreamCodeStatus {
  eventId: string | null;
  eventName: string | null;
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

export interface AttendanceSummary {
  people: number;
  returning: number;
  syncedAt: string | null;
  partial: boolean;
}

export interface CommunityEngagement extends AttendanceSummary {
  organizationId: string;
}

export interface EventAttendance extends AttendanceSummary {
  organizationId: string;
  eventId: string;
}

export interface PlatformAttendance {
  people: number;
  returning: number;
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
  engagement(): AttendanceEffect<CommunityEngagement[]>;
  eventAttendance(): AttendanceEffect<EventAttendance[]>;
  platformAttendance(window: { from: Date; to: Date }): AttendanceEffect<PlatformAttendance>;
  monthlyCheckIns(
    organizationId: string,
    window: { from: Date; to: Date },
  ): AttendanceEffect<number>;
  lastSyncedAt(organizationId: string): AttendanceEffect<Date | null>;
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
                    eventName: eventName ?? input.communityName,
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

    const syncedAttendance = () =>
      Effect.all({
        checkIns: query(() =>
          db
            .select({
              organizationId: attendanceCheckIns.organizationId,
              userId: attendanceCheckIns.userId,
              eventId: attendanceCheckIns.eventId,
              firstCheckedInAt: min(attendanceCheckIns.checkedInAt),
            })
            .from(attendanceCheckIns)
            .where(
              and(eq(attendanceCheckIns.classified, true), isNotNull(attendanceCheckIns.eventId)),
            )
            .groupBy(
              attendanceCheckIns.organizationId,
              attendanceCheckIns.userId,
              attendanceCheckIns.eventId,
            ),
        ),
        reconciliations: query(() => db.select().from(attendanceEventReconciliations)),
      });

    const service: AttendanceService = {
      reconcile: ({ organizationId, communityName, events, upstream }) =>
        Effect.gen(function* () {
          const known = new Set(events.map((event) => event.id));
          const forbidden = () =>
            new ORPCError("FORBIDDEN", {
              message: "Only this community's organizers can confirm attendance",
            });
          const listCodes = (eventId?: string) =>
            Effect.tryPromise({
              try: () => upstream.listCodes(eventId),
              catch: (error) => error,
            }).pipe(
              Effect.catch((error) =>
                isAccessError(error) ? Effect.fail(forbidden()) : Effect.succeed(null),
              ),
            );
          const latest = yield* listCodes();
          const previous = new Map(
            (yield* query(() =>
              db
                .select()
                .from(attendanceEventReconciliations)
                .where(eq(attendanceEventReconciliations.organizationId, organizationId)),
            )).map((row) => [row.eventId, row]),
          );
          const checkpoints = new Map(
            (yield* query(() =>
              db
                .select()
                .from(attendanceCodeCheckpoints)
                .where(eq(attendanceCodeCheckpoints.organizationId, organizationId)),
            )).map((row) => [row.codeId, row.usedCount]),
          );
          const freshCodes = new Set(
            (latest ?? [])
              .filter((code) => checkpoints.get(code.id) !== code.usedCount)
              .map((code) => code.eventId),
          );
          const settledBefore = Date.now() - SETTLED_AFTER_MS;
          const due = events.filter((event) => {
            const row = previous.get(event.id);
            if (!row || row.failed || row.truncated || !latest) return true;
            if (freshCodes.has(event.id)) return true;
            return !event.startsAt || Date.parse(event.startsAt) > settledBefore;
          });
          const results = yield* Effect.forEach(
            due,
            (event) =>
              Effect.gen(function* () {
                const codes = yield* listCodes(event.id);
                if (!codes) return { id: event.id, truncated: false, ok: false };
                const recorded = yield* Effect.forEach(codes, (code) =>
                  recordCode({
                    organizationId,
                    communityName,
                    code,
                    known,
                    upstream,
                  }),
                );
                return {
                  id: event.id,
                  truncated: codes.length >= UPSTREAM_CODE_PAGE_LIMIT,
                  ok: recorded.every(Boolean),
                };
              }),
            { concurrency: 4 },
          );
          const outside = (latest ?? []).filter(
            (code) => !code.eventId || !known.has(code.eventId),
          );
          const outsideRecorded = yield* Effect.forEach(outside, (code) =>
            recordCode({ organizationId, communityName, code, known, upstream }),
          );
          results.push({
            id: ORGANIZATION_SWEEP,
            truncated: false,
            ok: !!latest && outsideRecorded.every(Boolean),
          });
          const reconciledAt = new Date();
          const target = [
            attendanceEventReconciliations.organizationId,
            attendanceEventReconciliations.eventId,
          ];
          const succeeded = results.filter((result) => result.ok);
          const failed = results.filter((result) => !result.ok);
          if (succeeded.length > 0) {
            yield* query(() =>
              db
                .insert(attendanceEventReconciliations)
                .values(
                  succeeded.map((result) => ({
                    organizationId,
                    eventId: result.id,
                    truncated: result.truncated,
                    failed: false,
                    reconciledAt,
                  })),
                )
                .onConflictDoUpdate({
                  target,
                  set: {
                    truncated: sql`excluded.truncated`,
                    failed: false,
                    reconciledAt,
                  },
                }),
            );
          }
          if (failed.length > 0) {
            yield* query(() =>
              db
                .insert(attendanceEventReconciliations)
                .values(
                  failed.map((result) => ({
                    organizationId,
                    eventId: result.id,
                    truncated: false,
                    failed: true,
                    reconciledAt,
                  })),
                )
                .onConflictDoUpdate({ target, set: { failed: true } }),
            );
          }
          return {
            events: due.length,
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
          const currentName = new Map(
            communities.map((community) => [community.organizationId, community.communityName]),
          );
          const attended = new Map<string, AttendanceRecord["events"][number]>();
          const unclassified: AttendanceRecord["unclassified"] = [];
          for (const row of rows) {
            const checkedInAt = row.checkedInAt.toISOString();
            if (!row.classified || !row.eventId) {
              unclassified.push({
                organizationId: row.organizationId,
                communityName: currentName.get(row.organizationId) ?? row.communityName,
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
              communityName: currentName.get(row.organizationId) ?? row.communityName,
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
            if (byEvent.get(ORGANIZATION_SWEEP)?.failed) reasons.add("failed");
            for (const event of community.events) {
              const row = byEvent.get(event.id);
              if (!row) reasons.add("not_synced");
              if (row?.failed) reasons.add("failed");
              if (row?.truncated) reasons.add("truncated");
            }
            const synced = ownRows.map((row) => row.reconciledAt);
            return [
              {
                organizationId: community.organizationId,
                communityName: community.communityName,
                status: reasons.size === 0 ? ("synced" as const) : ("incomplete" as const),
                reasons: [...reasons].sort(),
                syncedAt:
                  synced.length > 0
                    ? new Date(Math.max(...synced.map((date) => date.getTime()))).toISOString()
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
      engagement: () =>
        Effect.gen(function* () {
          const { checkIns, reconciliations } = yield* syncedAttendance();
          const eventsByPerson = new Map<string, Map<string, number>>();
          for (const row of checkIns) {
            const people = eventsByPerson.get(row.organizationId) ?? new Map<string, number>();
            people.set(row.userId, (people.get(row.userId) ?? 0) + 1);
            eventsByPerson.set(row.organizationId, people);
          }
          const coverage = new Map<string, { syncedAt: number; partial: boolean }>();
          for (const row of reconciliations) {
            const current = coverage.get(row.organizationId) ?? { syncedAt: 0, partial: false };
            coverage.set(row.organizationId, {
              syncedAt: Math.max(current.syncedAt, row.reconciledAt.getTime()),
              partial: current.partial || row.truncated || row.failed,
            });
          }
          const organizationIds = new Set([...eventsByPerson.keys(), ...coverage.keys()]);
          return [...organizationIds].sort().map((organizationId) => {
            const events = [...(eventsByPerson.get(organizationId)?.values() ?? [])];
            const synced = coverage.get(organizationId);
            return {
              organizationId,
              people: events.length,
              returning: events.filter((count) => count >= 2).length,
              syncedAt: synced?.syncedAt ? new Date(synced.syncedAt).toISOString() : null,
              partial: synced?.partial ?? false,
            };
          });
        }),
      eventAttendance: () =>
        Effect.gen(function* () {
          const { checkIns, reconciliations } = yield* syncedAttendance();
          const firstVisit = new Map<string, number>();
          for (const row of checkIns) {
            const key = `${row.organizationId}:${row.userId}`;
            const at = row.firstCheckedInAt?.getTime() ?? Number.POSITIVE_INFINITY;
            firstVisit.set(key, Math.min(firstVisit.get(key) ?? at, at));
          }
          const byEvent = new Map<string, EventAttendance>();
          const entry = (organizationId: string, eventId: string) => {
            const key = `${organizationId}:${eventId}`;
            const current = byEvent.get(key) ?? {
              organizationId,
              eventId,
              people: 0,
              returning: 0,
              syncedAt: null,
              partial: false,
            };
            byEvent.set(key, current);
            return current;
          };
          for (const row of checkIns) {
            if (!row.eventId) continue;
            const current = entry(row.organizationId, row.eventId);
            current.people += 1;
            const at = row.firstCheckedInAt?.getTime() ?? Number.POSITIVE_INFINITY;
            if (at > (firstVisit.get(`${row.organizationId}:${row.userId}`) ?? at)) {
              current.returning += 1;
            }
          }
          for (const row of reconciliations) {
            if (row.eventId === ORGANIZATION_SWEEP) continue;
            const current = entry(row.organizationId, row.eventId);
            current.syncedAt = row.reconciledAt.toISOString();
            current.partial = row.truncated || row.failed;
          }
          return [...byEvent.values()];
        }),
      platformAttendance: ({ from, to }) =>
        Effect.gen(function* () {
          const { checkIns } = yield* syncedAttendance();
          const visits = new Map<string, { before: number; during: boolean }>();
          for (const row of checkIns) {
            const at = row.firstCheckedInAt?.getTime();
            if (at === undefined || at >= to.getTime()) continue;
            const person = visits.get(row.userId) ?? { before: 0, during: false };
            person.before += 1;
            if (at >= from.getTime()) person.during = true;
            visits.set(row.userId, person);
          }
          const people = [...visits.values()].filter(({ during }) => during);
          return {
            people: people.length,
            returning: people.filter(({ before }) => before >= 2).length,
          };
        }),
      monthlyCheckIns: (organizationId, { from, to }) =>
        Effect.gen(function* () {
          const [row] = yield* query(() =>
            db
              .select({
                count: sql<number>`count(distinct (${attendanceCheckIns.userId}, ${attendanceCheckIns.eventId}))::int`,
              })
              .from(attendanceCheckIns)
              .where(
                and(
                  eq(attendanceCheckIns.organizationId, organizationId),
                  eq(attendanceCheckIns.classified, true),
                  isNotNull(attendanceCheckIns.eventId),
                  gte(attendanceCheckIns.checkedInAt, from),
                  lt(attendanceCheckIns.checkedInAt, to),
                ),
              ),
          );
          return row?.count ?? 0;
        }),
      lastSyncedAt: (organizationId) =>
        Effect.gen(function* () {
          const [row] = yield* query(() =>
            db
              .select({
                syncedAt: max(attendanceEventReconciliations.reconciledAt),
                failing: sql<boolean>`coalesce(bool_or(${attendanceEventReconciliations.failed}), false)`,
              })
              .from(attendanceEventReconciliations)
              .where(eq(attendanceEventReconciliations.organizationId, organizationId)),
          );
          return row && !row.failing ? row.syncedAt : null;
        }),
    };

    return service;
  }),
);
