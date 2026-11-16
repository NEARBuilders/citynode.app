import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { isNull, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { DatabaseLive, DatabaseTag } from "../src/db/layer";
import type { PlaceBoundary } from "../src/db/schema";
import {
  discoveryProfiles,
  nodes as nodesTable,
  placeAliases as placeAliasesTable,
  places as placesTable,
  tenants as tenantsTable,
} from "../src/db/schema";
import {
  applyBackfill,
  type BackfillGeo,
  type BackfillInputs,
  type BackfillNode,
  buildBackfillPlan,
} from "../src/seed/backfill-node-places";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
loadEnv({ path: join(scriptDir, "../../.env") });

const databaseUrl = process.env.API_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("API_DATABASE_URL is missing — run from the repo root with .env present");
}

const layer = Layer.mergeAll(DatabaseLive(databaseUrl)).pipe(
  Layer.provide(Layer.succeed(PluginIdTag, "api")),
);

const summary = await Effect.runPromise(
  Effect.gen(function* () {
    const db = yield* DatabaseTag;
    const nodeRows = yield* Effect.tryPromise(() =>
      db.select().from(nodesTable).where(isNull(nodesTable.placeId)),
    );
    const linkedRows = yield* Effect.tryPromise(() =>
      db
        .select({ id: nodesTable.id, placeSlug: placesTable.slug })
        .from(nodesTable)
        .innerJoin(placesTable, eq(placesTable.id, nodesTable.placeId)),
    );
    const tenantRows = yield* Effect.tryPromise(() => db.select().from(tenantsTable));
    const placeRows = yield* Effect.tryPromise(() =>
      db
        .select({
          id: placesTable.id,
          slug: placesTable.slug,
          name: placesTable.name,
          parentId: placesTable.parentId,
          boundary: placesTable.boundary,
          label: placesTable.label,
        })
        .from(placesTable),
    );
    const aliasRows = yield* Effect.tryPromise(() =>
      db
        .select({ value: placeAliasesTable.value, placeId: placeAliasesTable.placeId })
        .from(placeAliasesTable),
    );
    const profileRows = yield* Effect.tryPromise(() => db.select().from(discoveryProfiles));

    const orgIdByTenantId = new Map(tenantRows.map((t) => [t.id, t.orgId] as const));
    const geoByNodeId: Record<string, BackfillGeo> = {};
    for (const profile of profileRows) {
      const data = profile.data as {
        latitude?: number | null;
        longitude?: number | null;
        boundary?: PlaceBoundary | null;
      };
      geoByNodeId[profile.nodeId] = {
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        boundary: data.boundary ?? null,
      };
    }

    const nodes: BackfillNode[] = nodeRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      parentId: row.parentId,
      tenantOrgId: row.tenantId ? (orgIdByTenantId.get(row.tenantId) ?? null) : null,
      label: (row.metadata as { kind?: string } | null)?.kind ?? null,
      createdAt:
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));

    const linkedPlaceSlugByNodeId = Object.fromEntries(
      linkedRows.map((row) => [row.id, row.placeSlug] as const),
    );

    const inputs: BackfillInputs = {
      nodes,
      places: placeRows,
      aliases: aliasRows,
      geoByNodeId,
      linkedPlaceSlugByNodeId,
    };
    const plan = buildBackfillPlan(inputs);
    yield* Effect.tryPromise(() => applyBackfill(db, plan));

    const [counts] = yield* Effect.tryPromise(() =>
      db
        .select({
          linked: sql<number>`count(*) filter (where place_id is not null)::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(nodesTable),
    );
    return { planned: nodes.length, curated: plan.curated.length, ...counts };
  }).pipe(Effect.provide(layer)),
);

console.log(
  `[backfill-node-places] planned ${summary.planned} node(s), created ${summary.curated} curated place(s); linked ${summary.linked}/${summary.total} node(s) to places`,
);
process.exit(0);
