import { ORPCError } from "@orpc/server";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
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
import { nodeParentEdgesQuery, readNodeParents } from "./places";

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
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface NodeUpdateInput {
  kind?: NodeKind;
  metadata?: Record<string, unknown>;
}

export interface NodeListFilter {
  kind?: NodeKind;
  parentId?: string | null;
  tenantId?: string;
  includePlatform?: boolean;
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
    orgId: string;
    activatedBy: string;
    joinCodeId: string;
    tenantId?: string | null;
    kind?: NodeKind;
  }): NodeEffect<{ node: NodeRecord; created: boolean }>;
  update(id: string, input: NodeUpdateInput): NodeEffect<NodeRecord>;
  setBulletin(id: string, bulletin: string | null): NodeEffect<NodeRecord>;
  recordOfficialDao(
    id: string,
    dao: { accountId: string; network: "mainnet" | "testnet" },
  ): NodeEffect<NodeRecord>;
  delete(id: string): NodeEffect<boolean>;
  listRootNodes: NodeEffect<NodeRecord[]>;
  listChildren(parentId: string): NodeEffect<NodeRecord[]>;
  listAncestors(nodeId: string): NodeEffect<NodeRecord[]>;
  resolveBySlug(slug: string): NodeEffect<NodeRecord | null>;
  subtreeWithValidators(nodeId: string): NodeEffect<SubtreeNode[]>;
}

export class NodesTag extends Context.Service<NodesTag, NodesService>()("api/Nodes") {}

type NodeRow = typeof nodesTable.$inferSelect;

interface NodeIdentityRow {
  node: NodeRow;
  slug: string;
  name: string;
}

export function nodeKindOf(metadata: unknown): string | null {
  const kind = (metadata as NodeMetadata | null | undefined)?.kind;
  return typeof kind === "string" ? kind : null;
}

export function hasJoinCode(metadata: unknown): boolean {
  const code = (metadata as { joinCodeId?: unknown } | null | undefined)?.joinCodeId;
  return typeof code === "string" && code.length > 0;
}

export const PLATFORM_NODE_KIND = "platform";

export const nodeSlugSql = sql<string>`coalesce(${placesTable.slug}, ${nodesTable.id}::text)`;

export const nodeNameSql = sql<string>`coalesce(${placesTable.name}, ${tenantsTable.name}, '')`;

export const listedNode: SQL = sql`coalesce(${nodesTable.metadata}->>'kind', '') <> ${PLATFORM_NODE_KIND}`;

function toNodeRecord(row: NodeIdentityRow, parentId: string | null): NodeRecord {
  const metadata = (row.node.metadata ?? {}) as NodeMetadata;
  return {
    id: row.node.id,
    kind: nodeKindOf(metadata),
    slug: row.slug,
    name: row.name,
    placeId: row.node.placeId,
    orgId: row.node.orgId,
    parentId,
    tenantId: row.node.tenantId,
    metadata: metadata as Record<string, unknown>,
    createdAt: toIso(row.node.createdAt),
    updatedAt: toIso(row.node.updatedAt),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
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

function withoutOfficialDao(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return metadata;
  const { daoAccountId: _daoAccountId, daoNetwork: _daoNetwork, ...rest } = metadata;
  return rest;
}

function keepingOfficialDao(next: SQL): SQL {
  return sql`${next} || jsonb_strip_nulls(jsonb_build_object('daoAccountId', ${nodesTable.metadata} -> 'daoAccountId', 'daoNetwork', ${nodesTable.metadata} -> 'daoNetwork'))`;
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

const query = <T>(run: () => Promise<T>): NodeEffect<T> =>
  Effect.tryPromise({ try: run, catch: toOrpcError });

const notFound = (id: string) =>
  new ORPCError("NOT_FOUND", {
    message: "Node not found",
    data: { resource: "node", resourceId: id },
  });

export const NodesLive = Layer.effect(
  NodesTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const identityColumns = { node: nodesTable, slug: nodeSlugSql, name: nodeNameSql };

    const parentsOf = (ids: string[]) => query(() => readNodeParents(db, ids));

    const readNodes = (where?: SQL): NodeEffect<NodeRecord[]> =>
      Effect.gen(function* () {
        const rows = yield* query(() =>
          db
            .select(identityColumns)
            .from(nodesTable)
            .leftJoin(placesTable, eq(placesTable.id, nodesTable.placeId))
            .leftJoin(tenantsTable, eq(tenantsTable.id, nodesTable.tenantId))
            .where(where),
        );
        const parents = yield* parentsOf(rows.map((row) => row.node.id));
        return rows.map((row) => toNodeRecord(row, parents.get(row.node.id) ?? null));
      });

    const readNode = (id: string): NodeEffect<NodeRecord | null> =>
      readNodes(eq(nodesTable.id, id)).pipe(Effect.map((rows) => rows[0] ?? null));

    const readUpdated = (rows: NodeRow[], id: string): NodeEffect<NodeRecord> =>
      Effect.gen(function* () {
        if (!rows[0]) return yield* Effect.fail(notFound(id));
        const node = yield* readNode(rows[0].id);
        if (!node) return yield* Effect.fail(notFound(id));
        return node;
      });

    const service: NodesService = {
      spawn: Effect.fn("NodesService.spawn")(function* (input) {
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

        const [row] = yield* query(() =>
          db
            .insert(nodesTable)
            .values({
              tenantId: input.tenantId ?? null,
              metadata: mergeKindMetadata(input.kind, withoutOfficialDao(input.metadata)),
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

        return yield* readUpdated([row], row.id);
      }),

      list: Effect.fn("NodesService.list")(function* (filter) {
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
        if (!filter?.includePlatform) {
          conditions.push(listedNode);
        }
        return yield* readNodes(and(...conditions));
      }),

      listSummaries: Effect.fn("NodesService.listSummaries")(function* (filter) {
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

      getById: Effect.fn("NodesService.getById")(function* (id) {
        return yield* readNode(id);
      }),

      getByPlace: Effect.fn("NodesService.getByPlace")(function* (placeId) {
        return (yield* readNodes(eq(nodesTable.placeId, placeId)))[0] ?? null;
      }),

      activateForPlace: Effect.fn("NodesService.activateForPlace")(function* (input) {
        const outcome = yield* query(() =>
          db.transaction(async (tx) => {
            const [existing] = await tx
              .select({ id: nodesTable.id })
              .from(nodesTable)
              .where(eq(nodesTable.placeId, input.placeId))
              .limit(1);
            if (existing) return { id: existing.id, created: false };
            const [row] = await tx
              .insert(nodesTable)
              .values({
                placeId: input.placeId,
                orgId: input.orgId,
                tenantId: input.tenantId ?? null,
                activatedAt: new Date(),
                activatedBy: input.activatedBy,
                metadata: mergeKindMetadata(input.kind, { joinCodeId: input.joinCodeId }),
              })
              .onConflictDoNothing()
              .returning({ id: nodesTable.id });
            if (row) return { id: row.id, created: true };
            const [raced] = await tx
              .select({ id: nodesTable.id })
              .from(nodesTable)
              .where(eq(nodesTable.placeId, input.placeId))
              .limit(1);
            if (!raced) {
              throw new ORPCError("CONFLICT", { message: "Activation raced and lost" });
            }
            return { id: raced.id, created: false };
          }),
        );
        const node = yield* readNode(outcome.id);
        if (!node) return yield* Effect.fail(notFound(outcome.id));
        return { node, created: outcome.created };
      }),

      update: Effect.fn("NodesService.update")(function* (id, input) {
        const patch: Record<string, unknown> = { updatedAt: yield* DateTime.nowAsDate };
        if (input.metadata !== undefined) {
          const kind = input.kind ?? nodeKindOf(input.metadata) ?? undefined;
          const replacement = JSON.stringify(
            mergeKindMetadata(kind, withoutOfficialDao(input.metadata)),
          );
          patch.metadata = keepingOfficialDao(
            kind !== undefined
              ? sql`${replacement}::jsonb`
              : replaceMetadataKeepingKind(replacement),
          );
        } else if (input.kind !== undefined) {
          patch.metadata = withMetadataKey("kind", input.kind);
        }

        const rows = yield* query(() =>
          db.update(nodesTable).set(patch).where(eq(nodesTable.id, id)).returning(),
        );
        return yield* readUpdated(rows, id);
      }),

      setBulletin: Effect.fn("NodesService.setBulletin")(function* (id, bulletin) {
        const metadata =
          bulletin === null || bulletin.trim() === ""
            ? withoutMetadataKey("bulletin")
            : withMetadataKey("bulletin", bulletin);
        const rows = yield* query(() =>
          db
            .update(nodesTable)
            .set({ metadata, updatedAt: new Date() })
            .where(eq(nodesTable.id, id))
            .returning(),
        );
        return yield* readUpdated(rows, id);
      }),

      recordOfficialDao: Effect.fn("NodesService.recordOfficialDao")(function* (id, dao) {
        const metadata = sql`${nodesTable.metadata} || jsonb_build_object('daoAccountId', ${dao.accountId}::text, 'daoNetwork', ${dao.network}::text)`;
        const rows = yield* query(() =>
          db
            .update(nodesTable)
            .set({ metadata, updatedAt: new Date() })
            .where(eq(nodesTable.id, id))
            .returning(),
        );
        return yield* readUpdated(rows, id);
      }),

      delete: Effect.fn("NodesService.delete")(function* (id) {
        const rows = yield* query(() =>
          db
            .delete(nodesTable)
            .where(eq(nodesTable.id, id))
            .returning({ deletedId: nodesTable.id }),
        );
        return rows.length > 0;
      }),

      listRootNodes: readNodes(and(nodeParentIs(null), listedNode)),

      listChildren: Effect.fn("NodesService.listChildren")(function* (parentId) {
        return yield* readNodes(nodeParentIs(parentId));
      }),

      listAncestors: Effect.fn("NodesService.listAncestors")(function* (nodeId) {
        const edges = yield* query(() => db.execute(nodeParentEdgesQuery())).pipe(
          Effect.map((result) => rowsOf<ParentEdge>(result)),
        );
        const parentById = new Map(edges.map((edge) => [edge.id, edge.parent_id]));
        const ids: string[] = [];
        const seen = new Set([nodeId]);
        let parentId = parentById.get(nodeId) ?? null;
        while (parentId && !seen.has(parentId)) {
          seen.add(parentId);
          ids.push(parentId);
          parentId = parentById.get(parentId) ?? null;
        }
        if (ids.length === 0) return [];
        const rows = yield* readNodes(inArray(nodesTable.id, ids));
        return rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      }),

      resolveBySlug: Effect.fn("NodesService.resolveBySlug")(function* (slug) {
        const [match] = yield* query(() =>
          db
            .selectDistinct({ id: nodesTable.id })
            .from(nodesTable)
            .innerJoin(placesTable, eq(placesTable.id, nodesTable.placeId))
            .leftJoin(placeAliasesTable, eq(placeAliasesTable.placeId, placesTable.id))
            .where(sql`${placesTable.slug} = ${slug} OR ${placeAliasesTable.value} = ${slug}`)
            .limit(1),
        );
        return match ? yield* readNode(match.id) : null;
      }),

      subtreeWithValidators: Effect.fn("NodesService.subtreeWithValidators")(function* (nodeId) {
        const edges = yield* query(() => db.execute(nodeParentEdgesQuery())).pipe(
          Effect.map((result) => rowsOf<ParentEdge>(result)),
        );
        const depthById = subtreeDepths(nodeId, edges);
        const nodeRows = yield* readNodes(inArray(nodesTable.id, [...depthById.keys()]));
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
          kind: n.kind,
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
