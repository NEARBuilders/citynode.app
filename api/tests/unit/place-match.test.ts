import { describe, expect, it } from "vitest";
import type { PlaceBoundary } from "@/db/schema";
import { type CatalogPlace, createPlaceMatcher, pointInBoundary } from "@/services/place-match";

function box(minLng: number, minLat: number, maxLng: number, maxLat: number): number[][] {
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ];
}

function polygon(...rings: number[][][]): PlaceBoundary {
  return { type: "Polygon", coordinates: rings };
}

function place(
  id: string,
  name: string,
  label: string | null,
  parentId: string | null,
  boundary: PlaceBoundary | null = null,
  aliases: string[] = [],
): CatalogPlace {
  return { id, name, label, parentId, boundary, aliases };
}

const catalog = [
  place("americas", "Americas", "supranational", null, polygon(box(-170, -60, -30, 75))),
  place("usa", "United States of America", "country", "americas", polygon(box(-125, 24, -66, 50)), [
    "US",
    "USA",
  ]),
  place("illinois", "Illinois", "subdivision", "usa", polygon(box(-91.5, 37, -87.5, 42.5))),
  place("chicago", "Chicago", "city", "illinois"),
  place("new-york", "New York", "subdivision", "usa", polygon(box(-79.8, 40.5, -71.8, 45))),
  place("nyc", "New York", "city", "new-york"),
  place("canada", "Canada", "country", "americas", polygon(box(-141, 50, -52, 83)), ["CA"]),
];

describe("pointInBoundary", () => {
  it("excludes points inside a hole", () => {
    const ring = polygon(box(0, 0, 10, 10), box(4, 4, 6, 6));
    expect(pointInBoundary(1, 1, ring)).toBe(true);
    expect(pointInBoundary(5, 5, ring)).toBe(false);
    expect(pointInBoundary(11, 5, ring)).toBe(false);
  });

  it("checks every polygon of a MultiPolygon", () => {
    const multi: PlaceBoundary = {
      type: "MultiPolygon",
      coordinates: [[box(0, 0, 1, 1)], [box(5, 5, 6, 6)]],
    };
    expect(pointInBoundary(5.5, 5.5, multi)).toBe(true);
    expect(pointInBoundary(3, 3, multi)).toBe(false);
  });
});

describe("createPlaceMatcher", () => {
  const matcher = createPlaceMatcher(catalog);

  it("associates coordinates with the deepest containing boundary", () => {
    expect(matcher.match({ coordinate: { latitude: 40, longitude: -89 }, city: "Peoria" })).toEqual(
      { placeId: "illinois", by: "coordinate" },
    );
  });

  it("refines a coordinate match to a named city underneath it", () => {
    expect(
      matcher.match({ coordinate: { latitude: 41.88, longitude: -87.63 }, city: "Chicago" }),
    ).toEqual({ placeId: "chicago", by: "coordinate" });
    expect(
      matcher.match({ coordinate: { latitude: 40.71, longitude: -74 }, city: "New York" }),
    ).toEqual({ placeId: "nyc", by: "coordinate" });
  });

  it("ignores a city name that is not under the coordinate match", () => {
    expect(
      matcher.match({ coordinate: { latitude: 40.71, longitude: -74 }, city: "Chicago" }),
    ).toEqual({ placeId: "new-york", by: "coordinate" });
  });

  it("falls back to the structured address when there are no coordinates", () => {
    expect(
      matcher.match({
        coordinate: null,
        city: "Chicago",
        region: "Illinois",
        country: "United States",
      }),
    ).toEqual({ placeId: "chicago", by: "address" });
    expect(matcher.match({ coordinate: null, region: "Illinois", country: "US" })).toEqual({
      placeId: "illinois",
      by: "address",
    });
    expect(matcher.match({ coordinate: null, country: "Canada" })).toEqual({
      placeId: "canada",
      by: "address",
    });
  });

  it("leaves online and unrecognised events unmatched", () => {
    expect(matcher.match({ coordinate: null })).toBeNull();
    expect(matcher.match({ coordinate: null, city: "Chicago" })).toBeNull();
    expect(matcher.match({ coordinate: null, country: "Atlantis" })).toBeNull();
    expect(matcher.match({ coordinate: { latitude: -80, longitude: 0 } })).toBeNull();
  });

  it("finds a root-level country by name", () => {
    const flat = createPlaceMatcher([
      place("fr", "France", "country", null, null, ["FR"]),
      place("idf", "Île-de-France", "subdivision", "fr"),
    ]);
    expect(flat.match({ coordinate: null, region: "Ile-de-France", country: "France" })).toEqual({
      placeId: "idf",
      by: "address",
    });
  });

  it("walks ancestors nearest first", () => {
    expect(matcher.ancestorIds("chicago")).toEqual(["chicago", "illinois", "usa", "americas"]);
  });
});
