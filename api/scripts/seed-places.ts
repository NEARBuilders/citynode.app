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
import { buildPlacesCatalog, type SeedSources, seedPlacesInto } from "../src/seed/places-catalog";

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
    file: "ne_50m_admin_1_states_provinces.geojson",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson",
  },
];

const SUPRANATIONALS = [
  {
    slug: "cis",
    name: "Commonwealth of Independent States",
    memberIso2: ["AM", "AZ", "BY", "KZ", "KG", "MD", "RU", "TJ", "UZ"],
  },
];

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

const [countryInfo, admin1Codes, admin0Geojson, admin1Geojson] = await Promise.all(
  SOURCES.map((source) => cachedText(source.file, source.url)),
);

const catalog = buildPlacesCatalog({
  countryInfo,
  admin1Codes,
  admin0Geojson,
  admin1Geojson,
  supranationals: SUPRANATIONALS,
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
          countries: sql<number>`count(*) filter (where label = 'country')::int`,
          withBoundary: sql<number>`count(*) filter (where boundary is not null)::int`,
        })
        .from(placesTable),
    );
    return counts;
  }).pipe(Effect.provide(layer)),
);

console.log(
  `[seed-places] done: ${summary.places} places (${summary.countries} countries, ${summary.subdivisions} subdivisions), ${summary.withBoundary} with boundaries`,
);
process.exit(0);
