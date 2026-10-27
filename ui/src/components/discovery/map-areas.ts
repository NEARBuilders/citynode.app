import type { ApiClient } from "@/app";

type Node = Awaited<ReturnType<ApiClient["listDiscovery"]>>[number];
type Boundary = NonNullable<Node["boundary"]>;
export type AreaLatLngs = [number, number][][][];

export function boundaryLatLngs(boundary: Boundary, offset = 0): AreaLatLngs {
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  return polygons.map((rings) =>
    rings.map((ring) => ring.map(([lng, lat]) => [lat, lng + offset] as [number, number])),
  );
}

export function mapAreas(nodes: Node[]) {
  return nodes.flatMap((node) => (node.boundary ? [{ node, boundary: node.boundary }] : []));
}

function extent(points: [number, number][], shift: number) {
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  for (const [lat, raw] of points) {
    const lng = raw < 0 ? raw + shift : raw;
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return { south, north, west, east };
}

export function boundaryBounds(boundary: Boundary): [[number, number], [number, number]] | null {
  const points = boundaryLatLngs(boundary).flat(2);
  if (!points.length) return null;
  const plain = extent(points, 0);
  const box = plain.east - plain.west > 180 ? extent(points, 360) : plain;
  if (box.east - box.west > 180) return null;
  return [
    [box.south, box.west],
    [box.north, box.east],
  ];
}
