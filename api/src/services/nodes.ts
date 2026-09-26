import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import {
  type NodeMetadata,
  nodes as nodesTable,
  tenants as tenantsTable,
  type validatorRole as validatorRoleEnum,
  validators as validatorsTable,
} from "../db/schema";
import { toOrpcError } from "../lib/errors";

export type NodeKind = string;
type ValidatorRole = (typeof validatorRoleEnum)["enumValues"][number];

export interface NodeRecord {
  id: string;
  kind: NodeKind | null;
  slug: string;
  name: string;
  parentId: string | null;
  tenantId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface NodeInput {
  kind?: NodeKind;
  slug: string;
  name: string;
  parentId: string | null;
  tenantId: string | null;
  metadata?: Record<string, unknown>;
}

export interface NodeSpawnInput {
  kind?: NodeKind;
  slug: string;
  name: string;
  parentId: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface NodeUpdateInput {
  kind?: NodeKind;
  slug?: string;
  name?: string;
  parentId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface NodeListFilter {
  kind?: NodeKind;
  parentId?: string | null;
  tenantId?: string;
}

export interface NodeListSummaryRecord {
  node: NodeRecord;
  childrenCount: number;
  validatorCount: number;
}

export interface SubtreeValidator {
  id: string;
  accountId: string;
  network: string;
  protocol: string;
  role: ValidatorRole;
  isDefault: boolean;
}

export interface SubtreeNode {
  id: string;
  kind: NodeKind | null;
  slug: string;
  name: string;
  parentId: string | null;
  validators: SubtreeValidator[];
}

export interface NodesService {
  spawn(input: NodeSpawnInput): Promise<NodeRecord>;
  create(input: NodeInput): Promise<NodeRecord>;
  list(filter?: NodeListFilter): Promise<NodeRecord[]>;
  listSummaries(filter?: NodeListFilter): Promise<NodeListSummaryRecord[]>;
  getById(id: string): Promise<NodeRecord | null>;
  update(id: string, input: NodeUpdateInput): Promise<NodeRecord>;
  delete(id: string): Promise<boolean>;
  listRootNodes(): Promise<NodeRecord[]>;
  listChildren(parentId: string): Promise<NodeRecord[]>;
  resolveBySlug(slug: string, parentId?: string | null): Promise<NodeRecord | null>;
  subtreeWithValidators(nodeId: string): Promise<SubtreeNode[]>;
}

export class NodesTag extends Context.Service<NodesTag, NodesService>()("api/Nodes") {}

type NodeRow = typeof nodesTable.$inferSelect;

function toNodeRecord(row: NodeRow): NodeRecord {
  const metadata = (row.metadata ?? {}) as NodeMetadata;
  return {
    id: row.id,
    kind: typeof metadata.kind === "string" ? metadata.kind : null,
    slug: row.slug,
    name: row.name,
    parentId: row.parentId,
    tenantId: row.tenantId,
    metadata: metadata as Record<string, unknown>,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function mergeKindMetadata(
  kind: NodeKind | undefined,
  metadata: Record<string, unknown> | undefined,
): NodeMetadata {
  return {
    ...(kind !== undefined && { kind }),
    ...(metadata ?? {}),
  } as NodeMetadata;
}

const SLUG_REGEX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function validateSlug(slug: string): void {
  if (!SLUG_REGEX.test(slug)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Invalid slug format",
      data: { hint: "Lowercase alphanumeric with hyphens or underscores only" },
    });
  }
}

export const NodesLive = Layer.effect(
  NodesTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const service: NodesService = {
      spawn: async (input) => {
        try {
          validateSlug(input.slug);

          if (input.tenantId) {
            const tenant = await db
              .select({ id: tenantsTable.id })
              .from(tenantsTable)
              .where(eq(tenantsTable.id, input.tenantId))
              .limit(1);
            if (tenant.length === 0) {
              throw new ORPCError("NOT_FOUND", {
                message: "Tenant not found",
                data: { resource: "tenant", resourceId: input.tenantId },
              });
            }
          }

          if (input.parentId !== null) {
            const parent = await db
              .select({ id: nodesTable.id })
              .from(nodesTable)
              .where(eq(nodesTable.id, input.parentId))
              .limit(1);
            if (parent.length === 0) {
              throw new ORPCError("NOT_FOUND", {
                message: "Parent node not found",
                data: { resource: "node", resourceId: input.parentId },
              });
            }
          }

          const [row] = await db
            .insert(nodesTable)
            .values({
              slug: input.slug,
              name: input.name,
              parentId: input.parentId,
              tenantId: input.tenantId ?? null,
              metadata: mergeKindMetadata(input.kind, input.metadata),
            })
            .returning();

          if (!row) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: "Node creation failed",
            });
          }

          return toNodeRecord(row);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      create: async (input) => {
        return service.spawn({
          ...(input.kind !== undefined && { kind: input.kind }),
          slug: input.slug,
          name: input.name,
          parentId: input.parentId,
          tenantId: input.tenantId,
          ...(input.metadata !== undefined && { metadata: input.metadata }),
        });
      },

      list: async (filter) => {
        try {
          const conditions = [];
          if (filter?.kind !== undefined) {
            conditions.push(sql`${nodesTable.metadata}->>'kind' = ${filter.kind}`);
          }
          if (filter?.tenantId !== undefined) {
            conditions.push(eq(nodesTable.tenantId, filter.tenantId));
          }
          if (filter?.parentId !== undefined) {
            if (filter.parentId === null) {
              conditions.push(isNull(nodesTable.parentId));
            } else {
              conditions.push(eq(nodesTable.parentId, filter.parentId));
            }
          }
          const rows =
            conditions.length === 0
              ? await db.select().from(nodesTable)
              : await db
                  .select()
                  .from(nodesTable)
                  .where(and(...conditions));
          return rows.map(toNodeRecord);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      listSummaries: async (filter) => {
        try {
          const nodes = await service.list(filter);
          if (nodes.length === 0) return [];

          const nodeIds = nodes.map((node) => node.id);
          const [childRows, validatorRows] = await Promise.all([
            db
              .select({
                nodeId: nodesTable.parentId,
                count: sql<number>`cast(count(*) as integer)`,
              })
              .from(nodesTable)
              .where(inArray(nodesTable.parentId, nodeIds))
              .groupBy(nodesTable.parentId),
            db
              .select({
                nodeId: validatorsTable.nodeId,
                count: sql<number>`cast(count(*) as integer)`,
              })
              .from(validatorsTable)
              .where(inArray(validatorsTable.nodeId, nodeIds))
              .groupBy(validatorsTable.nodeId),
          ]);
          const childrenByNode = new Map(
            childRows.flatMap((row) => (row.nodeId ? [[row.nodeId, row.count] as const] : [])),
          );
          const validatorsByNode = new Map(
            validatorRows.map((row) => [row.nodeId, row.count] as const),
          );

          return nodes.map((node) => ({
            node,
            childrenCount: childrenByNode.get(node.id) ?? 0,
            validatorCount: validatorsByNode.get(node.id) ?? 0,
          }));
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      getById: async (id) => {
        try {
          const [row] = await db.select().from(nodesTable).where(eq(nodesTable.id, id)).limit(1);
          return row ? toNodeRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      update: async (id, input) => {
        try {
          if (input.slug !== undefined) validateSlug(input.slug);
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          if (input.kind !== undefined || input.metadata !== undefined) {
            const [current] = await db
              .select({ metadata: nodesTable.metadata })
              .from(nodesTable)
              .where(eq(nodesTable.id, id))
              .limit(1);
            const existing = (current?.metadata ?? {}) as NodeMetadata;
            const kind =
              input.kind ?? (typeof existing.kind === "string" ? existing.kind : undefined);
            patch.metadata = mergeKindMetadata(kind, input.metadata);
          }
          if (input.slug !== undefined) patch.slug = input.slug;
          if (input.name !== undefined) patch.name = input.name;
          if (input.parentId !== undefined) patch.parentId = input.parentId;

          return await db.transaction(async (tx) => {
            if (input.parentId !== undefined && input.parentId !== null) {
              await tx.execute(sql`LOCK TABLE nodes IN SHARE ROW EXCLUSIVE MODE`);

              if (input.parentId === id) {
                throw new ORPCError("BAD_REQUEST", {
                  message: "Node cannot be its own parent",
                });
              }

              const parent = await tx
                .select({ id: nodesTable.id })
                .from(nodesTable)
                .where(eq(nodesTable.id, input.parentId))
                .limit(1);
              if (parent.length === 0) {
                throw new ORPCError("NOT_FOUND", {
                  message: "Parent node not found",
                  data: { resource: "node", resourceId: input.parentId },
                });
              }

              const descendantsResult = await tx.execute(sql`
                WITH RECURSIVE descendants AS (
                  SELECT id, ARRAY[id] AS path
                  FROM nodes
                  WHERE id = ${id}
                  UNION ALL
                  SELECT n.id, descendants.path || n.id
                  FROM nodes n
                  INNER JOIN descendants ON n.parent_id = descendants.id
                  WHERE NOT (n.id = ANY(descendants.path))
                )
                SELECT id
                FROM descendants
                WHERE id = ${input.parentId}
                LIMIT 1
              `);
              const descendants =
                (descendantsResult as { rows?: unknown }).rows ?? descendantsResult;
              if (Array.isArray(descendants) && descendants.length > 0) {
                throw new ORPCError("BAD_REQUEST", {
                  message: "Node cannot be moved below one of its descendants",
                });
              }
            }

            const [row] = await tx
              .update(nodesTable)
              .set(patch)
              .where(eq(nodesTable.id, id))
              .returning();

            if (!row) {
              throw new ORPCError("NOT_FOUND", {
                message: "Node not found",
                data: { resource: "node", resourceId: id },
              });
            }

            return toNodeRecord(row);
          });
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      delete: async (id) => {
        try {
          const rows = await db
            .delete(nodesTable)
            .where(eq(nodesTable.id, id))
            .returning({ deletedId: nodesTable.id });
          return rows.length > 0;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      listRootNodes: async () => {
        try {
          const rows = await db.select().from(nodesTable).where(isNull(nodesTable.parentId));
          return rows.map(toNodeRecord);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      listChildren: async (parentId) => {
        try {
          const rows = await db.select().from(nodesTable).where(eq(nodesTable.parentId, parentId));
          return rows.map(toNodeRecord);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      resolveBySlug: async (slug, parentId) => {
        try {
          const conditions = [eq(nodesTable.slug, slug)];
          if (parentId === null) {
            conditions.push(isNull(nodesTable.parentId));
          } else if (parentId !== undefined) {
            conditions.push(eq(nodesTable.parentId, parentId));
          }
          const matches = await db
            .select()
            .from(nodesTable)
            .where(and(...conditions))
            .orderBy(sql`${nodesTable.parentId} IS NOT NULL`)
            .limit(parentId === undefined ? 2 : 1);
          const row = matches[0];
          if (parentId === undefined && matches.length > 1 && row?.parentId !== null) {
            return null;
          }
          return row ? toNodeRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      subtreeWithValidators: async (nodeId) => {
        try {
          const subtreeResult = await db.execute(sql`
            WITH RECURSIVE subtree AS (
              SELECT id, metadata->>'kind' AS kind, slug, name, parent_id, 0 AS depth, ARRAY[id] AS path
              FROM nodes
              WHERE id = ${nodeId}
              UNION ALL
              SELECT n.id, n.metadata->>'kind', n.slug, n.name, n.parent_id, subtree.depth + 1,
                subtree.path || n.id
              FROM nodes n
              INNER JOIN subtree ON n.parent_id = subtree.id
              WHERE NOT (n.id = ANY(subtree.path))
            )
            SELECT id, kind, slug, name, parent_id FROM subtree
            ORDER BY depth
          `);

          const rows = (subtreeResult as { rows?: unknown }).rows ?? subtreeResult;
          if (!Array.isArray(rows) || rows.length === 0) return [];

          const ids = (rows as Array<{ id: string }>).map((r) => r.id);

          const validatorRows = await db
            .select({
              id: validatorsTable.id,
              nodeId: validatorsTable.nodeId,
              accountId: validatorsTable.accountId,
              network: validatorsTable.network,
              protocol: validatorsTable.protocol,
              role: validatorsTable.role,
              isDefault: validatorsTable.isDefault,
            })
            .from(validatorsTable)
            .where(inArray(validatorsTable.nodeId, ids));

          const validatorsByNode = new Map<string, SubtreeValidator[]>();
          for (const v of validatorRows) {
            const arr = validatorsByNode.get(v.nodeId) ?? [];
            arr.push({
              id: v.id,
              accountId: v.accountId,
              network: v.network,
              protocol: v.protocol,
              role: v.role,
              isDefault: v.isDefault,
            });
            validatorsByNode.set(v.nodeId, arr);
          }

          return (
            rows as Array<{
              id: string;
              kind: string | null;
              slug: string;
              name: string;
              parent_id: string | null;
            }>
          ).map((r) => ({
            id: r.id,
            kind: r.kind,
            slug: r.slug,
            name: r.name,
            parentId: r.parent_id,
            validators: validatorsByNode.get(r.id) ?? [],
          }));
        } catch (error) {
          throw toOrpcError(error);
        }
      },
    };

    return service;
  }),
);
