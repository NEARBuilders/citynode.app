import { sql } from "drizzle-orm";
import type { Database } from "../db";
import {
  type PlaceBoundary,
  placeAliases as placeAliasesTable,
  places as placesTable,
} from "../db/schema";

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
  label: string;
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

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
  const coordinates = roundCoordinates(g.coordinates);
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
}

function parseCountries(countryInfo: string, admin0Geojson: string): CountryRow[] {
  const boundariesByIso = new Map<string, PlaceBoundary>();
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
    rows.push({
      iso2,
      iso3,
      name,
      geonameid,
      boundary: boundariesByIso.get(iso2) ?? null,
    });
  }
  return rows;
}

interface Admin1Row {
  countryCode: string;
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
    rows.push({ countryCode, name, geonameid });
  }
  return rows;
}

interface Admin1Boundary {
  key: string;
  boundary: PlaceBoundary;
}

function parseAdmin1Boundaries(admin1Geojson: string): Admin1Boundary[] {
  const collection = JSON.parse(admin1Geojson) as {
    features?: Array<{
      properties?: Record<string, unknown>;
      geometry?: unknown;
    }>;
  };
  const rows: Admin1Boundary[] = [];
  for (const feature of collection.features ?? []) {
    const props = feature.properties ?? {};
    const iso2 = [props.iso_a2, props.ISO_A2, props.iso_a2_eh]
      .filter((value) => typeof value === "string" && value.length === 2 && value !== "-99")
      .map((value) => (value as string).toUpperCase())[0];
    const name = typeof props.gn_name === "string" ? props.gn_name : props.name;
    if (!iso2 || typeof name !== "string") continue;
    const boundary = toBoundary(feature.geometry);
    if (!boundary) continue;
    rows.push({ key: `${iso2}:${slugify(name)}`, boundary });
  }
  return rows;
}

function bboxCenter(boundary: PlaceBoundary): { latitude: number; longitude: number } {
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let sawPair = false;
  const walk = (level: unknown): void => {
    if (!Array.isArray(level)) return;
    if (typeof level[0] === "number" && typeof level[1] === "number") {
      const [lng, lat] = level as [number, number];
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      sawPair = true;
      return;
    }
    for (const item of level) walk(item);
  };
  walk(boundary.coordinates);
  if (!sawPair) {
    minLat = 0;
    maxLat = 0;
    minLng = 0;
    maxLng = 0;
  }
  return {
    latitude: Number(((minLat + maxLat) / 2).toFixed(4)),
    longitude: Number(((minLng + maxLng) / 2).toFixed(4)),
  };
}

export function buildPlacesCatalog(sources: SeedSources): PlacesCatalog {
  const countries = parseCountries(sources.countryInfo, sources.admin0Geojson);
  const admin1 = parseAdmin1(sources.admin1Codes);
  const admin1Boundaries = parseAdmin1Boundaries(sources.admin1Geojson);
  const boundariesByAdmin1 = new Map(admin1Boundaries.map((row) => [row.key, row.boundary]));

  const memberByIso = new Map<string, Supranational>();
  for (const supranational of sources.supranationals) {
    for (const iso2 of supranational.memberIso2) {
      memberByIso.set(iso2.toUpperCase(), supranational);
    }
  }

  const places: PlaceUpsertRow[] = [];
  const aliases: AliasUpsertRow[] = [];

  for (const supranational of sources.supranationals) {
    places.push({
      slug: supranational.slug,
      name: supranational.name,
      label: "supranational",
      latitude: null,
      longitude: null,
      boundary: null,
      parentSlug: null,
    });
  }

  const countrySlugByIso = new Map<string, string>();
  for (const country of countries) {
    const slug = slugify(country.name);
    countrySlugByIso.set(country.iso2, slug);
    const supranational = memberByIso.get(country.iso2);
    const pin = country.boundary ? bboxCenter(country.boundary) : null;
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
    const boundary = boundariesByAdmin1.get(`${row.countryCode}:${slugify(row.name)}`);
    const pin = boundary ? bboxCenter(boundary) : null;
    places.push({
      slug,
      name: row.name,
      label: "subdivision",
      latitude: pin?.latitude ?? null,
      longitude: pin?.longitude ?? null,
      boundary: boundary ?? null,
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
