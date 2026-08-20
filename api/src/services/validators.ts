import { and, eq, inArray, not, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { DatabaseTag } from "../db/layer";
import {
  nodes as nodesTable,
  type validatorRole,
  validators as validatorsTable,
} from "../db/schema";
import { toOrpcError } from "../lib/errors";

export type ValidatorRole = (typeof validatorRole)["enumValues"][number];

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
  create(input: ValidatorInput): Promise<ValidatorRecord>;
  list(filter?: ValidatorListFilter): Promise<ValidatorRecord[]>;
  listByNode(nodeId: string): Promise<ValidatorRecord[]>;
  getById(id: string): Promise<ValidatorRecord | null>;
  update(id: string, input: ValidatorUpdateInput): Promise<ValidatorRecord>;
  delete(id: string): Promise<boolean>;
  setDefault(nodeId: string, validatorId: string): Promise<ValidatorRecord>;
  resolveForStaking(
    nodeId: string,
  ): Promise<{ validators: ValidatorRecord[]; sourceNodeId: string }>;
  resolveByAccountId(accountId: string): Promise<ValidatorRecord | null>;
}

export class ValidatorsTag extends Context.Tag("api/Validators")<
  ValidatorsService,
  ValidatorsService
>() {}

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

function descendantIdsQuery(nodeId: string) {
  return sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM nodes WHERE id = ${nodeId}
      UNION ALL
      SELECT n.id FROM nodes n
      INNER JOIN subtree ON n.parent_id = subtree.id
    )
    SELECT id FROM subtree
  `;
}

function ancestorIdsQuery(nodeId: string) {
  return sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, 0 AS depth
      FROM nodes
      WHERE id = ${nodeId}
      UNION ALL
      SELECT n.id, n.parent_id, ancestors.depth + 1
      FROM nodes n
      INNER JOIN ancestors ON n.id = ancestors.parent_id
    )
    SELECT id FROM ancestors
  `;
}

async function readIds(
  db: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
  query: ReturnType<typeof sql>,
): Promise<string[]> {
  const result = await db.execute(query);
  const rows = ((result as { rows?: unknown }).rows ?? result) as Array<{ id: string }>;
  return Array.isArray(rows) ? rows.map((r) => r.id) : [];
}

export const ValidatorsLive = Layer.effect(
  ValidatorsTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const service: ValidatorsService = {
      create: async (input) => {
        try {
          const node = await db
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
            await db
              .update(validatorsTable)
              .set({ isDefault: false, updatedAt: new Date() })
              .where(eq(validatorsTable.nodeId, input.nodeId));
          }

          const [row] = await db
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
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      list: async (filter) => {
        try {
          const conditions = [];
          if (filter?.nodeId !== undefined) {
            conditions.push(eq(validatorsTable.nodeId, filter.nodeId));
          }
          if (filter?.role !== undefined) {
            conditions.push(eq(validatorsTable.role, filter.role));
          }
          const rows =
            conditions.length === 0
              ? await db.select().from(validatorsTable)
              : await db
                  .select()
                  .from(validatorsTable)
                  .where(and(...conditions));
          return rows.map(toRecord);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      listByNode: async (nodeId) => {
        try {
          const rows = await db
            .select()
            .from(validatorsTable)
            .where(eq(validatorsTable.nodeId, nodeId));
          return rows.map(toRecord);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      getById: async (id) => {
        try {
          const [row] = await db
            .select()
            .from(validatorsTable)
            .where(eq(validatorsTable.id, id))
            .limit(1);
          return row ? toRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      update: async (id, input) => {
        try {
          const [existing] = await db
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
            await db
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

          const [row] = await db
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
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      delete: async (id) => {
        try {
          const rows = await db
            .delete(validatorsTable)
            .where(eq(validatorsTable.id, id))
            .returning({ deletedId: validatorsTable.id });
          return rows.length > 0;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      setDefault: async (nodeId, validatorId) => {
        try {
          return await db.transaction(async (tx) => {
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
          });
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      resolveForStaking: async (nodeId) => {
        try {
          const node = await db
            .select({ id: nodesTable.id })
            .from(nodesTable)
            .where(eq(nodesTable.id, nodeId))
            .limit(1);
          if (node.length === 0) {
            throw new ORPCError("NOT_FOUND", {
              message: "Node not found",
              data: { resource: "node", resourceId: nodeId },
            });
          }

          const descendantIds = await readIds(db, descendantIdsQuery(nodeId));
          const ownValidators = await db
            .select()
            .from(validatorsTable)
            .where(inArray(validatorsTable.nodeId, descendantIds));

          if (ownValidators.length > 0) {
            const present = new Set(descendantIds);
            const ordered = [...ownValidators].sort((a, b) => {
              if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
              const depthA = descendantIds.indexOf(a.nodeId);
              const depthB = descendantIds.indexOf(b.nodeId);
              return depthA - depthB;
            });
            const sourceNodeId =
              ordered.find((v) => v.nodeId === nodeId)?.nodeId ?? ordered[0]?.nodeId ?? nodeId;
            void present;
            return { validators: ordered.map(toRecord), sourceNodeId };
          }

          const ancestorIds = await readIds(db, ancestorIdsQuery(nodeId));
          const ancestorDepthById = new Map<string, number>();
          for (const [idx, id] of ancestorIds.entries()) {
            ancestorDepthById.set(id, idx);
          }

          const ancestorValidators = await db
            .select()
            .from(validatorsTable)
            .where(inArray(validatorsTable.nodeId, ancestorIds));

          if (ancestorValidators.length === 0) {
            return { validators: [], sourceNodeId: nodeId };
          }

          const orderedAncestors = [...ancestorValidators].sort((a, b) => {
            const depthA = ancestorDepthById.get(a.nodeId) ?? Number.MAX_SAFE_INTEGER;
            const depthB = ancestorDepthById.get(b.nodeId) ?? Number.MAX_SAFE_INTEGER;
            return depthA - depthB;
          });
          const sourceNodeId = orderedAncestors[0]?.nodeId ?? nodeId;
          return { validators: orderedAncestors.map(toRecord), sourceNodeId };
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      resolveByAccountId: async (accountId) => {
        try {
          const [row] = await db
            .select()
            .from(validatorsTable)
            .where(eq(validatorsTable.accountId, accountId))
            .limit(1);
          return row ? toRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },
    };

    return service;
  }),
);
