import type { ApiClient } from "@/app";

export type Node = Awaited<ReturnType<ApiClient["listDiscovery"]>>[number];
export type PlacePin = Awaited<ReturnType<ApiClient["listPlaceMapPins"]>>[number];

export const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-85, -180],
  [85, 180],
];

export type MapPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: "community" | "place";
  nodeId?: string;
  slug: string;
  placeId: string | null;
  location?: string | null;
  activated: boolean;
};

function pinCoords(node: Node, places: Map<string, PlacePin>) {
  const place = node.placeId ? places.get(node.placeId) : undefined;
  const latitude = node.latitude ?? place?.latitude ?? null;
  const longitude = node.longitude ?? place?.longitude ?? null;
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

function coverListed(nodes: Node[], places: Map<string, PlacePin>) {
  const covered = new Set<string>();
  const listedNodes = new Set<string>();
  for (const node of nodes) {
    if (!pinCoords(node, places)) continue;
    listedNodes.add(node.nodeId);
    if (node.placeId) covered.add(node.placeId);
  }
  return { covered, listedNodes };
}

export function toPoints(
  nodes: Node[],
  catalog: PlacePin[],
  listed: Node[],
  placePins: PlacePin[],
  showPlaces: boolean,
): MapPoint[] {
  const byId = new Map(catalog.map((place) => [place.id, place]));
  const { covered, listedNodes } = coverListed(listed, byId);
  const community = nodes.flatMap((node) => {
    const coords = pinCoords(node, byId);
    return coords
      ? [
          {
            id: node.nodeId,
            name: node.name,
            latitude: coords.latitude,
            longitude: coords.longitude,
            kind: "community" as const,
            nodeId: node.nodeId,
            slug: node.slug,
            placeId: node.placeId,
            location: node.location,
            activated: true,
          },
        ]
      : [];
  });
  const available = placePins.flatMap((place) =>
    covered.has(place.id) ||
    (place.nodeId && listedNodes.has(place.nodeId)) ||
    (!showPlaces && !place.activated)
      ? []
      : [
          {
            id: place.id,
            name: place.name,
            latitude: place.latitude,
            longitude: place.longitude,
            kind: "place" as const,
            nodeId: place.nodeId ?? undefined,
            slug: place.slug,
            placeId: place.id,
            location: place.name,
            activated: place.activated,
          },
        ],
  );
  return [...community, ...available];
}
