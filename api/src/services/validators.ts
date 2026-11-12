import { ORPCError } from "@orpc/server";
import { and, eq, inArray, not, type SQL } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import {
  nodes as nodesTable,
  type validatorRole,
  validators as validatorsTable,
} from "../db/schema";
import { toOrpcError } from "../lib/errors";

export type ValidatorRole = (typeof validatorRole)["enumValues"][number];

export type ValidatorEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export interface ValidatorRecord {
  id: string;
  nodeId: string;
  accountId: string;
  network: string;
  protocol: string;
  role: ValidatorRole;
  isDefault: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ValidatorInput {
  nodeId: string;
  accountId: string;
  network?: string;
  protocol?: string;
  role?: ValidatorRole;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ValidatorUpdateInput {
  accountId?: string;
  network?: string;
  protocol?: string;
  role?: ValidatorRole;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ValidatorListFilter {
  nodeId?: string;
  role?: ValidatorRole;
}

export interface ValidatorsService {
  create(input: ValidatorInput): ValidatorEffect<ValidatorRecord>;
  list(filter?: ValidatorListFilter): ValidatorEffect<ValidatorRecord[]>;
  listByNode(nodeId: string): ValidatorEffect<ValidatorRecord[]>;
  getById(id: string): ValidatorEffect<ValidatorRecord | null>;
  update(id: string, input: ValidatorUpdateInput): ValidatorEffect<ValidatorRecord>;
  delete(id: string): ValidatorEffect<boolean>;
  setDefault(nodeId: string, validatorId: string): ValidatorEffect<ValidatorRecord>;
  resolveByAccountId(accountId: string): ValidatorEffect<ValidatorRecord | null>;
  nodeIdsWithValidators(nodeIds: string[]): ValidatorEffect<Set<string>>;
}

export class ValidatorsTag extends Context.Service<ValidatorsTag, ValidatorsService>()(
  "api/Validators",
) {}

type ValidatorRow = typeof validatorsTable.$inferSelect;

function toRecord(row: ValidatorRow): ValidatorRecord {
  return {
    id: row.id,
    nodeId: row.nodeId,
    accountId: row.accountId,
    network: row.network,
    protocol: row.protocol,
    role: row.role,
    isDefault: row.isDefault,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export const ValidatorsLive = Layer.effect(
  ValidatorsTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const query = <T>(run: () => Promise<T>): ValidatorEffect<T> =>
      Effect.tryPromise({ try: run, catch: toOrpcError });

    const service: ValidatorsService = {
      create: (input) =>
        query(() =>
          db.transaction(async (tx) => {
            const node = await tx
              .select({ id: nodesTable.id })
              .from(nodesTable)
              .where(eq(nodesTable.id, input.nodeId))
              .limit(1);
            if (node.length === 0) {
              throw new ORPCError("NOT_FOUND", {
                message: "Node not found",
                data: { resource: "node", resourceId: input.nodeId },
              });
            }

            if (input.isDefault === true) {
              await tx
                .update(validatorsTable)
                .set({ isDefault: false, updatedAt: new Date() })
                .where(eq(validatorsTable.nodeId, input.nodeId));
            }

            const [row] = await tx
              .insert(validatorsTable)
              .values({
                nodeId: input.nodeId,
                accountId: input.accountId,
                network: input.network ?? "mainnet",
                protocol: input.protocol ?? "near",
                role: input.role ?? "official",
                isDefault: input.isDefault ?? false,
                metadata: input.metadata ?? {},
              })
              .returning();

            if (!row) {
              throw new ORPCError("INTERNAL_SERVER_ERROR", {
                message: "Validator creation failed",
              });
            }
            return toRecord(row);
          }),
        ),

      list: (filter) =>
        Effect.gen(function* () {
          const conditions: SQL[] = [];
          if (filter?.nodeId !== undefined) {
            conditions.push(eq(validatorsTable.nodeId, filter.nodeId));
          }
          if (filter?.role !== undefined) {
            conditions.push(eq(validatorsTable.role, filter.role));
          }
          const rows = yield* query(() =>
            conditions.length === 0
              ? db.select().from(validatorsTable)
              : db
                  .select()
                  .from(validatorsTable)
                  .where(and(...conditions)),
          );
          return rows.map(toRecord);
        }),

      listByNode: (nodeId) =>
        Effect.gen(function* () {
          const rows = yield* query(() =>
            db.select().from(validatorsTable).where(eq(validatorsTable.nodeId, nodeId)),
          );
          return rows.map(toRecord);
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const [row] = yield* query(() =>
            db.select().from(validatorsTable).where(eq(validatorsTable.id, id)).limit(1),
          );
          return row ? toRecord(row) : null;
        }),

      update: (id, input) =>
        query(() =>
          db.transaction(async (tx) => {
            const [existing] = await tx
              .select({ nodeId: validatorsTable.nodeId })
              .from(validatorsTable)
              .where(eq(validatorsTable.id, id))
              .limit(1);
            if (!existing) {
              throw new ORPCError("NOT_FOUND", {
                message: "Validator not found",
                data: { resource: "validator", resourceId: id },
              });
            }

            if (input.isDefault === true) {
              await tx
                .update(validatorsTable)
                .set({ isDefault: false, updatedAt: new Date() })
                .where(
                  and(eq(validatorsTable.nodeId, existing.nodeId), not(eq(validatorsTable.id, id))),
                );
            }

            const patch: Record<string, unknown> = { updatedAt: new Date() };
            if (input.accountId !== undefined) patch.accountId = input.accountId;
            if (input.network !== undefined) patch.network = input.network;
            if (input.protocol !== undefined) patch.protocol = input.protocol;
            if (input.role !== undefined) patch.role = input.role;
            if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
            if (input.metadata !== undefined) patch.metadata = input.metadata;

            const [row] = await tx
              .update(validatorsTable)
              .set(patch)
              .where(eq(validatorsTable.id, id))
              .returning();

            if (!row) {
              throw new ORPCError("NOT_FOUND", {
                message: "Validator not found",
                data: { resource: "validator", resourceId: id },
              });
            }
            return toRecord(row);
          }),
        ),

      delete: (id) =>
        Effect.gen(function* () {
          const rows = yield* query(() =>
            db
              .delete(validatorsTable)
              .where(eq(validatorsTable.id, id))
              .returning({ deletedId: validatorsTable.id }),
          );
          return rows.length > 0;
        }),

      setDefault: (nodeId, validatorId) =>
        query(() =>
          db.transaction(async (tx) => {
            const [target] = await tx
              .select()
              .from(validatorsTable)
              .where(and(eq(validatorsTable.id, validatorId), eq(validatorsTable.nodeId, nodeId)))
              .limit(1);
            if (!target) {
              throw new ORPCError("NOT_FOUND", {
                message: "Validator not found for node",
                data: { resource: "validator", resourceId: validatorId, nodeId },
              });
            }

            await tx
              .update(validatorsTable)
              .set({ isDefault: false, updatedAt: new Date() })
              .where(
                and(eq(validatorsTable.nodeId, nodeId), not(eq(validatorsTable.id, validatorId))),
              );

            const [updated] = await tx
              .update(validatorsTable)
              .set({ isDefault: true, updatedAt: new Date() })
              .where(eq(validatorsTable.id, validatorId))
              .returning();

            if (!updated) {
              throw new ORPCError("INTERNAL_SERVER_ERROR", {
                message: "Failed to set default validator",
              });
            }
            return toRecord(updated);
          }),
        ),

      resolveByAccountId: (accountId) =>
        Effect.gen(function* () {
          const [row] = yield* query(() =>
            db
              .select()
              .from(validatorsTable)
              .where(eq(validatorsTable.accountId, accountId))
              .limit(1),
          );
          return row ? toRecord(row) : null;
        }),

      nodeIdsWithValidators: (nodeIds) =>
        nodeIds.length === 0
          ? Effect.succeed(new Set<string>())
          : query(() =>
              db
                .selectDistinct({ nodeId: validatorsTable.nodeId })
                .from(validatorsTable)
                .where(inArray(validatorsTable.nodeId, nodeIds)),
            ).pipe(Effect.map((rows) => new Set(rows.map((row) => row.nodeId)))),
    };

    return service;
  }),
);
