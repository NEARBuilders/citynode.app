import { simplify } from "@turf/simplify";
import { sql } from "drizzle-orm";
import type { Database } from "../db";
import {
  type PlaceBoundary,
  placeAliases as placeAliasesTable,
  places as placesTable,
} from "../db/schema";
import { slugify } from "../lib/slug";

// KEEP: display-grade geometry — 0.02° (~2km) keeps the 10m Natural Earth
// source small enough for the JSONB boundary column and on-demand map fetches
// while preserving coastline character; the pin comes from centroid/labels,
// not from this.
const SEED_SIMPLIFY_TOLERANCE_DEGREES = 0.02;

export interface Supranational {
  slug: string;
  name: string;
  memberIso2: string[];
}

export interface SeedSources {
  countryInfo: string;
  admin1Codes: string;
  admin0Geojson: string;
  admin1Geojson: string;
  supranationals: Supranational[];
}

export interface PlaceUpsertRow {
  slug: string;
  name: string;
  label: string | null;
  latitude: number | null;
  longitude: number | null;
  boundary: PlaceBoundary | null;
  parentSlug: string | null;
}

export interface AliasUpsertRow {
  value: string;
  kind: "geonames" | "iso" | "legacy";
  slug: string;
}

export interface PlacesCatalog {
  places: PlaceUpsertRow[];
  aliases: AliasUpsertRow[];
}

export { slugify } from "../lib/slug";

function roundCoordinates(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => roundCoordinates(item));
  }
  return typeof value === "number" ? Number(value.toFixed(4)) : value;
}

function toBoundary(geometry: unknown): PlaceBoundary | null {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || !Array.isArray(g.coordinates) || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
    return null;
  }
  const simplified = simplify(
    { type: "Feature", properties: {}, geometry: g } as Parameters<typeof simplify>[0],
    { tolerance: SEED_SIMPLIFY_TOLERANCE_DEGREES, highQuality: false },
  );
  const simplifiedCoordinates = (simplified as { geometry?: { coordinates?: unknown } }).geometry
    ?.coordinates;
  const coordinates = roundCoordinates(simplifiedCoordinates ?? g.coordinates);
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: coordinates as number[][][] }
    : { type: "MultiPolygon", coordinates: coordinates as number[][][][] };
}

interface CountryRow {
  iso2: string;
  iso3: string;
  name: string;
  geonameid: string;
  boundary: PlaceBoundary | null;
  labelX: number | null;
  labelY: number | null;
}

interface ParsedCountries {
  rows: CountryRow[];
  boundariesByIso: Map<string, PlaceBoundary>;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCountries(countryInfo: string, admin0Geojson: string): ParsedCountries {
  const boundariesByIso = new Map<string, PlaceBoundary>();
  const labelsByIso = new Map<string, { labelX: number | null; labelY: number | null }>();
  const collection = JSON.parse(admin0Geojson) as {
    features?: Array<{
      properties?: Record<string, unknown>;
      geometry?: unknown;
    }>;
  };
  for (const feature of collection.features ?? []) {
    const props = feature.properties ?? {};
    const iso2 = [props.ISO_A2, props.ISO_A2_EH, props.iso_a2]
      .filter((value) => typeof value === "string" && value.length === 2 && value !== "-99")
      .map((value) => (value as string).toUpperCase())[0];
    if (!iso2) continue;
    const boundary = toBoundary(feature.geometry);
    if (boundary) boundariesByIso.set(iso2, boundary);
    labelsByIso.set(iso2, {
      labelX: numberOrNull(props.LABEL_X ?? props.label_x),
      labelY: numberOrNull(props.LABEL_Y ?? props.label_y),
    });
  }

  const rows: CountryRow[] = [];
  for (const line of countryInfo.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") continue;
    const columns = line.split("\t");
    const iso2 = columns[0]?.trim().toUpperCase();
    const iso3 = columns[1]?.trim().toUpperCase();
    const name = columns[4]?.trim();
    const geonameid = columns[16]?.trim();
    if (!iso2 || !iso3 || !name || !geonameid) continue;
    const labels = labelsByIso.get(iso2) ?? { labelX: null, labelY: null };
    rows.push({
      iso2,
      iso3,
      name,
      geonameid,
      boundary: boundariesByIso.get(iso2) ?? null,
      labelX: labels.labelX,
      labelY: labels.labelY,
    });
  }
  return { rows, boundariesByIso };
}

interface Admin1Row {
  countryCode: string;
  code: string;
  name: string;
  geonameid: string;
}

function parseAdmin1(admin1Codes: string): Admin1Row[] {
  const rows: Admin1Row[] = [];
  for (const line of admin1Codes.split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const columns = line.split("\t");
    const code = columns[0]?.trim();
    const name = columns[1]?.trim();
    const geonameid = columns[3]?.trim();
    if (!code || !name || !geonameid) continue;
    const countryCode = code.split(".")[0]?.trim().toUpperCase();
    if (!countryCode) continue;
    rows.push({ countryCode, code, name, geonameid });
  }
  return rows;
}

interface Admin1Match {
  boundary: PlaceBoundary;
  labelX: number | null;
  labelY: number | null;
}

interface Admin1Boundaries {
  byGeonameid: Map<number, Admin1Match>;
  byCode: Map<string, Admin1Match>;
  bySlug: Map<string, Admin1Match>;
}

const ADMIN_SUFFIXES = [
  "province",
  "state",
  "governorate",
  "region",
  "county",
  "district",
  "wilaya",
  "oblast",
  "emirate",
  "parish",
  "department",
  "prefecture",
  "municipality",
  "division",
  "canton",
];

function nameKeys(name: string): string[] {
  const base = slugify(name);
  if (!base) return [];
  const keys = [base];
  for (const suffix of ADMIN_SUFFIXES) {
    if (base.endsWith(`-${suffix}`)) {
      const stripped = base.slice(0, -(suffix.length + 1));
      if (stripped) keys.push(stripped);
    }
  }
  return keys;
}

// The 10m Natural Earth file names subdivisions in transliterated local forms
// ("Dubayy"), so geonames' English names alone match poorly. Match on the
// geonames id the file carries (gn_id), then geonames/ISO admin codes, then
// name slugs with admin-suffix variants stripped.
function parseAdmin1Boundaries(admin1Geojson: string): Admin1Boundaries {
  const collection = JSON.parse(admin1Geojson) as {
    features?: Array<{
      properties?: Record<string, unknown>;
      geometry?: unknown;
    }>;
  };
  const byGeonameid = new Map<number, Admin1Match>();
  const byCode = new Map<string, Admin1Match>();
  const bySlug = new Map<string, Admin1Match>();
  const put = (map: Map<string, Admin1Match>, key: string, match: Admin1Match) => {
    if (key && !map.has(key)) map.set(key, match);
  };

  for (const feature of collection.features ?? []) {
    const props = feature.properties ?? {};
    const iso2 = [props.iso_a2, props.ISO_A2, props.iso_a2_eh]
      .filter((value) => typeof value === "string" && value.length === 2 && value !== "-99")
      .map((value) => (value as string).toUpperCase())[0];
    if (!iso2) continue;
    const boundary = toBoundary(feature.geometry);
    if (!boundary) continue;
    const match: Admin1Match = {
      boundary,
      labelX: numberOrNull(props.longitude),
      labelY: numberOrNull(props.latitude),
    };

    const gnId = numberOrNull(props.gn_id);
    if (gnId !== null && !byGeonameid.has(gnId)) byGeonameid.set(gnId, match);

    const gnA1 = props.gn_a1_code;
    if (typeof gnA1 === "string" && gnA1) put(byCode, gnA1.toUpperCase(), match);
    const iso31662 = props.iso_3166_2;
    if (typeof iso31662 === "string" && iso31662 !== "-99" && iso31662) {
      put(byCode, iso31662.replace("-", ".").toUpperCase(), match);
    }

    const nameCandidates = [props.gn_name, props.name, props.name_ascii, props.name_local];
    const alt = props.name_alt;
    if (typeof alt === "string") nameCandidates.push(...alt.split("|"));
    if (typeof props.abbrev === "string") nameCandidates.push(props.abbrev);
    for (const candidate of nameCandidates) {
      if (typeof candidate !== "string") continue;
      for (const key of nameKeys(candidate)) put(bySlug, `${iso2}:${key}`, match);
    }
  }

  return { byGeonameid, byCode, bySlug };
}

interface Pin {
  latitude: number;
  longitude: number;
}

function roundPin(x: number, y: number): Pin {
  return { latitude: Number(y.toFixed(4)), longitude: Number(x.toFixed(4)) };
}

function pointAt(ring: number[][], index: number): [number, number] | null {
  const point = ring[index];
  const lng = point?.[0];
  const lat = point?.[1];
  return lng === undefined || lat === undefined ? null : [lng, lat];
}

function ringAreaAndCentroid(ring: number[][]): { area: number; x: number; y: number } {
  const last = ring.length - 1;
  const first = pointAt(ring, 0);
  const finalPoint = last >= 0 ? pointAt(ring, last) : null;
  const isClosed =
    first !== null &&
    finalPoint !== null &&
    first[0] === finalPoint[0] &&
    first[1] === finalPoint[1];
  const points = isClosed ? last : ring.length;
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < points; i++) {
    const start = pointAt(ring, i);
    const end = pointAt(ring, (i + 1) % points);
    if (!start || !end) continue;
    const cross = start[0] * end[1] - end[0] * start[1];
    twiceArea += cross;
    x += (start[0] + end[0]) * cross;
    y += (start[1] + end[1]) * cross;
  }
  const area = twiceArea / 2;
  if (twiceArea === 0) {
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < points; i++) {
      const point = pointAt(ring, i);
      if (!point) continue;
      sumX += point[0];
      sumY += point[1];
    }
    return { area, x: sumX / points, y: sumY / points };
  }
  return { area, x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
}

// Exterior ring minus holes, orientation-independent (GeoJSON fixes ring roles
// by index, not winding).
function polygonCentroid(polygon: number[][][]): { x: number; y: number; area: number } | null {
  const exterior = polygon[0];
  if (!exterior) return null;
  const holes = polygon.slice(1);
  const outer = ringAreaAndCentroid(exterior);
  const outerArea = Math.abs(outer.area);
  if (outerArea === 0) return null;
  let area = outerArea;
  let cx = outer.x * outerArea;
  let cy = outer.y * outerArea;
  for (const hole of holes) {
    const holeRing = ringAreaAndCentroid(hole);
    const holeArea = Math.abs(holeRing.area);
    area -= holeArea;
    cx -= holeRing.x * holeArea;
    cy -= holeRing.y * holeArea;
  }
  if (area <= 0) return null;
  return { x: cx / area, y: cy / area, area };
}

// Area centroid of the largest polygon. Safe across the antimeridian because
// Natural Earth splits its polygons at ±180 — no single ring wraps.
function largestPolygonCentroid(boundary: PlaceBoundary): Pin | null {
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  let best: { x: number; y: number; area: number } | null = null;
  for (const polygon of polygons) {
    const centroid = polygonCentroid(polygon);
    if (!centroid) continue;
    if (!best || centroid.area > best.area) best = centroid;
  }
  return best ? roundPin(best.x, best.y) : null;
}

// Natural Earth ships LABEL_X/LABEL_Y placement pins on admin-0 features;
// they are the only correct pin for antimeridian-spanning countries (Russia's
// bbox midpoint lands in the Norwegian Sea). Subdivisions have no label props,
// so they fall through to the centroid.
function derivePin(boundary: PlaceBoundary | null, labelX: number | null, labelY: number | null) {
  if (labelX !== null && labelY !== null) return roundPin(labelX, labelY);
  if (boundary) return largestPolygonCentroid(boundary);
  return null;
}

export function buildPlacesCatalog(sources: SeedSources): PlacesCatalog {
  const { rows: countries, boundariesByIso } = parseCountries(
    sources.countryInfo,
    sources.admin0Geojson,
  );
  const admin1 = parseAdmin1(sources.admin1Codes);
  const admin1Boundaries = parseAdmin1Boundaries(sources.admin1Geojson);

  const memberByIso = new Map<string, Supranational>();
  for (const supranational of sources.supranationals) {
    for (const iso2 of supranational.memberIso2) {
      memberByIso.set(iso2.toUpperCase(), supranational);
    }
  }

  const places: PlaceUpsertRow[] = [];
  const aliases: AliasUpsertRow[] = [];

  for (const supranational of sources.supranationals) {
    // The union's boundary is the concatenation of its member states'
    // (already-simplified) polygons. No dissolve is needed for display —
    // country polygons don't overlap — and re-seeding keeps it in sync
    // with whatever Natural Earth geometry the members carry.
    const memberPolygons = supranational.memberIso2.flatMap((iso2) => {
      const boundary = boundariesByIso.get(iso2.toUpperCase());
      if (!boundary) return [];
      return boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
    });
    const boundary: PlaceBoundary | null =
      memberPolygons.length > 0 ? { type: "MultiPolygon", coordinates: memberPolygons } : null;
    const pin = boundary ? largestPolygonCentroid(boundary) : null;
    places.push({
      slug: supranational.slug,
      name: supranational.name,
      label: "supranational",
      latitude: pin?.latitude ?? null,
      longitude: pin?.longitude ?? null,
      boundary,
      parentSlug: null,
    });
  }

  const countrySlugByIso = new Map<string, string>();
  for (const country of countries) {
    const slug = slugify(country.name);
    countrySlugByIso.set(country.iso2, slug);
    const supranational = memberByIso.get(country.iso2);
    const pin = derivePin(country.boundary, country.labelX, country.labelY);
    places.push({
      slug,
      name: country.name,
      label: "country",
      latitude: pin?.latitude ?? null,
      longitude: pin?.longitude ?? null,
      boundary: country.boundary,
      parentSlug: supranational ? supranational.slug : null,
    });
    aliases.push({ value: country.geonameid, kind: "geonames", slug });
    aliases.push({ value: country.iso2, kind: "iso", slug });
    aliases.push({ value: country.iso3, kind: "iso", slug });
  }

  for (const row of admin1) {
    const countrySlug = countrySlugByIso.get(row.countryCode);
    if (!countrySlug) continue;
    const slug = `${row.countryCode.toLowerCase()}-${slugify(row.name)}`;
    const geonameid = Number(row.geonameid);
    const match =
      (Number.isFinite(geonameid) && geonameid > 0
        ? admin1Boundaries.byGeonameid.get(geonameid)
        : undefined) ??
      admin1Boundaries.byCode.get(row.code.toUpperCase()) ??
      nameKeys(row.name)
        .map((key) => admin1Boundaries.bySlug.get(`${row.countryCode}:${key}`))
        .find(Boolean);
    const pin = match ? derivePin(match.boundary, match.labelX, match.labelY) : null;
    places.push({
      slug,
      name: row.name,
      label: "subdivision",
      latitude: pin?.latitude ?? null,
      longitude: pin?.longitude ?? null,
      boundary: match?.boundary ?? null,
      parentSlug: countrySlug,
    });
    aliases.push({ value: row.geonameid, kind: "geonames", slug });
  }

  return { places, aliases };
}

function chunk<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export async function seedPlacesInto(db: Database, catalog: PlacesCatalog): Promise<void> {
  for (const batch of chunk(catalog.places, 500)) {
    await db
      .insert(placesTable)
      .values(batch)
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

  const parented = catalog.places.filter((row) => row.parentSlug !== null);
  for (const batch of chunk(parented, 500)) {
    const values = sql.join(
      batch.map((row) => sql`(${row.slug}, ${row.parentSlug})`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE places
      SET parent_id = parent.id,
        updated_at = CASE
          WHEN places.parent_id IS DISTINCT FROM parent.id THEN now() ELSE places.updated_at END
      FROM (VALUES ${values}) AS seed_parent(slug, parent_slug)
      INNER JOIN places parent ON parent.slug = seed_parent.parent_slug
      WHERE places.slug = seed_parent.slug
    `);
  }

  const slugs = [...new Set(catalog.aliases.map((alias) => alias.slug))];
  const idBySlug = new Map<string, string>();
  for (const batch of chunk(slugs, 500)) {
    const rows = await db
      .select({ id: placesTable.id, slug: placesTable.slug })
      .from(placesTable)
      .where(
        sql`${placesTable.slug} IN (${sql.join(
          batch.map((slug) => sql`${slug}`),
          sql`, `,
        )})`,
      );
    for (const row of rows) idBySlug.set(row.slug, row.id);
  }

  const aliasRows = catalog.aliases.map((alias) => {
    const placeId = idBySlug.get(alias.slug);
    if (!placeId) throw new Error(`seed alias references unknown place slug: ${alias.slug}`);
    return { value: alias.value, kind: alias.kind, placeId };
  });

  for (const batch of chunk(aliasRows, 1000)) {
    await db
      .insert(placeAliasesTable)
      .values(batch)
      .onConflictDoUpdate({
        target: placeAliasesTable.value,
        set: {
          placeId: sql`excluded.place_id`,
          kind: sql`excluded.kind`,
        },
      });
  }
}
