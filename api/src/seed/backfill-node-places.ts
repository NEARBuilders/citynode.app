import { eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import {
  nodes as nodesTable,
  type PlaceBoundary,
  placeAliases as placeAliasesTable,
  places as placesTable,
} from "../db/schema";
import type { PlaceUpsertRow } from "./places-catalog";

export interface BackfillGeo {
  latitude: number | null;
  longitude: number | null;
  boundary: PlaceBoundary | null;
}

export interface BackfillNode {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  tenantOrgId: string | null;
  label: string | null;
  createdAt: string;
}

export interface ExistingPlace {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  boundary: PlaceBoundary | null;
}

export interface BackfillInputs {
  nodes: BackfillNode[];
  places: ExistingPlace[];
  aliases: Array<{ value: string; placeId: string }>;
  geoByNodeId: Record<string, BackfillGeo>;
}

export interface NodeLink {
  nodeId: string;
  placeSlug: string;
  orgId: string | null;
  activatedAt: string;
  legacyAlias: string | null;
}

export interface BackfillPlan {
  curated: PlaceUpsertRow[];
  nodeLinks: NodeLink[];
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function labelFor(kind: string | null): string | null {
  if (kind === "country") return "country";
  if (kind === "state") return "subdivision";
  if (kind === "city") return "city";
  return null;
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInBoundary(lng: number, lat: number, boundary: PlaceBoundary): boolean {
  const rings = boundary.type === "Polygon" ? boundary.coordinates : boundary.coordinates.flat();
  return rings.some((ring) => pointInRing(lng, lat, ring as number[][]));
}

function placeDepth(placeId: string, byId: Map<string, ExistingPlace>): number {
  let depth = 0;
  let cursor: string | null = placeId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const place = byId.get(cursor);
    if (!place?.parentId) break;
    depth += 1;
    cursor = place.parentId;
  }
  return depth;
}

export function buildBackfillPlan(inputs: BackfillInputs): BackfillPlan {
  const byId = new Map(inputs.places.map((place) => [place.id, place] as const));
  const bySlug = new Map(inputs.places.map((place) => [place.slug, place] as const));
  const depthById = new Map(
    inputs.places.map((place) => [place.id, placeDepth(place.id, byId)] as const),
  );

  const curated: PlaceUpsertRow[] = [];
  const plans = new Map<string, { placeSlug: string; curatedRow: PlaceUpsertRow | null }>();

  const resolveNode = (
    node: BackfillNode,
  ): { placeSlug: string; curatedRow: PlaceUpsertRow | null } => {
    const cached = plans.get(node.id);
    if (cached) return cached;

    const geo = inputs.geoByNodeId[node.id] ?? null;
    let result: { placeSlug: string; curatedRow: PlaceUpsertRow | null };

    const exact = bySlug.get(node.slug);
    if (exact) {
      result = { placeSlug: exact.slug, curatedRow: null };
    } else {
      const aliasPlaceId = inputs.aliases.find((alias) => alias.value === node.slug)?.placeId;
      const aliasPlace = aliasPlaceId ? byId.get(aliasPlaceId) : undefined;
      if (aliasPlace) {
        result = { placeSlug: aliasPlace.slug, curatedRow: null };
      } else {
        const nameSlug = slugify(node.name);
        const byName = bySlug.get(nameSlug);
        if (byName) {
          result = { placeSlug: byName.slug, curatedRow: null };
        } else if (geo?.latitude != null && geo.longitude != null) {
          const candidates = inputs.places.filter(
            (place) =>
              place.boundary && pointInBoundary(geo.longitude!, geo.latitude!, place.boundary),
          );
          const deepest =
            candidates.length > 0
              ? candidates.reduce((best, candidate) =>
                  (depthById.get(candidate.id) ?? 0) > (depthById.get(best.id) ?? 0)
                    ? candidate
                    : best,
                )
              : undefined;
          result = deepest
            ? { placeSlug: deepest.slug, curatedRow: null }
            : {
                placeSlug: node.slug,
                curatedRow: {
                  slug: node.slug,
                  name: node.name,
                  label: labelFor(node.label),
                  latitude: geo.latitude,
                  longitude: geo.longitude,
                  boundary: geo.boundary,
                  parentSlug: null,
                },
              };
        } else {
          result = {
            placeSlug: node.slug,
            curatedRow: {
              slug: node.slug,
              name: node.name,
              label: labelFor(node.label),
              latitude: geo?.latitude ?? null,
              longitude: geo?.longitude ?? null,
              boundary: geo?.boundary ?? null,
              parentSlug: null,
            },
          };
        }
      }
    }

    if (result.curatedRow && node.parentId) {
      const parentNode = inputs.nodes.find((candidate) => candidate.id === node.parentId);
      if (parentNode) {
        const parentPlan = resolveNode(parentNode);
        result.curatedRow.parentSlug = parentPlan.placeSlug;
      }
    }

    plans.set(node.id, result);
    if (result.curatedRow && !curated.some((row) => row.slug === result.curatedRow!.slug)) {
      curated.push(result.curatedRow);
    }
    return result;
  };

  for (const node of inputs.nodes) resolveNode(node);

  const nodeLinks: NodeLink[] = inputs.nodes.map((node) => {
    const result = plans.get(node.id)!;
    const place = bySlug.get(result.placeSlug);
    const matchedDifferentSlug = !result.curatedRow && place && place.slug !== node.slug;
    return {
      nodeId: node.id,
      placeSlug: result.placeSlug,
      orgId: node.tenantOrgId,
      activatedAt: node.createdAt,
      legacyAlias: matchedDifferentSlug ? node.slug : null,
    };
  });

  return { curated, nodeLinks };
}

export async function applyBackfill(db: Database, plan: BackfillPlan): Promise<void> {
  for (const place of plan.curated) {
    await db
      .insert(placesTable)
      .values(place)
      .onConflictDoUpdate({
        target: placesTable.slug,
        set: {
          name: sql`excluded.name`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          boundary: sql`excluded.boundary`,
          label: sql`excluded.label`,
          updatedAt: sql`CASE
            WHEN excluded.name IS DISTINCT FROM places.name
              OR excluded.latitude IS DISTINCT FROM places.latitude
              OR excluded.longitude IS DISTINCT FROM places.longitude
              OR excluded.boundary IS DISTINCT FROM places.boundary
              OR excluded.label IS DISTINCT FROM places.label
            THEN now() ELSE places.updated_at END`,
        },
      });
  }

  const parented = plan.curated.filter((row) => row.parentSlug !== null);
  for (const place of parented) {
    await db.execute(sql`
      UPDATE places
      SET parent_id = parent.id,
        updated_at = CASE
          WHEN places.parent_id IS DISTINCT FROM parent.id THEN now() ELSE places.updated_at END
      FROM (VALUES (${place.slug}, ${place.parentSlug})) AS seed_parent(slug, parent_slug)
      INNER JOIN places parent ON parent.slug = seed_parent.parent_slug
      WHERE places.slug = seed_parent.slug
    `);
  }

  const legacyAliases = plan.nodeLinks.filter((link) => link.legacyAlias !== null);
  for (const link of legacyAliases) {
    const [place] = await db
      .select({ id: placesTable.id })
      .from(placesTable)
      .where(eq(placesTable.slug, link.placeSlug))
      .limit(1);
    if (!place) continue;
    await db
      .insert(placeAliasesTable)
      .values({ value: link.legacyAlias!, kind: "legacy", placeId: place.id })
      .onConflictDoUpdate({
        target: placeAliasesTable.value,
        set: { placeId: sql`excluded.place_id`, kind: sql`excluded.kind` },
      });
  }

  for (const link of plan.nodeLinks) {
    const [place] = await db
      .select({ id: placesTable.id })
      .from(placesTable)
      .where(eq(placesTable.slug, link.placeSlug))
      .limit(1);
    if (!place) continue;
    await db
      .update(nodesTable)
      .set({
        placeId: place.id,
        orgId: link.orgId,
        activatedAt: link.activatedAt ? new Date(link.activatedAt) : null,
      })
      .where(eq(nodesTable.id, link.nodeId));
  }
}
