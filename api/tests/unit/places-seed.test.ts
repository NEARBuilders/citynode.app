import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import { placeAliases, places as placesTable } from "@/db/schema";
import { buildPlacesCatalog, type SeedSources, seedPlacesInto } from "@/seed/places-catalog";
import { createTempDb } from "./test-harness";

let cleanup: (() => void) | null = null;

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

const countryInfo = [
  "#ISO\tISO3\tIANA\tFIPS\tCountry\tCapital\tArea\tPopulation\tContinent\ttld\tCurrencyCode\tCurrencyName\tPhone\tPostalFormat\tPostalRegex\tLanguages\tgeonameid\tneighbours\tEquivalentFipsCode",
  "NG\tNGA\t.ng\tNGA\tNigeria\tAbuja\t356669\t223000000\tAF\t.ng\tNGN\tNaira\t234\t######\t^(\\d{6})$\ten\t2328926\tTD,CM\tNIGA",
  "RU\tRUS\t.ru\tRUS\tRussia\tMoscow\t6637687\t144000000\tEU\t.ru\tRUB\tRuble\t7\t######\t^(\\d{6})$\tru\t2017370\tCN,UA\tRSTA",
].join("\n");

const admin1Codes = [
  "NG.LA\tLagos\tLagos\t2591381\t6.5241\t3.3790\tADM1\tLagos State\tNG",
  "NG.AB\tAbia\tAbia\t2328863\t5.4\t7.5\tADM1\tAbia\tNG",
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
            [8.35, 6.3],
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
      properties: {
        ISO_A2: "-99",
        ISO_A2_EH: "RU",
        NAME: "Russia",
        LABEL_X: 44.686469,
        LABEL_Y: 58.249357,
      },
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
          [
            [
              [-180.0, 64.0],
              [-170.0, 64.0],
              [-170.0, 72.0],
              [-180.0, 72.0],
              [-180.0, 64.0],
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
      // No gn_id — exercises the name-slug fallback (gn_name matches geonames
      // "Lagos" after slug normalization).
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
    {
      type: "Feature",
      properties: { iso_a2: "RU", gn_name: "Moscow", gn_id: 524894 },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [30.0, 54.0],
              [40.0, 54.0],
              [40.0, 58.0],
              [30.0, 58.0],
              [30.0, 54.0],
            ],
          ],
          [
            [
              [150.0, 54.0],
              [155.0, 54.0],
              [155.0, 56.0],
              [150.0, 56.0],
              [150.0, 54.0],
            ],
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

describe("buildPlacesCatalog", () => {
  it("builds countries with simplified boundaries, geonames and iso aliases", () => {
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
    // The fixture ring carries a collinear midpoint on its bottom edge; the
    // seeded boundary is the simplified four-corner ring.
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
    expect(nigeriaAliases).toContainEqual({ value: "NGA", kind: "iso", slug: "nigeria" });
  });

  it("pins antimeridian-spanning countries from LABEL_X/LABEL_Y, not the bbox midpoint", () => {
    const catalog = buildPlacesCatalog(sources());
    const russia = catalog.places.find((p) => p.slug === "russia");
    // The fixture spans 19.6°E..180 and 180..-170°W, so a bbox midpoint lands
    // near lng 0 (Norwegian Sea); Natural Earth's label pin does not.
    expect(russia?.latitude).toBe(58.2494);
    expect(russia?.longitude).toBe(44.6865);
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

    // Subdivisions have no Natural Earth label props — the pin is the largest
    // polygon's centroid, not the bbox midpoint (which would land at lng 92.5).
    const moscow = catalog.places.find((p) => p.slug === "ru-moscow");
    expect(moscow).toMatchObject({
      slug: "ru-moscow",
      parentSlug: "russia",
      latitude: 56,
      longitude: 35,
    });
    expect(moscow?.boundary).toMatchObject({ type: "MultiPolygon" });

    const abia = catalog.places.find((p) => p.slug === "ng-abia");
    expect(abia).toMatchObject({
      slug: "ng-abia",
      parentSlug: "nigeria",
      latitude: null,
      longitude: null,
    });
    expect(abia?.boundary).toBeNull();
  });

  it("adds geonames aliases for subdivisions", () => {
    const catalog = buildPlacesCatalog(sources());
    expect(catalog.aliases).toContainEqual({
      value: "2591381",
      kind: "geonames",
      slug: "ng-lagos",
    });
  });

  it("merges member-state boundaries into supranational boundaries", () => {
    const catalog = buildPlacesCatalog(sources());

    const cis = catalog.places.find((p) => p.slug === "cis");
    expect(cis?.boundary).toMatchObject({ type: "MultiPolygon" });
    expect(cis?.boundary?.type === "MultiPolygon" && cis.boundary.coordinates).toHaveLength(2);
    // Largest member polygon = the Russian mainland part; the pin is its
    // centroid, not a bbox midpoint over all members.
    expect(cis?.latitude).toBe(68.3);
    expect(cis?.longitude).toBe(99.8);
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

  it("seeds idempotently: running twice leaves identical rows and timestamps", async () => {
    const temp = createTempDb("api-places-seed-");
    cleanup = temp.cleanup;
    const layer = Layer.mergeAll(DatabaseLive(temp.url)).pipe(
      Layer.provide(Layer.succeed(PluginIdTag, "api")),
    );
    const catalog = buildPlacesCatalog(sources());

    const { firstRunUpdatedAt, secondRunUpdatedAt, placeRows, aliasRows, parentIds } =
      await Effect.runPromise(
        Effect.gen(function* () {
          const db = yield* DatabaseTag;
          yield* Effect.tryPromise(() => seedPlacesInto(db, catalog));
          const firstRunUpdatedAt = new Map(
            (yield* Effect.tryPromise(() => db.select().from(placesTable))).map(
              (row) => [row.slug, row.updatedAt] as const,
            ),
          );
          yield* Effect.tryPromise(() => seedPlacesInto(db, catalog));
          const placeRows = yield* Effect.tryPromise(() => db.select().from(placesTable));
          const aliasRows = yield* Effect.tryPromise(() => db.select().from(placeAliases));
          const parentIds = new Map(placeRows.map((row) => [row.slug, row.parentId] as const));
          const secondRunUpdatedAt = new Map(
            placeRows.map((row) => [row.slug, row.updatedAt] as const),
          );
          return { firstRunUpdatedAt, secondRunUpdatedAt, placeRows, aliasRows, parentIds };
        }).pipe(Effect.provide(layer)),
      );

    expect(placeRows).toHaveLength(6);
    expect(aliasRows).toHaveLength(9);
    expect(secondRunUpdatedAt).toEqual(firstRunUpdatedAt);
    expect(parentIds.get("cis")).toBeNull();
    const bySlug = new Map(placeRows.map((row) => [row.slug, row] as const));
    expect(parentIds.get("russia")).toBe(bySlug.get("cis")?.id);
    expect(parentIds.get("ng-lagos")).toBe(bySlug.get("nigeria")?.id);
    expect(parentIds.get("ng-abia")).toBe(bySlug.get("nigeria")?.id);
    expect(parentIds.get("ru-moscow")).toBe(bySlug.get("russia")?.id);
    const cis = bySlug.get("cis");
    expect(cis?.boundary).toMatchObject({ type: "MultiPolygon" });
  });
});
