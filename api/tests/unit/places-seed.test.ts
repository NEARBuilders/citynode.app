import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import { placeAliases, places as placesTable } from "@/db/schema";
import { buildPlacesCatalog, type SeedSources, seedPlacesInto } from "@/seed/places-catalog";
import { PlacesLive, PlacesTag } from "@/services/places";
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
  "US\tUSA\t.us\tUSA\tUnited States\tWashington\t9629091\t331000000\tNA\t.us\tUSD\tDollar\t1\t#####\t^\\d{5}$\ten-US\t6252001\tCA,MX\t",
  "RU\tRUS\t.ru\tRUS\tRussia\tMoscow\t6637687\t144000000\tEU\t.ru\tRUB\tRuble\t7\t######\t^(\\d{6})$\tru\t2017370\tCN,UA\tRSTA",
].join("\n");

const admin1Codes = [
  "NG.LA\tLagos\tLagos\t2591381\t6.5241\t3.3790\tADM1\tLagos State\tNG",
  "NG.AB\tAbia\tAbia\t2328863\t5.4\t7.5\tADM1\tAbia\tNG",
  "RU.MO\tMoscow\tMoscow\t524894\t55.7558\t37.6173\tADM1\tMoscow\tRU",
  "US.IL\tIllinois\tIllinois\t4896861",
  "US.NY\tNew York\tNew York\t5128638",
  "US.MO\tMissouri\tMissouri\t4398678",
  "US.MA\tMassachusetts\tMassachusetts\t6254926",
].join("\n");

function cityLine(
  geonameid: string,
  name: string,
  countryCode: string,
  admin1: string,
  population: number,
  latitude = 0,
  longitude = 0,
): string {
  return [
    geonameid,
    name,
    name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    "",
    String(latitude),
    String(longitude),
    "P",
    "PPL",
    countryCode,
    "",
    admin1,
    "",
    "",
    "",
    String(population),
    "",
    "",
    "UTC",
    "2026-01-01",
  ].join("\t");
}

const cityLines = [
  cityLine("4887398", "Chicago", "US", "IL", 2720546, 41.85003, -87.65005),
  cityLine("5128581", "New York City", "US", "NY", 8804190, 40.71427, -74.00597),
  cityLine("4250542", "Springfield", "US", "IL", 114394, 39.80172, -89.64371),
  cityLine("4409896", "Springfield", "US", "MO", 169176, 37.21533, -93.29824),
  cityLine("4951788", "Springfield", "US", "MA", 155929, 42.10148, -72.58981),
  cityLine("2332459", "Lagos", "NG", "LA", 9000000, 6.45407, 3.39467),
  cityLine("524901", "Moscow", "RU", "MO", 10381222, 55.75222, 37.61556),
  cityLine("9000001", "Nigeria", "NG", "AB", 20000),
  cityLine("9000002", "Gotham", "US", "00", 50000),
  cityLine("9000003", "Twin", "US", "IL", 30000),
  cityLine("9000005", "Twin", "US", "IL", 20000),
  cityLine("9000004", "Twin", "US", "IL", 20000),
  cityLine("2988507", "Paris", "FR", "11", 2138551),
  cityLine("9000006", "Zürich", "RU", "MO", 15000),
];

const cities = cityLines.join("\n");

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
    cities,
    curatedAliases: [{ value: "nyc", geonameid: "5128581" }],
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

  it("is independent of the order of the cities file", () => {
    const reversed = { ...sources(), cities: [...cityLines].reverse().join("\n") };
    expect(buildPlacesCatalog(reversed)).toEqual(buildPlacesCatalog(sources()));
  });

  it("builds pin-only cities under their subdivision", () => {
    const catalog = buildPlacesCatalog(sources());
    expect(catalog.places.find((p) => p.slug === "chicago")).toEqual({
      slug: "chicago",
      name: "Chicago",
      label: "city",
      latitude: 41.85,
      longitude: -87.65,
      boundary: null,
      parentSlug: "us-illinois",
    });
    expect(catalog.places.find((p) => p.slug === "new-york-city")?.parentSlug).toBe("us-new-york");
    expect(catalog.places.find((p) => p.slug === "lagos")?.parentSlug).toBe("ng-lagos");
    expect(catalog.places.find((p) => p.slug === "moscow")?.parentSlug).toBe("ru-moscow");
    expect(catalog.places.find((p) => p.slug === "zurich")?.name).toBe("Zürich");
  });

  it("parents a city to its country when its subdivision is unknown", () => {
    const catalog = buildPlacesCatalog(sources());
    expect(catalog.places.find((p) => p.slug === "gotham")?.parentSlug).toBe("united-states");
  });

  it("skips cities whose country is not in the catalog", () => {
    const catalog = buildPlacesCatalog(sources());
    expect(catalog.places.find((p) => p.name === "Paris")).toBeUndefined();
    expect(catalog.aliases.find((a) => a.value === "2988507")).toBeUndefined();
  });

  it("gives the most populous city the plain slug and disambiguates the rest", () => {
    const catalog = buildPlacesCatalog(sources());
    const springfields = catalog.places
      .filter((p) => p.name === "Springfield")
      .map((p) => [p.slug, p.parentSlug]);
    expect(springfields).toEqual([
      ["springfield", "us-missouri"],
      ["us-ma-springfield", "us-massachusetts"],
      ["us-il-springfield", "us-illinois"],
    ]);
  });

  it("prefixes a city whose name is taken by a country", () => {
    const catalog = buildPlacesCatalog(sources());
    expect(catalog.places.find((p) => p.slug === "nigeria")?.label).toBe("country");
    expect(catalog.places.find((p) => p.slug === "ng-nigeria")).toMatchObject({
      label: "city",
      parentSlug: "ng-abia",
    });
  });

  it("falls back to the geonameid when country and subdivision still collide", () => {
    const catalog = buildPlacesCatalog(sources());
    const twins = catalog.places.filter((p) => p.name === "Twin").map((p) => p.slug);
    expect(twins).toEqual(["twin", "us-il-twin", "us-il-twin-9000005"]);
  });

  it("adds geonames aliases for cities and curated short forms", () => {
    const catalog = buildPlacesCatalog(sources());
    expect(catalog.aliases).toContainEqual({ value: "4887398", kind: "geonames", slug: "chicago" });
    expect(catalog.aliases).toContainEqual({
      value: "4250542",
      kind: "geonames",
      slug: "us-il-springfield",
    });
    expect(catalog.aliases).toContainEqual({
      value: "nyc",
      kind: "curated",
      slug: "new-york-city",
    });
  });

  it("rejects a curated alias for a city that is not in the cities file", () => {
    expect(() =>
      buildPlacesCatalog({ ...sources(), curatedAliases: [{ value: "gone", geonameid: "1" }] }),
    ).toThrow(/unknown city/);
  });

  it("keeps the slug a city was seeded with even if populations reorder", () => {
    const catalog = buildPlacesCatalog({
      ...sources(),
      existingCitySlugs: [
        { geonameid: "4951788", slug: "springfield" },
        { geonameid: "4409896", slug: "us-mo-springfield" },
        { geonameid: "2988507", slug: "paris" },
      ],
    });
    const springfields = catalog.places
      .filter((p) => p.name === "Springfield")
      .map((p) => [p.slug, p.parentSlug]);
    expect(springfields).toEqual([
      ["us-mo-springfield", "us-missouri"],
      ["springfield", "us-massachusetts"],
      ["us-il-springfield", "us-illinois"],
    ]);
    expect(catalog.places.find((p) => p.slug === "paris")).toBeUndefined();
  });

  it("skips city rows with blank coordinates or a non-numeric id", () => {
    const catalog = buildPlacesCatalog({
      ...sources(),
      cities: [
        cities,
        cityLine("9000007", "Nowhere", "US", "IL", 90000).replace("\t0\t0\t", "\t\t\t"),
        cityLine("abc", "Lettered", "US", "IL", 90000),
      ].join("\n"),
    });
    expect(catalog.places.find((p) => p.name === "Nowhere")).toBeUndefined();
    expect(catalog.places.find((p) => p.name === "Lettered")).toBeUndefined();
  });

  it("rejects a curated alias that collides with an iso code or slug", () => {
    expect(() =>
      buildPlacesCatalog({
        ...sources(),
        curatedAliases: [{ value: "ng", geonameid: "2332459" }],
      }),
    ).toThrow(/collides/);
    expect(() =>
      buildPlacesCatalog({
        ...sources(),
        curatedAliases: [{ value: "springfield", geonameid: "4250542" }],
      }),
    ).toThrow(/collides/);
  });

  it("resolvePlace finds seeded cities by slug, short form and geonameid", async () => {
    const temp = createTempDb("api-places-cities-");
    cleanup = temp.cleanup;
    const database = DatabaseLive(temp.url);
    const layer = Layer.mergeAll(PlacesLive.pipe(Layer.provide(database)), database).pipe(
      Layer.provide(Layer.succeed(PluginIdTag, "api")),
    );
    const catalog = buildPlacesCatalog(sources());

    const resolved = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseTag;
        const places = yield* PlacesTag;
        yield* Effect.tryPromise(() => seedPlacesInto(db, catalog));
        const lookup = (place: string) =>
          places.resolve({ place }).pipe(Effect.map((r) => r?.place.slug ?? null));
        const illinois = yield* Effect.tryPromise(() =>
          db.select().from(placesTable).where(sql`${placesTable.slug} = 'us-illinois'`),
        );
        const chicago = yield* places.resolve({ place: "chicago" });
        return {
          chicago: yield* lookup("chicago"),
          chicagoUpper: yield* lookup("Chicago"),
          newYork: yield* lookup("new-york-city"),
          nyc: yield* lookup("nyc"),
          nycUpper: yield* lookup("NYC"),
          springfield: yield* lookup("springfield"),
          springfieldIl: yield* lookup("us-il-springfield"),
          springfieldIlById: yield* lookup("geonames:4250542"),
          chicagoParent: chicago?.place.parentId,
          illinoisId: illinois[0]?.id,
          chicagoLabel: chicago?.place.label,
        };
      }).pipe(Effect.provide(layer)),
    );

    expect(resolved).toMatchObject({
      chicago: "chicago",
      chicagoUpper: "chicago",
      newYork: "new-york-city",
      nyc: "new-york-city",
      nycUpper: "new-york-city",
      springfield: "springfield",
      springfieldIl: "us-il-springfield",
      springfieldIlById: "us-il-springfield",
      chicagoLabel: "city",
    });
    expect(resolved.chicagoParent).toBe(resolved.illinoisId);
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

    expect(placeRows).toHaveLength(24);
    expect(aliasRows).toHaveLength(30);
    expect(secondRunUpdatedAt).toEqual(firstRunUpdatedAt);
    expect(parentIds.get("cis")).toBeNull();
    const bySlug = new Map(placeRows.map((row) => [row.slug, row] as const));
    expect(parentIds.get("russia")).toBe(bySlug.get("cis")?.id);
    expect(parentIds.get("ng-lagos")).toBe(bySlug.get("nigeria")?.id);
    expect(parentIds.get("ng-abia")).toBe(bySlug.get("nigeria")?.id);
    expect(parentIds.get("ru-moscow")).toBe(bySlug.get("russia")?.id);
    expect(parentIds.get("chicago")).toBe(bySlug.get("us-illinois")?.id);
    expect(parentIds.get("gotham")).toBe(bySlug.get("united-states")?.id);
    expect(bySlug.get("chicago")?.boundary).toBeNull();
    const cis = bySlug.get("cis");
    expect(cis?.boundary).toMatchObject({ type: "MultiPolygon" });
  });
});
