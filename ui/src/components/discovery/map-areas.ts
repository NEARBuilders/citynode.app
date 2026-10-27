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
