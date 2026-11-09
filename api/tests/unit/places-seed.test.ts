import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import { placeAliases, places as placesTable } from "@/db/schema";
import { buildPlacesCatalog, type SeedSources, seedPlacesInto } from "@/seed/places-catalog";

const countryInfo = [
  "#ISO\tISO3\tIANA\tFIPS\tCountry\tCapital\tArea\tPopulation\tContinent\ttld\tCurrencyCode\tCurrencyName\tPhone\tPostalFormat\tPostalRegex\tLanguages\tgeonameid\tneighbours\tEquivalentFipsCode",
  "NG\tNGA\t.ng\tNGA\tNigeria\tAbuja\t356669\t223000000\tAF\t.ng\tNGN\tNaira\t234\t######\t^(\\d{6})$\ten\t2328926\tTD,CM\tNIGA",
  "RU\tRUS\t.ru\tRUS\tRussia\tMoscow\t6637687\t144000000\tEU\t.ru\tRUB\tRuble\t7\t######\t^(\\d{6})$\tru\t2017370\tCN,UA\tRSTA",
].join("\n");

const admin1Codes = [
  "NG.LA\tLagos\tLagos\t2591381\t6.5241\t3.3790\tADM1\tLagos State\tNG",
  "RU.MO\tMoscow\tMoscow\t524894\t55.7558\t37.6173\tADM1\tMoscow\tRU",
].join("\n");

const admin0Geojson = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { ISO_A2: "NG", NAME: "Nigeria" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2.7, 6.3],
            [14.0, 6.3],
            [14.0, 13.9],
            [2.7, 13.9],
            [2.7, 6.3],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { ISO_A2: "-99", ISO_A2_EH: "RU", NAME: "Russia" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [19.6, 54.7],
              [180.0, 54.7],
              [180.0, 81.9],
              [19.6, 81.9],
              [19.6, 54.7],
            ],
          ],
        ],
      },
    },
  ],
});

const admin1Geojson = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { iso_a2: "NG", name: "Lagos" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2.9, 6.2],
            [4.4, 6.2],
            [4.4, 6.8],
            [2.9, 6.8],
            [2.9, 6.2],
          ],
        ],
      },
    },
  ],
});

function sources(): SeedSources {
  return {
    countryInfo,
    admin1Codes,
    admin0Geojson,
    admin1Geojson,
    supranationals: [
      {
        slug: "cis",
        name: "Commonwealth of Independent States",
        memberIso2: ["RU"],
      },
    ],
  };
}

let activeDir: string | null = null;

afterEach(() => {
  if (activeDir) {
    rmSync(activeDir, { recursive: true, force: true });
    activeDir = null;
  }
});

describe("buildPlacesCatalog", () => {
  it("builds countries with boundaries, geonames and iso aliases", () => {
    const catalog = buildPlacesCatalog(sources());

    const nigeria = catalog.places.find((p) => p.slug === "nigeria");
    expect(nigeria).toMatchObject({
      slug: "nigeria",
      name: "Nigeria",
      label: "country",
      parentSlug: null,
      latitude: 10.1,
      longitude: 8.35,
    });
    expect(nigeria?.boundary).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [2.7, 6.3],
          [14, 6.3],
          [14, 13.9],
          [2.7, 13.9],
          [2.7, 6.3],
        ],
      ],
    });

    const nigeriaAliases = catalog.aliases.filter((a) => a.slug === "nigeria");
    expect(nigeriaAliases).toContainEqual({ value: "2328926", kind: "geonames", slug: "nigeria" });
    expect(nigeriaAliases).toContainEqual({ value: "NG", kind: "iso", slug: "nigeria" });
  });

  it("matches admin-0 iso fallbacks when ISO_A2 is -99", () => {
    const catalog = buildPlacesCatalog(sources());
    const russia = catalog.places.find((p) => p.slug === "russia");
    expect(russia?.boundary).toMatchObject({ type: "MultiPolygon" });
  });

  it("builds first-level subdivisions with centroids and best-effort boundaries", () => {
    const catalog = buildPlacesCatalog(sources());

    const lagos = catalog.places.find((p) => p.slug === "ng-lagos");
    expect(lagos).toMatchObject({
      slug: "ng-lagos",
      name: "Lagos",
      label: "subdivision",
      parentSlug: "nigeria",
      latitude: 6.5,
      longitude: 3.65,
    });
    expect(lagos?.boundary).toMatchObject({ type: "Polygon" });

    const moscow = catalog.places.find((p) => p.slug === "ru-moscow");
    expect(moscow).toMatchObject({
      slug: "ru-moscow",
      parentSlug: "russia",
      latitude: null,
      longitude: null,
    });
    expect(moscow?.boundary).toBeNull();
  });

  it("adds geonames aliases for subdivisions", () => {
    const catalog = buildPlacesCatalog(sources());
    expect(catalog.aliases).toContainEqual({
      value: "2591381",
      kind: "geonames",
      slug: "ng-lagos",
    });
  });

  it("curated supranationals parent their member states", () => {
    const catalog = buildPlacesCatalog(sources());

    const cis = catalog.places.find((p) => p.slug === "cis");
    expect(cis).toMatchObject({
      slug: "cis",
      name: "Commonwealth of Independent States",
      label: "supranational",
      parentSlug: null,
    });
    expect(catalog.places.find((p) => p.slug === "russia")?.parentSlug).toBe("cis");
    expect(catalog.places.find((p) => p.slug === "nigeria")?.parentSlug).toBeNull();
  });

  it("is deterministic across runs", () => {
    expect(buildPlacesCatalog(sources())).toEqual(buildPlacesCatalog(sources()));
  });

  it("seeds idempotently: running twice leaves identical rows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "api-places-seed-"));
    activeDir = dir;
    const layer = Layer.mergeAll(DatabaseLive(`pglite:${dir}`)).pipe(
      Layer.provide(Layer.succeed(PluginIdTag, "api")),
    );
    const catalog = buildPlacesCatalog(sources());

    const { placeRows, aliasRows, parentIds } = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseTag;
        yield* Effect.tryPromise(() => seedPlacesInto(db, catalog));
        yield* Effect.tryPromise(() => seedPlacesInto(db, catalog));
        const placeRows = yield* Effect.tryPromise(() => db.select().from(placesTable));
        const aliasRows = yield* Effect.tryPromise(() => db.select().from(placeAliases));
        const parentIds = new Map(placeRows.map((row) => [row.slug, row.parentId] as const));
        return { placeRows, aliasRows, parentIds };
      }).pipe(Effect.provide(layer)),
    );

    expect(placeRows).toHaveLength(5);
    expect(aliasRows).toHaveLength(6);
    expect(parentIds.get("cis")).toBeNull();
    const bySlug = new Map(placeRows.map((row) => [row.slug, row] as const));
    expect(parentIds.get("russia")).toBe(bySlug.get("cis")?.id);
    expect(parentIds.get("ng-lagos")).toBe(bySlug.get("nigeria")?.id);
  });
});
