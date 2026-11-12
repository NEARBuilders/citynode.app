import { eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import {
  nodes as nodesTable,
  type PlaceBoundary,
  placeAliases as placeAliasesTable,
  places as placesTable,
} from "../db/schema";
import { pointInBoundary } from "../services/place-match";
import {
  type AliasUpsertRow,
  type PlaceUpsertRow,
  seedPlacesInto,
  slugify,
} from "./places-catalog";

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
  label: string | null;
}

export interface BackfillInputs {
  nodes: BackfillNode[];
  places: ExistingPlace[];
  aliases: Array<{ value: string; placeId: string }>;
  geoByNodeId: Record<string, BackfillGeo>;
  // Nodes whose place link was established on an earlier run. The unlinked
  // list below can't see them, but their children still need a parent place.
  linkedPlaceSlugByNodeId?: Record<string, string>;
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

function labelFor(kind: string | null): string | null {
  if (kind === "country") return "country";
  if (kind === "state") return "subdivision";
  if (kind === "city") return "city";
  return null;
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
  const linkedPlaceSlugByNodeId = inputs.linkedPlaceSlugByNodeId ?? {};

  const curated: PlaceUpsertRow[] = [];
  const curatedBySlug = new Map<string, PlaceUpsertRow>();
  // Every place slug this plan links a node to. Two nodes on one place would
  // trip the unique nodes.place_id index mid-run, so matches only claim free
  // places and everything else falls back to a curated row.
  const claimedSlugs = new Set<string>();
  const plans = new Map<string, { placeSlug: string; curatedRow: PlaceUpsertRow | null }>();

  const resolveParentPlaceSlug = (node: BackfillNode): string | null => {
    if (!node.parentId) return null;
    const linked = linkedPlaceSlugByNodeId[node.parentId];
    if (linked) return linked;
    const parentNode = inputs.nodes.find((candidate) => candidate.id === node.parentId);
    return parentNode ? resolveNode(parentNode).placeSlug : null;
  };

  const curatedFor = (
    node: BackfillNode,
    geo: BackfillGeo | null,
  ): { placeSlug: string; curatedRow: PlaceUpsertRow } => {
    const parentPlaceSlug = resolveParentPlaceSlug(node);
    let slug = node.slug;
    if (curatedBySlug.has(slug) || claimedSlugs.has(slug) || bySlug.has(slug)) {
      // Same-slug nodes under different parents (or a catalog slug already
      // using the name) disambiguate by tree position; the node's own slug
      // survives as a legacy alias, so resolution is unaffected.
      slug = parentPlaceSlug ? `${parentPlaceSlug}-${node.slug}` : slug;
    }
    if (curatedBySlug.has(slug) || claimedSlugs.has(slug) || bySlug.has(slug)) {
      slug = `${slug}-${node.id.slice(0, 8)}`;
    }
    const curatedRow: PlaceUpsertRow = {
      slug,
      name: node.name,
      label: labelFor(node.label),
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      boundary: geo?.boundary ?? null,
      parentSlug: parentPlaceSlug,
    };
    curatedBySlug.set(slug, curatedRow);
    claimedSlugs.add(slug);
    curated.push(curatedRow);
    return { placeSlug: slug, curatedRow };
  };

  function resolveNode(node: BackfillNode): {
    placeSlug: string;
    curatedRow: PlaceUpsertRow | null;
  } {
    const cached = plans.get(node.id);
    if (cached) return cached;

    const geo = inputs.geoByNodeId[node.id] ?? null;
    let result: { placeSlug: string; curatedRow: PlaceUpsertRow | null };

    const exact = bySlug.get(node.slug);
    if (exact) {
      claimedSlugs.add(exact.slug);
      result = { placeSlug: exact.slug, curatedRow: null };
    } else {
      const aliasPlaceId = inputs.aliases.find((alias) => alias.value === node.slug)?.placeId;
      const aliasPlace = aliasPlaceId ? byId.get(aliasPlaceId) : undefined;
      if (aliasPlace) {
        claimedSlugs.add(aliasPlace.slug);
        result = { placeSlug: aliasPlace.slug, curatedRow: null };
      } else {
        const nameSlug = slugify(node.name);
        const byName = bySlug.get(nameSlug);
        if (byName) {
          claimedSlugs.add(byName.slug);
          result = { placeSlug: byName.slug, curatedRow: null };
        } else {
          // Geo containment only links when the containing place's level fits
          // the node's kind — a city inside India is not India. Level-fitting
          // places already claimed by another node are skipped too: one node
          // per place, the rest curate underneath their tree parent.
          const wantedLabel = labelFor(node.label);
          const geoMatch =
            geo?.latitude != null && geo.longitude != null && wantedLabel
              ? inputs.places.filter(
                  (place) =>
                    place.label === wantedLabel &&
                    place.boundary &&
                    pointInBoundary(geo.longitude!, geo.latitude!, place.boundary) &&
                    !claimedSlugs.has(place.slug),
                )
              : [];
          const deepest =
            geoMatch.length > 0
              ? geoMatch.reduce((best, candidate) =>
                  (depthById.get(candidate.id) ?? 0) > (depthById.get(best.id) ?? 0)
                    ? candidate
                    : best,
                )
              : undefined;
          if (deepest) {
            claimedSlugs.add(deepest.slug);
            result = { placeSlug: deepest.slug, curatedRow: null };
          } else {
            result = curatedFor(node, geo);
          }
        }
      }
    }

    plans.set(node.id, result);
    return result;
  }

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

  const duplicate = nodeLinks.find(
    (link, index) => nodeLinks.findIndex((other) => other.placeSlug === link.placeSlug) !== index,
  );
  if (duplicate) {
    // Plan-level guarantee: the node-link update below would trip the unique
    // nodes.place_id index halfway through the run otherwise.
    throw new Error(
      `[backfill-node-places] plan links two nodes to place "${duplicate.placeSlug}" — refusing to apply`,
    );
  }

  return { curated, nodeLinks };
}

export async function applyBackfill(db: Database, plan: BackfillPlan): Promise<void> {
  const aliases: AliasUpsertRow[] = plan.nodeLinks
    .filter((link) => link.legacyAlias !== null)
    .map((link) => ({
      value: link.legacyAlias!,
      kind: "legacy" as const,
      slug: link.placeSlug,
    }));

  await seedPlacesInto(db, { places: plan.curated, aliases });

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
