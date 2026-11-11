import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { config as loadEnv } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { DatabaseLive, DatabaseTag } from "../src/db/layer";
import { placeAliases as placeAliasesTable, places as placesTable } from "../src/db/schema";
import {
  buildPlacesCatalog,
  type CuratedAlias,
  type SeedSources,
  seedPlacesInto,
} from "../src/seed/places-catalog";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
loadEnv({ path: join(scriptDir, "../../.env") });

const CACHE_DIR = join(tmpdir(), "citynode-seed-cache");

const SOURCES = [
  {
    file: "countryInfo.txt",
    url: "https://download.geonames.org/export/dump/countryInfo.txt",
  },
  {
    file: "admin1CodesASCII.txt",
    url: "https://download.geonames.org/export/dump/admin1CodesASCII.txt",
  },
  {
    file: "ne_50m_admin_0_countries.geojson",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson",
  },
  {
    file: "ne_10m_admin_1_states_provinces.geojson",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson",
  },
];

const SUPRANATIONALS = [
  {
    slug: "cis",
    name: "Commonwealth of Independent States",
    memberIso2: ["AM", "AZ", "BY", "KZ", "KG", "MD", "RU", "TJ", "UZ"],
  },
];

const CITIES = {
  file: "cities15000.txt",
  archive: "cities15000.zip",
  url: "https://download.geonames.org/export/dump/cities15000.zip",
};

const CURATED_ALIASES: CuratedAlias[] = [
  { value: "nyc", geonameid: "5128581" },
  { value: "sf", geonameid: "5391959" },
  { value: "dc", geonameid: "4140963" },
  { value: "kl", geonameid: "1735161" },
  { value: "cdmx", geonameid: "3530597" },
];

function readZipEntry(zip: Buffer, file: string): Buffer {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a zip archive");
  const entries = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  for (let index = 0; index < entries; index++) {
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (name === file) {
      const start =
        localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const data = zip.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`${file} uses unsupported zip method ${method}`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${file} not found in archive`);
}

async function cachedCities(): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cached = join(CACHE_DIR, CITIES.file);
  if (existsSync(cached)) return readFileSync(cached, "utf8");
  const response = await fetch(CITIES.url);
  if (!response.ok) throw new Error(`${CITIES.url} responded ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  writeFileSync(join(CACHE_DIR, CITIES.archive), archive);
  const text = readZipEntry(archive, CITIES.file).toString("utf8");
  writeFileSync(cached, text);
  return text;
}

async function cachedText(file: string, url: string): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cached = join(CACHE_DIR, file);
  if (existsSync(cached)) return readFileSync(cached, "utf8");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  const text = await response.text();
  writeFileSync(cached, text);
  return text;
}

const databaseUrl = process.env.API_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("API_DATABASE_URL is missing — run from the repo root with .env present");
}

const [[countryInfo, admin1Codes, admin0Geojson, admin1Geojson], cities] = await Promise.all([
  Promise.all(SOURCES.map((source) => cachedText(source.file, source.url))),
  cachedCities(),
]);

const layer = Layer.mergeAll(DatabaseLive(databaseUrl)).pipe(
  Layer.provide(Layer.succeed(PluginIdTag, "api")),
);

const summary = await Effect.runPromise(
  Effect.gen(function* () {
    const db = yield* DatabaseTag;
    const existingCitySlugs = yield* Effect.tryPromise(() =>
      db
        .select({ geonameid: placeAliasesTable.value, slug: placesTable.slug })
        .from(placeAliasesTable)
        .innerJoin(placesTable, eq(placesTable.id, placeAliasesTable.placeId))
        .where(and(eq(placeAliasesTable.kind, "geonames"), eq(placesTable.label, "city"))),
    );
    const catalog = buildPlacesCatalog({
      countryInfo,
      admin1Codes,
      admin0Geojson,
      admin1Geojson,
      cities,
      supranationals: SUPRANATIONALS,
      curatedAliases: CURATED_ALIASES,
      existingCitySlugs,
    } satisfies SeedSources);
    yield* Effect.tryPromise(() => seedPlacesInto(db, catalog));
    const [counts] = yield* Effect.tryPromise(() =>
      db
        .select({
          places: sql<number>`count(*) filter (where true)::int`,
          subdivisions: sql<number>`count(*) filter (where label = 'subdivision')::int`,
          supranationals: sql<number>`count(*) filter (where label = 'supranational')::int`,
          countries: sql<number>`count(*) filter (where label = 'country')::int`,
          cities: sql<number>`count(*) filter (where label = 'city')::int`,
          citiesUnderSubdivision: sql<number>`count(*) filter (where label = 'city' and parent_id in (select id from places where label = 'subdivision'))::int`,
          withBoundary: sql<number>`count(*) filter (where boundary is not null)::int`,
        })
        .from(placesTable),
    );
    return counts;
  }).pipe(Effect.provide(layer)),
);

console.log(
  [
    `[seed-places] done: ${summary.places} places, ${summary.withBoundary} with boundaries`,
    `  supranational → country → subdivision → city`,
    `  ${summary.supranationals} supranationals, ${summary.countries} countries, ${summary.subdivisions} subdivisions`,
    `  ${summary.cities} cities (pins only), ${summary.citiesUnderSubdivision} under a subdivision, ${summary.cities - summary.citiesUnderSubdivision} directly under a country`,
    `  sources: GeoNames (CC BY 4.0, geonames.org), Natural Earth (public domain)`,
  ].join("\n"),
);
process.exit(0);
