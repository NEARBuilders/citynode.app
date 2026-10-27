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
