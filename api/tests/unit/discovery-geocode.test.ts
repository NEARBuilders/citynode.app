import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  countryBoundary,
  GeocodeLive,
  GeocodeTag,
  nominatimUserAgent,
  profilePlace,
  shouldGeocodeProfile,
} from "../../src/services/discovery-geocode";

const identity = {
  domain: "citynode.app",
  repository: "https://github.com/NEARBuilders/citynode.app",
};

const runGeocode = <A>(program: Effect.Effect<A, never, GeocodeTag>) =>
  Effect.runPromise(program.pipe(Effect.provide(GeocodeLive(identity))));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shouldGeocodeProfile", () => {
  it("geocodes when location is set and coordinates are empty", () => {
    expect(
      shouldGeocodeProfile({
        location: "Karachi",
        latitude: null,
        longitude: null,
        geocodedLocation: null,
      }),
    ).toBe(true);
  });

  it("geocodes when coordinates exist without a matching geocoded location", () => {
    expect(
      shouldGeocodeProfile({
        location: "Karachi",
        latitude: 24.86,
        longitude: 67.01,
        geocodedLocation: null,
      }),
    ).toBe(true);
  });

  it("re-geocodes when the location changes after a prior geocode", () => {
    expect(
      shouldGeocodeProfile({
        location: "Lahore",
        latitude: 24.86,
        longitude: 67.01,
        geocodedLocation: "Karachi",
      }),
    ).toBe(true);
  });

  it("skips when coordinates already match the geocoded location", () => {
    expect(
      shouldGeocodeProfile({
        location: "Karachi",
        latitude: 24.86,
        longitude: 67.01,
        geocodedLocation: "Karachi",
      }),
    ).toBe(false);
  });
});

const outline = [
  [
    [68, 8],
    [97, 8],
    [97, 35],
    [68, 8],
  ],
];

describe("profilePlace", () => {
  it("uses the location when it is set", () => {
    expect(profilePlace({ location: " Mumbai ", region: "India" }, "country")).toBe("Mumbai");
  });

  it("falls back to the region for country communities", () => {
    expect(profilePlace({ location: "", region: " India " }, "country")).toBe("India");
  });

  it("keeps states, cities and unknown kinds off the map without a location", () => {
    expect(profilePlace({ location: "", region: "IL" }, "state")).toBe("");
    expect(profilePlace({ location: "", region: "Pakistan" }, "city")).toBe("");
    expect(profilePlace({ location: "", region: "Pakistan" }, null)).toBe("");
  });
});

describe("countryBoundary", () => {
  it("keeps the outline of a country", () => {
    expect(
      countryBoundary({
        addresstype: "country",
        geojson: { type: "Polygon", coordinates: outline },
      }),
    ).toEqual({ type: "Polygon", coordinates: outline });
    expect(
      countryBoundary({
        addresstype: "country",
        geojson: { type: "MultiPolygon", coordinates: [outline] },
      }),
    ).toEqual({ type: "MultiPolygon", coordinates: [outline] });
  });

  it("ignores cities, states and point results", () => {
    expect(
      countryBoundary({ addresstype: "city", geojson: { type: "Polygon", coordinates: outline } }),
    ).toBeUndefined();
    expect(
      countryBoundary({ addresstype: "state", geojson: { type: "Polygon", coordinates: outline } }),
    ).toBeUndefined();
    expect(
      countryBoundary({ addresstype: "country", geojson: { type: "Point", coordinates: [1, 2] } }),
    ).toBeUndefined();
  });
});

describe("nominatimUserAgent", () => {
  it("uses the runtime domain and repository", () => {
    expect(nominatimUserAgent(identity)).toBe(
      "citynode.app/discovery-geocode (https://github.com/NEARBuilders/citynode.app; geocode)",
    );
  });
});

describe("geocodeLocation", () => {
  it("returns coordinates from Nominatim and caches them", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "24.86", lon: "67.01" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const { first, second, userAgent } = await runGeocode(
      Effect.gen(function* () {
        const geocode = yield* GeocodeTag;
        const first = yield* geocode.geocode("Karachi");
        const second = yield* geocode.geocode("Karachi");
        return { first, second, userAgent: nominatimUserAgent(identity) };
      }),
    );

    expect(first).toEqual({ ok: true, latitude: 24.86, longitude: 67.01 });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "User-Agent": userAgent,
    });
  });

  it("asks Nominatim for a simplified outline and returns it for countries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          lat: "22.35",
          lon: "78.66",
          addresstype: "country",
          geojson: { type: "Polygon", coordinates: outline },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runGeocode(
      Effect.gen(function* () {
        const geocode = yield* GeocodeTag;
        yield* geocode.geocode("India");
        return yield* geocode.geocode("India");
      }),
    );

    expect(result).toEqual({
      ok: true,
      latitude: 22.35,
      longitude: 78.66,
      boundary: { type: "Polygon", coordinates: outline },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("polygon_geojson")).toBe("1");
    expect(url.searchParams.get("polygon_threshold")).toBe("0.05");
  });

  it("returns not_found when Nominatim has no match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
    expect(
      await runGeocode(
        Effect.gen(function* () {
          const geocode = yield* GeocodeTag;
          return yield* geocode.geocode("nowhere-land-xyz");
        }),
      ),
    ).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("returns unavailable when Nominatim errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => [],
      }),
    );
    expect(
      await runGeocode(
        Effect.gen(function* () {
          const geocode = yield* GeocodeTag;
          return yield* geocode.geocode("Karachi");
        }),
      ),
    ).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("rate-limits distinct Nominatim lookups to at most ~1 request/sec", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "1", lon: "2" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const started = Date.now();
    await runGeocode(
      Effect.gen(function* () {
        const geocode = yield* GeocodeTag;
        yield* geocode.geocode("Place A");
        yield* geocode.geocode("Place B");
      }),
    );
    const elapsed = Date.now() - started;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(1100);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.headers).toMatchObject({
        "User-Agent": nominatimUserAgent(identity),
      });
    }
  });

  it("serves concurrent identical lookups from cache without a second request", async () => {
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = runGeocode(
      Effect.gen(function* () {
        const geocode = yield* GeocodeTag;
        return yield* Effect.all([geocode.geocode("Karachi"), geocode.geocode("Karachi")], {
          concurrency: 2,
        });
      }),
    );

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    resolveFetch({
      ok: true,
      json: async () => [{ lat: "24.86", lon: "67.01" }],
    });

    expect(await results).toEqual([
      { ok: true, latitude: 24.86, longitude: 67.01 },
      { ok: true, latitude: 24.86, longitude: 67.01 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
