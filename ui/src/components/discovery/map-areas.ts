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

export function boundaryBounds(boundary: Boundary): [[number, number], [number, number]] | null {
  const points = boundaryLatLngs(boundary).flat(2);
  if (!points.length) return null;
  const lats = points.map(([lat]) => lat);
  const lngs = points.map(([, lng]) => lng);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  if (east - west > 180) return null;
  return [
    [Math.min(...lats), west],
    [Math.max(...lats), east],
  ];
}
