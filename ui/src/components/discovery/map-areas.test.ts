import { describe, expect, it } from "vitest";
import {
  boundaryBounds,
  boundaryLatLngs,
  mapAreas,
  showsMapAreas,
  simplifyBoundary,
} from "./map-areas";

const square = [
  [
    [70, 10],
    [80, 10],
    [80, 20],
    [70, 10],
  ],
];

function node(placeId: string | null) {
  return { nodeId: crypto.randomUUID(), placeId } as Parameters<typeof mapAreas>[0][number];
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

  it("keeps every part of a multipolygon", () => {
    const areas = boundaryLatLngs({ type: "MultiPolygon", coordinates: [square, square] });
    expect(areas).toHaveLength(2);
    expect(areas[1]?.[0]?.[0]).toEqual([10, 70]);
  });
});

describe("showsMapAreas", () => {
  it("keeps pins-only at world zoom and draws areas from region zoom", () => {
    expect(showsMapAreas(2)).toBe(false);
    expect(showsMapAreas(4)).toBe(false);
    expect(showsMapAreas(5)).toBe(true);
  });
});

describe("simplifyBoundary", () => {
  it("thins a dense ring at region zoom and keeps it whole when close in", () => {
    const ring = Array.from({ length: 17 }, (_, index) => [70 + index, 10]);
    ring.push(ring[0]!);
    const dense = { type: "Polygon" as const, coordinates: [ring] };
    expect(simplifyBoundary(dense, 5).coordinates[0]?.length).toBeLessThan(ring.length);
    expect(simplifyBoundary(dense, 8).coordinates[0]).toHaveLength(ring.length);
  });
});

describe("mapAreas", () => {
  it("keeps only communities whose linked place has geometry", () => {
    const placeId = crypto.randomUUID();
    const linked = node(placeId);
    const boundaries: Parameters<typeof mapAreas>[1] = new Map([
      [placeId, { type: "Polygon" as const, coordinates: square }],
    ]);
    expect(
      mapAreas([linked, node(null), node(crypto.randomUUID())], boundaries).map(
        (area) => area.node.nodeId,
      ),
    ).toEqual([linked.nodeId]);
  });
});

describe("boundaryBounds", () => {
  it("returns the south-west and north-east corners of an outline", () => {
    expect(boundaryBounds({ type: "Polygon", coordinates: square })).toEqual([
      [10, 70],
      [20, 80],
    ]);
  });

  it("measures outlines that cross the antimeridian the short way round", () => {
    const east = [
      [
        [170, 60],
        [180, 60],
        [180, 70],
        [170, 60],
      ],
    ];
    const west = [
      [
        [-180, 60],
        [-170, 60],
        [-170, 70],
        [-180, 60],
      ],
    ];
    expect(boundaryBounds({ type: "MultiPolygon", coordinates: [east, west] })).toEqual([
      [60, 170],
      [70, 190],
    ]);
  });

  it("keeps the USA with its Aleutians in one view", () => {
    const aleutians = [
      [
        [172, 52],
        [180, 52],
        [180, 55],
        [172, 52],
      ],
    ];
    const mainland = [
      [
        [-125, 30],
        [-70, 30],
        [-70, 48],
        [-125, 30],
      ],
    ];
    expect(boundaryBounds({ type: "MultiPolygon", coordinates: [mainland, aleutians] })).toEqual([
      [30, 172],
      [55, 290],
    ]);
  });

  it("skips outlines that span most of the globe either way", () => {
    const band = [
      [
        [-100, 0],
        [0, 0],
        [100, 0],
        [-100, 0],
      ],
    ];
    expect(boundaryBounds({ type: "Polygon", coordinates: band })).toBeNull();
  });
});
