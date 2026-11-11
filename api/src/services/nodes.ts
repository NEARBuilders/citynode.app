import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { Context, DateTime, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import {
  type NodeMetadata,
  nodes as nodesTable,
  placeAliases as placeAliasesTable,
  places as placesTable,
  tenants as tenantsTable,
  type validatorRole as validatorRoleEnum,
  validators as validatorsTable,
} from "../db/schema";
import { toOrpcError } from "../lib/errors";
import { nodeParentEdgesQuery } from "./places";

export type NodeKind = string;
type ValidatorRole = (typeof validatorRoleEnum)["enumValues"][number];

export type NodeEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export interface NodeRecord {
  id: string;
  kind: NodeKind | null;
  slug: string;
  name: string;
  placeId: string | null;
  orgId: string | null;
  parentId: string | null;
  tenantId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
  spawn(input: NodeSpawnInput): NodeEffect<NodeRecord>;
  list(filter?: NodeListFilter): NodeEffect<NodeRecord[]>;
  listSummaries(filter?: NodeListFilter): NodeEffect<NodeListSummaryRecord[]>;
  getById(id: string): NodeEffect<NodeRecord | null>;
  getByPlace(placeId: string): NodeEffect<NodeRecord | null>;
  activateForPlace(input: {
    placeId: string;
    slug: string;
    name: string;
    orgId: string;
    activatedBy: string;
    joinCodeId: string;
  }): NodeEffect<{ node: NodeRecord; created: boolean }>;
  update(id: string, input: NodeUpdateInput): NodeEffect<NodeRecord>;
  setBulletin(id: string, bulletin: string | null): NodeEffect<NodeRecord>;
  delete(id: string): NodeEffect<boolean>;
  listRootNodes: NodeEffect<NodeRecord[]>;
  listChildren(parentId: string): NodeEffect<NodeRecord[]>;
  resolveBySlug(slug: string, parentId?: string | null): NodeEffect<NodeRecord | null>;
  subtreeWithValidators(nodeId: string): NodeEffect<SubtreeNode[]>;
}

export class NodesTag extends Context.Service<NodesTag, NodesService>()("api/Nodes") {}

type NodeRow = typeof nodesTable.$inferSelect;

export function nodeKindOf(metadata: unknown): string | null {
  const kind = (metadata as NodeMetadata | null | undefined)?.kind;
  return typeof kind === "string" ? kind : null;
}

function toNodeRecord(row: NodeRow): NodeRecord {
  const metadata = (row.metadata ?? {}) as NodeMetadata;
  return {
    id: row.id,
    kind: nodeKindOf(metadata),
    slug: row.slug,
    name: row.name,
    placeId: row.placeId,
    orgId: row.orgId,
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
    ...metadata,
    ...(kind !== undefined && { kind }),
  } as NodeMetadata;
}

function withMetadataKey(key: string, value: string): SQL {
  return sql`${nodesTable.metadata} || jsonb_build_object(${key}::text, ${value}::text)`;
}

function withoutMetadataKey(key: string): SQL {
  return sql`${nodesTable.metadata} - ${key}::text`;
}

function replaceMetadataKeepingKind(replacement: string): SQL {
  return sql`${replacement}::jsonb || CASE WHEN ${nodesTable.metadata} ? 'kind' THEN jsonb_build_object('kind', ${nodesTable.metadata} -> 'kind') ELSE '{}'::jsonb END`;
}

interface ParentEdge {
  id: string;
  parent_id: string | null;
}

function rowsOf<T>(result: unknown): T[] {
  const rows = (result as { rows?: unknown }).rows ?? result;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function nodeParentIs(parentId: string | null): SQL {
  return sql`${nodesTable.id} IN (
    SELECT id FROM (${nodeParentEdgesQuery()}) edges
    WHERE ${parentId === null ? sql`parent_id IS NULL` : sql`parent_id = ${parentId}`}
  )`;
}

function subtreeDepths(rootId: string, edges: ParentEdge[]): Map<string, number> {
  const childrenOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.parent_id)
      childrenOf.set(edge.parent_id, [...(childrenOf.get(edge.parent_id) ?? []), edge.id]);
  }
  const depths = new Map([[rootId, 0]]);
  const queue = [rootId];
  for (const current of queue) {
    for (const child of childrenOf.get(current) ?? []) {
      if (depths.has(child)) continue;
      depths.set(child, (depths.get(current) ?? 0) + 1);
      queue.push(child);
    }
  }
  return depths;
}

const SLUG_REGEX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const query = <T>(run: () => Promise<T>): NodeEffect<T> =>
  Effect.tryPromise({ try: run, catch: toOrpcError });

function validateSlug(slug: string): NodeEffect<void> {
  if (SLUG_REGEX.test(slug)) return Effect.void;
  return Effect.fail(
    new ORPCError("BAD_REQUEST", {
      message: "Invalid slug format",
      data: { hint: "Lowercase alphanumeric with hyphens or underscores only" },
    }),
  );
}

export const NodesLive = Layer.effect(
  NodesTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const service: NodesService = {
      spawn: (input) =>
        Effect.gen(function* () {
          yield* validateSlug(input.slug);

          if (input.tenantId) {
            const tenant = yield* query(() =>
              db
                .select({ id: tenantsTable.id })
                .from(tenantsTable)
                .where(eq(tenantsTable.id, input.tenantId!))
                .limit(1),
            );
            if (tenant.length === 0) {
              return yield* Effect.fail(
                new ORPCError("NOT_FOUND", {
                  message: "Tenant not found",
                  data: { resource: "tenant", resourceId: input.tenantId },
                }),
              );
            }
          }

          if (input.parentId !== null) {
            const parent = yield* query(() =>
              db
                .select({ id: nodesTable.id })
                .from(nodesTable)
                .where(eq(nodesTable.id, input.parentId!))
                .limit(1),
            );
            if (parent.length === 0) {
              return yield* Effect.fail(
                new ORPCError("NOT_FOUND", {
                  message: "Parent node not found",
                  data: { resource: "node", resourceId: input.parentId },
                }),
              );
            }
          }

          const [row] = yield* query(() =>
            db
              .insert(nodesTable)
              .values({
                slug: input.slug,
                name: input.name,
                parentId: input.parentId,
                tenantId: input.tenantId ?? null,
                metadata: mergeKindMetadata(input.kind, input.metadata),
              })
              .returning(),
          );

          if (!row) {
            return yield* Effect.fail(
              new ORPCError("INTERNAL_SERVER_ERROR", {
                message: "Node creation failed",
              }),
            );
          }

          return toNodeRecord(row);
        }),

      list: (filter) =>
        Effect.gen(function* () {
          const conditions: SQL[] = [];
          if (filter?.kind !== undefined) {
            conditions.push(sql`${nodesTable.metadata}->>'kind' = ${filter.kind}`);
          }
          if (filter?.tenantId !== undefined) {
            conditions.push(eq(nodesTable.tenantId, filter.tenantId));
          }
          if (filter?.parentId !== undefined) {
            conditions.push(nodeParentIs(filter.parentId));
          }
          const rows = yield* query(() =>
            conditions.length === 0
              ? db.select().from(nodesTable)
              : db
                  .select()
                  .from(nodesTable)
                  .where(and(...conditions)),
          );
          return rows.map(toNodeRecord);
        }),

      listSummaries: (filter) =>
        Effect.gen(function* () {
          const nodes = yield* service.list(filter);
          if (nodes.length === 0) return [];

          const nodeIds = nodes.map((node) => node.id);
          const [childRows, validatorRows] = yield* Effect.all([
            query(() =>
              db.execute(sql`
                SELECT parent_id, cast(count(*) as integer) AS count
                FROM (${nodeParentEdgesQuery()}) edges
                WHERE parent_id IN (${sql.join(
                  nodeIds.map((nodeId) => sql`${nodeId}`),
                  sql`, `,
                )})
                GROUP BY parent_id
              `),
            ).pipe(Effect.map((result) => rowsOf<{ parent_id: string; count: number }>(result))),
            query(() =>
              db
                .select({
                  nodeId: validatorsTable.nodeId,
                  count: sql<number>`cast(count(*) as integer)`,
                })
                .from(validatorsTable)
                .where(inArray(validatorsTable.nodeId, nodeIds))
                .groupBy(validatorsTable.nodeId),
            ),
          ]);
          const childrenByNode = new Map(
            childRows.map((row) => [row.parent_id, Number(row.count)] as const),
          );
          const validatorsByNode = new Map(
            validatorRows.map((row) => [row.nodeId, row.count] as const),
          );

          return nodes.map((node) => ({
            node,
            childrenCount: childrenByNode.get(node.id) ?? 0,
            validatorCount: validatorsByNode.get(node.id) ?? 0,
          }));
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const [row] = yield* query(() =>
            db.select().from(nodesTable).where(eq(nodesTable.id, id)).limit(1),
          );
          return row ? toNodeRecord(row) : null;
        }),

      getByPlace: (placeId) =>
        Effect.gen(function* () {
          const [row] = yield* query(() =>
            db.select().from(nodesTable).where(eq(nodesTable.placeId, placeId)).limit(1),
          );
          return row ? toNodeRecord(row) : null;
        }),

      activateForPlace: (input) =>
        query(() =>
          db.transaction(async (tx) => {
            const existing = await tx
              .select()
              .from(nodesTable)
              .where(eq(nodesTable.placeId, input.placeId))
              .limit(1);
            if (existing[0]) {
              return { node: toNodeRecord(existing[0]), created: false };
            }
            const [row] = await tx
              .insert(nodesTable)
              .values({
                slug: input.slug,
                name: input.name,
                placeId: input.placeId,
                orgId: input.orgId,
                activatedAt: new Date(),
                activatedBy: input.activatedBy,
                metadata: { joinCodeId: input.joinCodeId },
              })
              .onConflictDoNothing()
              .returning();
            if (row) return { node: toNodeRecord(row), created: true };
            const [raced] = await tx
              .select()
              .from(nodesTable)
              .where(eq(nodesTable.placeId, input.placeId))
              .limit(1);
            if (!raced) {
              throw new ORPCError("CONFLICT", { message: "Activation raced and lost" });
            }
            return { node: toNodeRecord(raced), created: false };
          }),
        ),

      update: (id, input) =>
        Effect.gen(function* () {
          yield* input.slug !== undefined ? validateSlug(input.slug) : Effect.void;
          const patch: Record<string, unknown> = { updatedAt: yield* DateTime.nowAsDate };
          if (input.slug !== undefined) patch.slug = input.slug;
          if (input.name !== undefined) patch.name = input.name;
          if (input.metadata !== undefined) {
            const kind = input.kind ?? nodeKindOf(input.metadata) ?? undefined;
            const replacement = JSON.stringify(mergeKindMetadata(kind, input.metadata));
            patch.metadata =
              kind !== undefined
                ? sql`${replacement}::jsonb`
                : replaceMetadataKeepingKind(replacement);
          } else if (input.kind !== undefined) {
            patch.metadata = withMetadataKey("kind", input.kind);
          }

          return yield* query(() =>
            db.transaction(async (tx) => {
              if (input.parentId !== undefined) {
                if (input.parentId === id) {
                  throw new ORPCError("BAD_REQUEST", {
                    message: "Node cannot be its own parent",
                  });
                }

                await tx.execute(sql`LOCK TABLE nodes, places IN SHARE ROW EXCLUSIVE MODE`);

                if (input.parentId !== null) {
                  const [parent] = await tx
                    .select({ id: nodesTable.id })
                    .from(nodesTable)
                    .where(eq(nodesTable.id, input.parentId))
                    .limit(1);
                  if (!parent) {
                    throw new ORPCError("NOT_FOUND", {
                      message: "Parent node not found",
                      data: { resource: "node", resourceId: input.parentId },
                    });
                  }

                  const edges = rowsOf<ParentEdge>(await tx.execute(nodeParentEdgesQuery()));
                  if (subtreeDepths(id, edges).has(input.parentId)) {
                    throw new ORPCError("BAD_REQUEST", {
                      message: "Node cannot be moved below one of its descendants",
                    });
                  }
                }

                const [moved] = await tx
                  .update(nodesTable)
                  .set({ ...patch, parentId: input.parentId })
                  .where(eq(nodesTable.id, id))
                  .returning();
                if (!moved) {
                  throw new ORPCError("NOT_FOUND", {
                    message: "Node not found",
                    data: { resource: "node", resourceId: id },
                  });
                }

                return toNodeRecord(moved);
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
            }),
          );
        }),

      setBulletin: (id, bulletin) =>
        Effect.gen(function* () {
          const metadata =
            bulletin === null || bulletin.trim() === ""
              ? withoutMetadataKey("bulletin")
              : withMetadataKey("bulletin", bulletin);
          const [row] = yield* query(() =>
            db
              .update(nodesTable)
              .set({ metadata, updatedAt: new Date() })
              .where(eq(nodesTable.id, id))
              .returning(),
          );
          if (!row) {
            return yield* Effect.fail(
              new ORPCError("NOT_FOUND", {
                message: "Node not found",
                data: { resource: "node", resourceId: id },
              }),
            );
          }
          return toNodeRecord(row);
        }),

      delete: (id) =>
        Effect.gen(function* () {
          const rows = yield* query(() =>
            db
              .delete(nodesTable)
              .where(eq(nodesTable.id, id))
              .returning({ deletedId: nodesTable.id }),
          );
          return rows.length > 0;
        }),

      listRootNodes: query(() => db.select().from(nodesTable).where(nodeParentIs(null))).pipe(
        Effect.map((rows) => rows.map(toNodeRecord)),
      ),

      listChildren: (parentId) =>
        Effect.gen(function* () {
          const rows = yield* query(() =>
            db.select().from(nodesTable).where(nodeParentIs(parentId)),
          );
          return rows.map(toNodeRecord);
        }),

      resolveBySlug: (slug, parentId) =>
        Effect.gen(function* () {
          const rows = yield* query(() =>
            db
              .select({ node: nodesTable })
              .from(nodesTable)
              .innerJoin(placesTable, eq(placesTable.id, nodesTable.placeId))
              .leftJoin(placeAliasesTable, eq(placeAliasesTable.placeId, placesTable.id))
              .where(sql`${placesTable.slug} = ${slug} OR ${placeAliasesTable.value} = ${slug}`)
              .limit(1),
          );
          const row = rows[0];
          if (row) return toNodeRecord(row.node);

          const conditions: SQL[] = [eq(nodesTable.slug, slug), isNull(nodesTable.placeId)];
          if (parentId === null) {
            conditions.push(isNull(nodesTable.parentId));
          } else if (parentId !== undefined) {
            conditions.push(eq(nodesTable.parentId, parentId));
          }
          const matches = yield* query(() =>
            db
              .select()
              .from(nodesTable)
              .where(and(...conditions))
              .orderBy(sql`${nodesTable.parentId} IS NOT NULL`)
              .limit(parentId === undefined ? 2 : 1),
          );
          const match = matches[0];
          if (parentId === undefined && matches.length > 1 && match?.parentId !== null) {
            return null;
          }
          return match ? toNodeRecord(match) : null;
        }),

      subtreeWithValidators: (nodeId) =>
        Effect.gen(function* () {
          const edges = yield* query(() => db.execute(nodeParentEdgesQuery())).pipe(
            Effect.map((result) => rowsOf<ParentEdge>(result)),
          );
          const depthById = subtreeDepths(nodeId, edges);
          const nodeRows = yield* query(() =>
            db
              .select()
              .from(nodesTable)
              .where(inArray(nodesTable.id, [...depthById.keys()])),
          );
          if (nodeRows.length === 0) return [];
          const orderedNodes = nodeRows.sort(
            (a, b) => (depthById.get(a.id) ?? 0) - (depthById.get(b.id) ?? 0),
          );

          const validatorRows = yield* query(() =>
            db
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
              .where(
                inArray(
                  validatorsTable.nodeId,
                  orderedNodes.map((n) => n.id),
                ),
              ),
          );

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

          return orderedNodes.map((n) => ({
            id: n.id,
            kind: nodeKindOf(n.metadata),
            slug: n.slug,
            name: n.name,
            parentId: n.parentId,
            validators: validatorsByNode.get(n.id) ?? [],
          }));
        }),
    };

    return service;
  }),
);
