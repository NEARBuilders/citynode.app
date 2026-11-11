import type { ORPCError } from "@orpc/server";
import { eq, isNull, type SQL, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import {
  memberCountObservations,
  nodes as nodesTable,
  type PlaceBoundary,
  placeAliases as placeAliasesTable,
  places as placesTable,
} from "../db/schema";
import { toOrpcError } from "../lib/errors";

export type PlaceEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export interface PlaceRecord {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceCommunity {
  nodeId: string;
  activatedAt: string | null;
  memberCount: number | null;
}

export interface PlaceResolution {
  place: PlaceRecord;
  aliases: string[];
  community: PlaceCommunity | null;
}

export interface PlacesService {
  resolve(input: { place: string }): PlaceEffect<PlaceResolution | null>;
  getById(id: string): PlaceEffect<PlaceRecord | null>;
  boundary(id: string): PlaceEffect<PlaceBoundary | null>;
  roots(): PlaceEffect<PlaceRecord[]>;
  children(id: string): PlaceEffect<PlaceRecord[]>;
  ancestorIds(id: string): PlaceEffect<string[]>;
  subtreeIds(id: string): PlaceEffect<string[]>;
}

export class PlacesTag extends Context.Service<PlacesTag, PlacesService>()("api/Places") {}

type PlaceRow = typeof placesTable.$inferSelect;

function toPlaceRecord(row: PlaceRow): PlaceRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parentId,
    latitude: row.latitude,
    longitude: row.longitude,
    label: row.label,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function toTimestampIso(value: Date | string | null): string | null {
  if (value instanceof Date) return value.toISOString();
  return value ? String(value) : null;
}

function aliasCandidates(input: string): string[] {
  const raw = input.trim();
  const lowered = raw.toLowerCase();
  const candidates = new Set([raw, lowered, raw.toUpperCase()]);
  const prefixMatch = lowered.match(/^(?:geonames|iso|legacy):(.+)$/);
  if (prefixMatch) {
    const suffix = prefixMatch[1];
    if (suffix) {
      candidates.add(suffix);
      candidates.add(suffix.toUpperCase());
    }
  }
  return [...candidates].filter((value) => value.length > 0);
}

const query = <T>(run: () => Promise<T>): PlaceEffect<T> =>
  Effect.tryPromise({ try: run, catch: toOrpcError });

function ancestorChainQuery(placeId: string): SQL {
  return sql`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 0 AS depth, ARRAY[id] AS path
      FROM places
      WHERE id = ${placeId}
      UNION ALL
      SELECT p.id, p.parent_id, chain.depth + 1, chain.path || p.id
      FROM places p
      INNER JOIN chain ON p.id = chain.parent_id
      WHERE NOT (p.id = ANY(chain.path))
    )
    SELECT id FROM chain ORDER BY depth
  `;
}

function subtreeQuery(placeId: string): SQL {
  return sql`
    WITH RECURSIVE subtree AS (
      SELECT id, 0 AS depth, ARRAY[id] AS path
      FROM places
      WHERE id = ${placeId}
      UNION ALL
      SELECT p.id, subtree.depth + 1, subtree.path || p.id
      FROM places p
      INNER JOIN subtree ON p.parent_id = subtree.id
      WHERE NOT (p.id = ANY(subtree.path))
    )
    SELECT id FROM subtree ORDER BY depth
  `;
}

async function readIds(db: { execute: (q: SQL) => Promise<unknown> }, q: SQL): Promise<string[]> {
  const result = await db.execute(q);
  const rows = ((result as { rows?: unknown }).rows ?? result) as Array<{ id: string }>;
  return Array.isArray(rows) ? rows.map((r) => r.id) : [];
}

export const PlacesLive = Layer.effect(
  PlacesTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const service: PlacesService = {
      resolve: (input) =>
        Effect.gen(function* () {
          const candidates = aliasCandidates(input.place);
          const slugCandidate = input.place.trim().toLowerCase();

          const matched = yield* query(() =>
            db
              .select({
                id: placesTable.id,
                slug: placesTable.slug,
                name: placesTable.name,
                parentId: placesTable.parentId,
                latitude: placesTable.latitude,
                longitude: placesTable.longitude,
                label: placesTable.label,
                createdAt: placesTable.createdAt,
                updatedAt: placesTable.updatedAt,
                nodeId: nodesTable.id,
                activatedAt: nodesTable.activatedAt,
                memberCount: memberCountObservations.count,
              })
              .from(placesTable)
              .leftJoin(nodesTable, eq(nodesTable.placeId, placesTable.id))
              .leftJoin(
                memberCountObservations,
                eq(memberCountObservations.organizationId, nodesTable.orgId),
              )
              .where(
                sql`${placesTable.slug} = ${slugCandidate} OR ${placesTable.id} IN (
                  SELECT place_id FROM place_aliases WHERE value IN (${sql.join(
                    candidates.map((value) => sql`${value}`),
                    sql`, `,
                  )})
                )`,
              )
              .limit(1),
          );
          const row = matched[0];
          if (!row) return null;

          const place: PlaceRecord = {
            id: row.id,
            slug: row.slug,
            name: row.name,
            parentId: row.parentId,
            latitude: row.latitude,
            longitude: row.longitude,
            label: row.label,
            createdAt:
              row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
            updatedAt:
              row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
          };
          const aliasRows = yield* query(() =>
            db
              .select({ value: placeAliasesTable.value })
              .from(placeAliasesTable)
              .where(eq(placeAliasesTable.placeId, place.id)),
          );

          const community: PlaceCommunity | null =
            row.nodeId && row.activatedAt
              ? {
                  nodeId: row.nodeId,
                  activatedAt: toTimestampIso(row.activatedAt),
                  memberCount: row.memberCount ?? null,
                }
              : null;

          return { place, aliases: aliasRows.map((a) => a.value), community };
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const [row] = yield* query(() =>
            db.select().from(placesTable).where(eq(placesTable.id, id)).limit(1),
          );
          return row ? toPlaceRecord(row) : null;
        }),

      boundary: (id) =>
        Effect.gen(function* () {
          const [row] = yield* query(() =>
            db
              .select({ boundary: placesTable.boundary })
              .from(placesTable)
              .where(eq(placesTable.id, id))
              .limit(1),
          );
          return row?.boundary ?? null;
        }),

      roots: () =>
        query(() => db.select().from(placesTable).where(isNull(placesTable.parentId))).pipe(
          Effect.map((rows) => rows.map(toPlaceRecord)),
        ),

      children: (id) =>
        Effect.gen(function* () {
          const rows = yield* query(() =>
            db.select().from(placesTable).where(eq(placesTable.parentId, id)),
          );
          return rows.map(toPlaceRecord);
        }),

      ancestorIds: (id) => query(() => readIds(db, ancestorChainQuery(id))),

      subtreeIds: (id) => query(() => readIds(db, subtreeQuery(id))),
    };

    return service;
  }),
);
