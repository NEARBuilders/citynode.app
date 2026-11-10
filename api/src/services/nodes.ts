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

export type NodeKind = string;
type ValidatorRole = (typeof validatorRoleEnum)["enumValues"][number];

export type NodeEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export interface NodeRecord {
  id: string;
  kind: NodeKind | null;
  slug: string;
  name: string;
  placeId: string | null;
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
            if (filter.parentId === null) {
              conditions.push(
                sql`${nodesTable.placeId} IN (SELECT id FROM places WHERE parent_id IS NULL)`,
              );
            } else {
              conditions.push(
                sql`${nodesTable.placeId} IN (
                  SELECT id FROM places
                  WHERE parent_id = (SELECT place_id FROM nodes WHERE id = ${filter.parentId})
                )`,
              );
            }
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
          const placeIds = nodes
            .map((node) => node.placeId)
            .filter((placeId): placeId is string => placeId !== null);
          const [childRows, validatorRows] = yield* Effect.all([
            query(() =>
              db
                .select({
                  parentPlaceId: placesTable.parentId,
                  count: sql<number>`cast(count(*) as integer)`,
                })
                .from(placesTable)
                .where(inArray(placesTable.parentId, placeIds))
                .groupBy(placesTable.parentId),
            ),
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
          const placeIdByNode = new Map(
            nodes.flatMap((node) => (node.placeId ? [[node.placeId, node.id] as const] : [])),
          );
          const childrenByNode = new Map(
            childRows.flatMap((row) => {
              const nodeId = row.parentPlaceId ? placeIdByNode.get(row.parentPlaceId) : undefined;
              return nodeId ? [[nodeId, row.count] as const] : [];
            }),
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

      listRootNodes: query(() =>
        db
          .select({ node: nodesTable })
          .from(nodesTable)
          .innerJoin(placesTable, eq(placesTable.id, nodesTable.placeId))
          .where(isNull(placesTable.parentId)),
      ).pipe(Effect.map((rows) => rows.map((row) => toNodeRecord(row.node)))),

      listChildren: (parentId) =>
        Effect.gen(function* () {
          const [parentNode] = yield* query(() =>
            db
              .select({ placeId: nodesTable.placeId })
              .from(nodesTable)
              .where(eq(nodesTable.id, parentId))
              .limit(1),
          );
          if (!parentNode?.placeId) return [];
          const parentPlaceId = parentNode.placeId;
          const rows = yield* query(() =>
            db
              .select({ node: nodesTable })
              .from(nodesTable)
              .innerJoin(placesTable, eq(placesTable.id, nodesTable.placeId))
              .where(eq(placesTable.parentId, parentPlaceId)),
          );
          return rows.map((row) => toNodeRecord(row.node));
        }),

      resolveBySlug: (slug, _parentId) =>
        Effect.gen(function* () {
          void _parentId;
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
          return row ? toNodeRecord(row.node) : null;
        }),

      subtreeWithValidators: (nodeId) =>
        Effect.gen(function* () {
          const [node] = yield* query(() =>
            db
              .select({ placeId: nodesTable.placeId })
              .from(nodesTable)
              .where(eq(nodesTable.id, nodeId))
              .limit(1),
          );
          if (!node?.placeId) return [];

          const subtreeResult = yield* query(() =>
            db.execute(sql`
              WITH RECURSIVE subtree AS (
                SELECT id, 0 AS depth, ARRAY[id] AS path
                FROM places
                WHERE id = ${node.placeId}
                UNION ALL
                SELECT p.id, subtree.depth + 1, subtree.path || p.id
                FROM places p
                INNER JOIN subtree ON p.parent_id = subtree.id
                WHERE NOT (p.id = ANY(subtree.path))
              )
              SELECT id FROM subtree ORDER BY depth
            `),
          );
          const placeRows = (subtreeResult as { rows?: unknown }).rows ?? subtreeResult;
          if (!Array.isArray(placeRows) || placeRows.length === 0) return [];
          const placeIds = (placeRows as Array<{ id: string }>).map((r) => r.id);
          const depthByPlace = new Map(
            (placeRows as Array<{ id: string; depth: number }>).map(
              (r) => [r.id, r.depth] as const,
            ),
          );

          const nodeRows = yield* query(() =>
            db.select().from(nodesTable).where(inArray(nodesTable.placeId, placeIds)),
          );
          const orderedNodes = nodeRows.sort(
            (a, b) =>
              (depthByPlace.get(a.placeId ?? "") ?? 0) - (depthByPlace.get(b.placeId ?? "") ?? 0),
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
