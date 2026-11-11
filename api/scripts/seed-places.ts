import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { DatabaseLive, DatabaseTag } from "../src/db/layer";
import { places as placesTable } from "../src/db/schema";
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

async function cachedCities(): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cached = join(CACHE_DIR, CITIES.file);
  if (existsSync(cached)) return readFileSync(cached, "utf8");
  const response = await fetch(CITIES.url);
  if (!response.ok) throw new Error(`${CITIES.url} responded ${response.status}`);
  const archive = join(CACHE_DIR, CITIES.archive);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  const text = execFileSync("unzip", ["-p", archive, CITIES.file], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
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

const catalog = buildPlacesCatalog({
  countryInfo,
  admin1Codes,
  admin0Geojson,
  admin1Geojson,
  cities,
  supranationals: SUPRANATIONALS,
  curatedAliases: CURATED_ALIASES,
} satisfies SeedSources);

const layer = Layer.mergeAll(DatabaseLive(databaseUrl)).pipe(
  Layer.provide(Layer.succeed(PluginIdTag, "api")),
);

const summary = await Effect.runPromise(
  Effect.gen(function* () {
    const db = yield* DatabaseTag;
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
