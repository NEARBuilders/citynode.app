import { ORPCError } from "@orpc/server";
import { type AnyColumn, and, count, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import type { InferInput } from "../contract";
import { DatabaseTag } from "../db/layer";
import { proposalAuditLog, proposalSubmissions, proposals } from "../db/schema";

type ReviewStatus = "pending" | "approved" | "rejected" | "removed";
type ResubmissionPolicy = "rejected-only" | "rejected-or-removed";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

function nextTimestamp(previous?: Date | string | null): Date {
  const previousTime = previous ? new Date(previous).getTime() : 0;
  return new Date(Math.max(Date.now(), previousTime + 1));
}

function serialize(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function actorLabel(user?: { name?: string; email?: string }, source?: string): string | null {
  return source ?? user?.name ?? null;
}

function staleProposal() {
  return new ORPCError("BAD_REQUEST", {
    message: "This proposal changed. Refresh and try again.",
    data: { reason: "STALE_PROPOSAL" },
  });
}

function resubmissionError(reviewStatus: ReviewStatus) {
  if (reviewStatus === "removed") {
    return "Removed proposals cannot be resubmitted";
  }
  if (reviewStatus === "pending") return "This proposal is already pending";
  if (reviewStatus === "approved") return "This proposal is already approved";
  return "This proposal cannot be resubmitted";
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function likeContains(column: AnyColumn, pattern: string) {
  return sql`${column} ILIKE ${pattern} ESCAPE '\\'`;
}

function queryError(cause: unknown) {
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "Failed to query proposals",
    cause,
  });
}

function toProposalRecord(row: any, submissionCount: number) {
  return {
    id: row.id,
    pluginId: row.pluginId,
    entityId: row.entityId,
    operation: row.operation as "create",
    payload: parseJson(row.payload),
    schemaVersion: row.schemaVersion,
    createdBy: row.createdBy,
    reviewStatus: row.reviewStatus as ReviewStatus,
    rejectionReason: row.rejectionReason ?? null,
    submissionCount,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

async function countSubmissions(db: any, proposalId: string) {
  const [result] = await db
    .select({ count: count() })
    .from(proposalSubmissions)
    .where(eq(proposalSubmissions.proposalId, proposalId));

  return result?.count ?? 0;
}

async function loadProposal(db: any, pluginId: string, entityId: string) {
  const [row] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.pluginId, pluginId), eq(proposals.entityId, entityId)))
    .limit(1);

  if (!row) return null;
  const submissionCount = await countSubmissions(db, row.id);
  return toProposalRecord(row, submissionCount);
}

async function appendAudit(
  db: any,
  proposalId: string,
  pluginId: string,
  entityId: string,
  action: string,
  actor: string,
  actorLabelValue?: string | null,
  details?: unknown,
) {
  await db.insert(proposalAuditLog).values({
    id: generateId("audit"),
    proposalId,
    pluginId,
    entityId,
    action,
    actor,
    actorLabel: actorLabelValue ?? null,
    details: details === undefined ? null : serialize(details),
    createdAt: new Date(),
  });
}

export class ProposalService extends Context.Service<
  ProposalService,
  {
    propose: (input: {
      pluginId: string;
      entityId: string;
      payload: unknown;
      source?: string;
      metadata?: unknown;
      idempotencyKey?: string;
      actorId: string;
      actor?: { name?: string; email?: string };
      resubmissionPolicy?: ResubmissionPolicy;
      requireSameActor?: boolean;
    }) => Effect.Effect<any, ORPCError<string, unknown>>;
    approve: (input: {
      pluginId: string;
      entityId: string;
      expectedUpdatedAt: string;
      actorId: string;
      actor?: { name?: string; email?: string };
    }) => Effect.Effect<any, ORPCError<string, unknown>>;
    reject: (input: {
      pluginId: string;
      entityId: string;
      expectedUpdatedAt: string;
      reason?: string;
      actorId: string;
      actor?: { name?: string; email?: string };
    }) => Effect.Effect<any, ORPCError<string, unknown>>;
    reopen: (input: {
      pluginId: string;
      entityId: string;
      expectedUpdatedAt: string;
      actorId: string;
      actor?: { name?: string; email?: string };
    }) => Effect.Effect<any, ORPCError<string, unknown>>;
    getProposals: (
      input: InferInput<"getProposals"> & {
        privatePluginIds?: string[];
        viewerId?: string;
        isAdmin?: boolean;
      },
    ) => Effect.Effect<any, ORPCError<string, unknown>>;
    getMyNodeApplications: (actorId: string) => Effect.Effect<any[], ORPCError<string, unknown>>;
    getProposalCount: (input: {
      pluginId: string;
      entityId: string;
    }) => Effect.Effect<any, ORPCError<string, unknown>>;
    getAuditLog: (input: {
      pluginId: string;
      entityId: string;
      limit?: number;
      cursor?: string;
    }) => Effect.Effect<any, ORPCError<string, unknown>>;
    getSubmissions: (input: {
      pluginId: string;
      entityId: string;
      limit?: number;
      cursor?: string;
    }) => Effect.Effect<any, ORPCError<string, unknown>>;
    getMySubmission: (input: {
      pluginId: string;
      entityId: string;
      submittedBy: string[];
    }) => Effect.Effect<any, ORPCError<string, unknown>>;
    getReviewHistory: (input: {
      pluginId?: string;
      limit?: number;
      cursor?: string;
    }) => Effect.Effect<any, ORPCError<string, unknown>>;
  }
>()("proposals/ProposalService") {}

export const ProposalServiceLive = Layer.effect(
  ProposalService,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    return {
      propose: Effect.fn("ProposalService.propose")(function* (input) {
        const idempotencyKey = input.idempotencyKey;

        if (idempotencyKey) {
          const [existingSubmission] = yield* Effect.promise(() =>
            db
              .select({
                proposalId: proposalSubmissions.proposalId,
                entityId: proposalSubmissions.entityId,
                submittedBy: proposalSubmissions.submittedBy,
              })
              .from(proposalSubmissions)
              .where(
                and(
                  eq(proposalSubmissions.pluginId, input.pluginId),
                  eq(proposalSubmissions.idempotencyKey, idempotencyKey),
                ),
              )
              .limit(1),
          );

          if (existingSubmission?.proposalId) {
            if (
              existingSubmission.entityId !== input.entityId ||
              existingSubmission.submittedBy !== input.actorId
            ) {
              return yield* Effect.fail(
                new ORPCError("BAD_REQUEST", {
                  message: "Idempotency key was already used for another submission",
                }),
              );
            }
            const existingProposal = yield* Effect.promise(() =>
              loadProposal(db, input.pluginId, input.entityId),
            );
            if (existingProposal) return existingProposal;
          }
        }

        const [existing] = yield* Effect.promise(() =>
          db
            .select()
            .from(proposals)
            .where(
              and(eq(proposals.pluginId, input.pluginId), eq(proposals.entityId, input.entityId)),
            )
            .limit(1),
        );

        const proposalId = existing?.id ?? generateId("prop");
        const now = nextTimestamp(existing?.updatedAt);

        if (
          existing &&
          input.requireSameActor &&
          existing.createdBy !== input.actorId &&
          existing.reviewStatus !== "rejected"
        ) {
          return yield* Effect.fail(
            new ORPCError("FORBIDDEN", {
              message: "This community application belongs to another applicant",
            }),
          );
        }

        if (
          existing &&
          input.resubmissionPolicy === "rejected-only" &&
          existing.reviewStatus !== "rejected"
        ) {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", {
              message: resubmissionError(existing.reviewStatus as ReviewStatus),
            }),
          );
        }

        if (
          existing &&
          input.resubmissionPolicy === "rejected-or-removed" &&
          existing.reviewStatus !== "rejected" &&
          existing.reviewStatus !== "removed"
        ) {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", {
              message: resubmissionError(existing.reviewStatus as ReviewStatus),
            }),
          );
        }

        const saved = yield* Effect.promise(() =>
          db.transaction(async (tx) => {
            if (!existing) {
              const inserted = await tx
                .insert(proposals)
                .values({
                  id: proposalId,
                  pluginId: input.pluginId,
                  entityId: input.entityId,
                  operation: "create",
                  payload: serialize(input.payload),
                  schemaVersion: "1",
                  createdBy: input.actorId,
                  reviewStatus: "pending",
                  rejectionReason: null,
                  createdAt: now,
                  updatedAt: now,
                })
                .onConflictDoNothing()
                .returning({ id: proposals.id });
              if (!inserted[0]) return false;
            } else {
              const updated = await tx
                .update(proposals)
                .set({
                  payload: serialize(input.payload),
                  createdBy: input.requireSameActor ? input.actorId : existing.createdBy,
                  reviewStatus: "pending",
                  rejectionReason: null,
                  updatedAt: now,
                })
                .where(
                  and(eq(proposals.id, existing.id), eq(proposals.updatedAt, existing.updatedAt)),
                )
                .returning({ id: proposals.id });
              if (!updated[0]) return false;
            }

            await tx.insert(proposalSubmissions).values({
              id: generateId("sub"),
              proposalId,
              pluginId: input.pluginId,
              entityId: input.entityId,
              submittedBy: input.actorId,
              source: input.source ?? null,
              idempotencyKey: input.idempotencyKey ?? null,
              payload: serialize(input.payload),
              metadata: input.metadata === undefined ? null : serialize(input.metadata),
              createdAt: now,
            });

            await appendAudit(
              tx,
              proposalId,
              input.pluginId,
              input.entityId,
              "proposed",
              input.actorId,
              actorLabel(input.actor, input.source),
              { source: input.source ?? null, metadata: input.metadata ?? null },
            );
            return true;
          }),
        );

        if (!saved) return yield* Effect.fail(staleProposal());

        return yield* Effect.promise(() => loadProposal(db, input.pluginId, input.entityId));
      }),

      approve: Effect.fn("ProposalService.approve")(function* (input) {
        const [existing] = yield* Effect.promise(() =>
          db
            .select()
            .from(proposals)
            .where(
              and(eq(proposals.pluginId, input.pluginId), eq(proposals.entityId, input.entityId)),
            )
            .limit(1),
        );

        if (!existing) {
          return yield* Effect.fail(new ORPCError("NOT_FOUND", { message: "Proposal not found" }));
        }

        if (toIsoString(existing.updatedAt) !== input.expectedUpdatedAt) {
          return yield* Effect.fail(staleProposal());
        }

        if (existing.reviewStatus === "removed") {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", { message: "Removed proposals cannot be approved" }),
          );
        }

        if (existing.reviewStatus !== "pending") {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", { message: "Only pending proposals can be approved" }),
          );
        }

        const now = nextTimestamp(existing.updatedAt);
        const updated = yield* Effect.promise(() =>
          db.transaction(async (tx) => {
            const rows = await tx
              .update(proposals)
              .set({
                reviewStatus: "approved",
                rejectionReason: null,
                updatedAt: now,
              })
              .where(
                and(eq(proposals.id, existing.id), eq(proposals.updatedAt, existing.updatedAt)),
              )
              .returning({ id: proposals.id });
            if (!rows[0]) return false;
            await appendAudit(
              tx,
              existing.id,
              input.pluginId,
              input.entityId,
              "approved",
              input.actorId,
              actorLabel(input.actor),
            );
            return true;
          }),
        );

        if (!updated) return yield* Effect.fail(staleProposal());

        return yield* Effect.promise(() => loadProposal(db, input.pluginId, input.entityId));
      }),

      reject: Effect.fn("ProposalService.reject")(function* (input) {
        const [existing] = yield* Effect.promise(() =>
          db
            .select()
            .from(proposals)
            .where(
              and(eq(proposals.pluginId, input.pluginId), eq(proposals.entityId, input.entityId)),
            )
            .limit(1),
        );

        if (!existing) {
          return yield* Effect.fail(new ORPCError("NOT_FOUND", { message: "Proposal not found" }));
        }

        if (toIsoString(existing.updatedAt) !== input.expectedUpdatedAt) {
          return yield* Effect.fail(staleProposal());
        }

        if (existing.reviewStatus !== "pending") {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", { message: "Only pending proposals can be rejected" }),
          );
        }

        const now = nextTimestamp(existing.updatedAt);
        const reason = input.reason?.trim() || null;
        const updated = yield* Effect.promise(() =>
          db.transaction(async (tx) => {
            const rows = await tx
              .update(proposals)
              .set({
                reviewStatus: "rejected",
                rejectionReason: reason,
                updatedAt: now,
              })
              .where(
                and(eq(proposals.id, existing.id), eq(proposals.updatedAt, existing.updatedAt)),
              )
              .returning({ id: proposals.id });
            if (!rows[0]) return false;
            await appendAudit(
              tx,
              existing.id,
              input.pluginId,
              input.entityId,
              "rejected",
              input.actorId,
              actorLabel(input.actor),
              { reason },
            );
            return true;
          }),
        );

        if (!updated) return yield* Effect.fail(staleProposal());

        return yield* Effect.promise(() => loadProposal(db, input.pluginId, input.entityId));
      }),

      reopen: Effect.fn("ProposalService.reopen")(function* (input) {
        const [existing] = yield* Effect.promise(() =>
          db
            .select()
            .from(proposals)
            .where(
              and(eq(proposals.pluginId, input.pluginId), eq(proposals.entityId, input.entityId)),
            )
            .limit(1),
        );

        if (!existing) {
          return yield* Effect.fail(new ORPCError("NOT_FOUND", { message: "Proposal not found" }));
        }

        if (toIsoString(existing.updatedAt) !== input.expectedUpdatedAt) {
          return yield* Effect.fail(staleProposal());
        }

        if (existing.reviewStatus !== "rejected") {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", {
              message: "Only rejected proposals can be reopened",
            }),
          );
        }

        const now = nextTimestamp(existing.updatedAt);
        const updated = yield* Effect.promise(() =>
          db.transaction(async (tx) => {
            const rows = await tx
              .update(proposals)
              .set({
                reviewStatus: "pending",
                rejectionReason: null,
                updatedAt: now,
              })
              .where(
                and(eq(proposals.id, existing.id), eq(proposals.updatedAt, existing.updatedAt)),
              )
              .returning({ id: proposals.id });
            if (!rows[0]) return false;
            await appendAudit(
              tx,
              existing.id,
              input.pluginId,
              input.entityId,
              "reopened",
              input.actorId,
              actorLabel(input.actor),
            );
            return true;
          }),
        );

        if (!updated) return yield* Effect.fail(staleProposal());

        return yield* Effect.promise(() => loadProposal(db, input.pluginId, input.entityId));
      }),

      getProposals: Effect.fn("ProposalService.getProposals")(function* (input) {
        const pageLimit = Math.min(input.limit ?? 50, 100);
        const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0;

        const conditions = [] as any[];
        if (input.pluginId) conditions.push(eq(proposals.pluginId, input.pluginId));
        if (input.entityId) conditions.push(eq(proposals.entityId, input.entityId));
        if (input.reviewStatus) conditions.push(eq(proposals.reviewStatus, input.reviewStatus));
        if (input.query) {
          const pattern = `%${escapeLikePattern(input.query.trim())}%`;
          conditions.push(
            or(
              likeContains(proposals.entityId, pattern),
              likeContains(proposals.createdBy, pattern),
              likeContains(proposals.payload, pattern),
            ),
          );
        }
        const privatePluginIds = input.privatePluginIds ?? [];
        if (!input.isAdmin && privatePluginIds.length > 0) {
          const publicProposal = notInArray(proposals.pluginId, privatePluginIds);
          conditions.push(
            input.viewerId
              ? or(
                  publicProposal,
                  and(
                    inArray(proposals.pluginId, privatePluginIds),
                    eq(proposals.createdBy, input.viewerId),
                  ),
                )
              : publicProposal,
          );
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const counted = yield* Effect.tryPromise({
          try: () => {
            const countQuery = db.select({ count: count() }).from(proposals);
            return whereClause ? countQuery.where(whereClause) : countQuery;
          },
          catch: queryError,
        });
        const total = counted[0]?.count ?? 0;

        const rows = yield* Effect.tryPromise({
          try: () => {
            const baseQuery = db
              .select()
              .from(proposals)
              .orderBy(desc(proposals.updatedAt))
              .limit(pageLimit)
              .offset(offset);
            return whereClause ? baseQuery.where(whereClause) : baseQuery;
          },
          catch: queryError,
        });

        const proposalIds = rows.map((row: any) => row.id);
        const submissionCounts = proposalIds.length
          ? yield* Effect.tryPromise({
              try: () =>
                db
                  .select({ proposalId: proposalSubmissions.proposalId, count: count() })
                  .from(proposalSubmissions)
                  .where(inArray(proposalSubmissions.proposalId, proposalIds))
                  .groupBy(proposalSubmissions.proposalId),
              catch: queryError,
            })
          : [];
        const countByProposal = new Map<string, number>(
          submissionCounts.map((entry: any) => [entry.proposalId, Number(entry.count)]),
        );

        const data = rows.map((row: any) =>
          toProposalRecord(row, countByProposal.get(row.id) ?? 0),
        );
        const nextOffset = offset + pageLimit;
        const hasMore = nextOffset < total;

        return {
          data,
          meta: {
            total,
            hasMore,
            nextCursor: hasMore ? String(nextOffset) : null,
          },
        };
      }),

      getMyNodeApplications: (actorId) =>
        Effect.promise(async () => {
          const rows = await db
            .select()
            .from(proposals)
            .where(and(eq(proposals.pluginId, "node"), eq(proposals.createdBy, actorId)))
            .orderBy(desc(proposals.updatedAt));
          return Promise.all(rows.map((row) => loadProposal(db, row.pluginId, row.entityId)));
        }),

      getProposalCount: Effect.fn("ProposalService.getProposalCount")(function* (input) {
        const [result] = yield* Effect.promise(() =>
          db
            .select({ count: count() })
            .from(proposalSubmissions)
            .where(
              and(
                eq(proposalSubmissions.pluginId, input.pluginId),
                eq(proposalSubmissions.entityId, input.entityId),
              ),
            ),
        );

        return {
          pluginId: input.pluginId,
          entityId: input.entityId,
          totalCount: result?.count ?? 0,
        };
      }),

      getAuditLog: Effect.fn("ProposalService.getAuditLog")(function* (input) {
        const limit = Math.min(input.limit ?? 50, 100);
        const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
        const whereClause = and(
          eq(proposalAuditLog.pluginId, input.pluginId),
          eq(proposalAuditLog.entityId, input.entityId),
        );
        const [counted, rows] = yield* Effect.promise(() =>
          Promise.all([
            db.select({ count: count() }).from(proposalAuditLog).where(whereClause),
            db
              .select()
              .from(proposalAuditLog)
              .where(whereClause)
              .orderBy(desc(proposalAuditLog.createdAt), desc(proposalAuditLog.id))
              .limit(limit)
              .offset(offset),
          ]),
        );
        const total = counted[0]?.count ?? 0;
        const nextOffset = offset + limit;
        const hasMore = nextOffset < total;

        return {
          data: rows.map((row: any) => ({
            id: row.id,
            pluginId: row.pluginId,
            entityId: row.entityId,
            action: row.action,
            actor: row.actor,
            actorLabel: row.actorLabel ?? null,
            details: parseJson(row.details),
            createdAt: toIsoString(row.createdAt)!,
          })),
          meta: {
            total,
            hasMore,
            nextCursor: hasMore ? String(nextOffset) : null,
          },
        };
      }),

      getSubmissions: Effect.fn("ProposalService.getSubmissions")(function* (input) {
        const limit = Math.min(input.limit ?? 50, 100);
        const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
        const whereClause = and(
          eq(proposalSubmissions.pluginId, input.pluginId),
          eq(proposalSubmissions.entityId, input.entityId),
        );
        const [counted, rows] = yield* Effect.promise(() =>
          Promise.all([
            db.select({ count: count() }).from(proposalSubmissions).where(whereClause),
            db
              .select()
              .from(proposalSubmissions)
              .where(whereClause)
              .orderBy(desc(proposalSubmissions.createdAt), desc(proposalSubmissions.id))
              .limit(limit)
              .offset(offset),
          ]),
        );
        const total = counted[0]?.count ?? 0;
        const nextOffset = offset + limit;
        const hasMore = nextOffset < total;

        return {
          data: rows.map((row: any) => ({
            id: row.id,
            pluginId: row.pluginId,
            entityId: row.entityId,
            submittedBy: row.submittedBy,
            source: row.source ?? null,
            payload: parseJson(row.payload),
            metadata: parseJson(row.metadata),
            createdAt: toIsoString(row.createdAt)!,
          })),
          meta: {
            total,
            hasMore,
            nextCursor: hasMore ? String(nextOffset) : null,
          },
        };
      }),

      getMySubmission: Effect.fn("ProposalService.getMySubmission")(function* (input) {
        if (input.submittedBy.length === 0) return { hasSubmitted: false };
        const [submission] = yield* Effect.promise(() =>
          db
            .select({ id: proposalSubmissions.id })
            .from(proposalSubmissions)
            .where(
              and(
                eq(proposalSubmissions.pluginId, input.pluginId),
                eq(proposalSubmissions.entityId, input.entityId),
                inArray(proposalSubmissions.submittedBy, input.submittedBy),
              ),
            )
            .limit(1),
        );
        return { hasSubmitted: Boolean(submission) };
      }),

      getReviewHistory: Effect.fn("ProposalService.getReviewHistory")(function* (input) {
        const pageLimit = Math.min(input.limit ?? 50, 100);
        const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
        const conditions = [inArray(proposalAuditLog.action, ["approved", "rejected"])];
        if (input.pluginId) conditions.push(eq(proposalAuditLog.pluginId, input.pluginId));
        const whereClause = and(...conditions);

        const [counted, rows] = yield* Effect.promise(() =>
          Promise.all([
            db.select({ count: count() }).from(proposalAuditLog).where(whereClause),
            db
              .select()
              .from(proposalAuditLog)
              .where(whereClause)
              .orderBy(desc(proposalAuditLog.createdAt))
              .limit(pageLimit)
              .offset(offset),
          ]),
        );
        const total = counted[0]?.count ?? 0;
        const entries = yield* Effect.promise(() =>
          Promise.all(
            rows.map(async (row: any) => ({
              id: row.id,
              pluginId: row.pluginId,
              entityId: row.entityId,
              action: row.action as "approved" | "rejected",
              actor: row.actor,
              actorLabel: row.actorLabel ?? null,
              details: parseJson(row.details),
              createdAt: toIsoString(row.createdAt)!,
              proposal: await loadProposal(db, row.pluginId, row.entityId),
            })),
          ),
        );
        const data = entries.filter((entry: any) => entry.proposal);
        const nextOffset = offset + pageLimit;
        const hasMore = nextOffset < total;

        return {
          data,
          meta: {
            total,
            hasMore,
            nextCursor: hasMore ? String(nextOffset) : null,
          },
        };
      }),
    };
  }),
);
