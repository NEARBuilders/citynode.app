import type { ApiClient } from "@/app";

export type Boundary = NonNullable<
  Awaited<ReturnType<ApiClient["listPlaceBoundaries"]>>[number]["boundary"]
>;
type AreaNode = { nodeId: string; placeId: string | null };
export type AreaLatLngs = [number, number][][][];
export type BoundaryMap = Map<string, Boundary>;

export const REGION_AREA_ZOOM = 5;

export function showsMapAreas(zoom: number) {
  return zoom >= REGION_AREA_ZOOM;
}

function ringStep(zoom: number) {
  if (zoom >= 8) return 1;
  if (zoom >= 6) return 4;
  return 8;
}

function simplifyRing(ring: number[][], zoom: number): number[][] {
  const step = ringStep(zoom);
  if (step === 1 || ring.length <= 8) return ring;
  const simplified = ring.filter((_, index) => index % step === 0 || index === ring.length - 1);
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) simplified.push(first);
  return simplified.length >= 4 ? simplified : ring;
}

export function simplifyBoundary(boundary: Boundary, zoom: number): Boundary {
  if (boundary.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: boundary.coordinates.map((ring) => simplifyRing(ring, zoom)),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: boundary.coordinates.map((polygon) =>
      polygon.map((ring) => simplifyRing(ring, zoom)),
    ),
  };
}

export function boundaryLatLngs(boundary: Boundary): AreaLatLngs {
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  return polygons.map((rings) =>
    rings.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number])),
  );
}

export function mapAreas<T extends AreaNode>(nodes: T[], boundaries: BoundaryMap) {
  return nodes.flatMap((node) => {
    const boundary = node.placeId ? boundaries.get(node.placeId) : undefined;
    return boundary ? [{ node, boundary }] : [];
  });
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
