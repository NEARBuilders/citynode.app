import { describe, expect, it } from "vitest";
import { boundaryBounds, boundaryLatLngs, mapAreas } from "./map-areas";

const square = [
  [
    [70, 10],
    [80, 10],
    [80, 20],
    [70, 10],
  ],
];

function node(boundary: Parameters<typeof boundaryLatLngs>[0] | null) {
  return { nodeId: crypto.randomUUID(), boundary } as Parameters<typeof mapAreas>[0][number];
}

describe("boundaryLatLngs", () => {
  it("flips GeoJSON lng/lat into Leaflet lat/lng for a polygon", () => {
    expect(boundaryLatLngs({ type: "Polygon", coordinates: square })).toEqual([
      [
        [
          [10, 70],
          [10, 80],
          [20, 80],
          [10, 70],
        ],
      ],
    ]);
  });

  it("keeps every part of a multipolygon and shifts it for world copies", () => {
    const areas = boundaryLatLngs({ type: "MultiPolygon", coordinates: [square, square] }, 360);
    expect(areas).toHaveLength(2);
    expect(areas[1]?.[0]?.[0]).toEqual([10, 430]);
  });
});

describe("mapAreas", () => {
  it("keeps only communities with a country outline", () => {
    const country = node({ type: "Polygon", coordinates: square });
    expect(mapAreas([country, node(null)]).map((area) => area.node.nodeId)).toEqual([
      country.nodeId,
    ]);
  });
});

describe("boundaryBounds", () => {
  it("returns the south-west and north-east corners of an outline", () => {
    expect(boundaryBounds({ type: "Polygon", coordinates: square })).toEqual([
      [10, 70],
      [20, 80],
    ]);
  });

  it("skips outlines that wrap across the antimeridian", () => {
    const east = [
      [
        [172, 52],
        [180, 52],
        [180, 55],
        [172, 52],
      ],
    ];
    const west = [
      [
        [-125, 30],
        [-70, 30],
        [-70, 48],
        [-125, 30],
      ],
    ];
    expect(boundaryBounds({ type: "MultiPolygon", coordinates: [west, east] })).toBeNull();
  });
});
