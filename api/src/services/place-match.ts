import type { PlaceBoundary } from "../db/schema";

export interface CatalogPlace {
  id: string;
  parentId: string | null;
  name: string;
  label: string | null;
  boundary: PlaceBoundary | null;
  aliases: string[];
}

export interface EventLocation {
  coordinate: { latitude: number; longitude: number } | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

export interface PlaceMatch {
  placeId: string;
  by: "coordinate" | "address";
}

export interface PlaceMatcher {
  match(location: EventLocation): PlaceMatch | null;
  ancestorIds(placeId: string): string[];
}

type Bbox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInBoundary(lng: number, lat: number, boundary: PlaceBoundary): boolean {
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  return polygons.some(
    ([exterior, ...holes]) =>
      !!exterior &&
      pointInRing(lng, lat, exterior) &&
      !holes.some((hole) => pointInRing(lng, lat, hole)),
  );
}

function boundaryBbox(boundary: PlaceBoundary): Bbox | null {
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  let bbox: Bbox | null = null;
  for (const polygon of polygons)
    for (const [lng, lat] of polygon[0] ?? []) {
      if (lng === undefined || lat === undefined) continue;
      bbox = bbox
        ? [
            Math.min(bbox[0], lng),
            Math.min(bbox[1], lat),
            Math.max(bbox[2], lng),
            Math.max(bbox[3], lat),
          ]
        : [lng, lat, lng, lat];
    }
  return bbox;
}

export function placeNameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

function nameKeys(place: CatalogPlace): Set<string> {
  const keys = new Set([placeNameKey(place.name), ...place.aliases.map(placeNameKey)]);
  if (place.label === "country" && regionNames)
    for (const alias of place.aliases)
      if (/^[A-Z]{2}$/.test(alias)) {
        const displayName = regionNames.of(alias);
        if (displayName && displayName !== alias) keys.add(placeNameKey(displayName));
      }
  keys.delete("");
  return keys;
}

export function createPlaceMatcher(catalog: CatalogPlace[]): PlaceMatcher {
  const byId = new Map(catalog.map((place) => [place.id, place] as const));
  const children = new Map<string, CatalogPlace[]>();
  for (const place of catalog)
    if (place.parentId) {
      const siblings = children.get(place.parentId) ?? [];
      siblings.push(place);
      children.set(place.parentId, siblings);
    }
  const keys = new Map(catalog.map((place) => [place.id, nameKeys(place)] as const));
  const bounded = catalog.flatMap((place) => {
    const bbox = place.boundary ? boundaryBbox(place.boundary) : null;
    return place.boundary && bbox ? [{ place, boundary: place.boundary, bbox }] : [];
  });

  function ancestorIds(placeId: string): string[] {
    const chain: string[] = [];
    let cursor: string | null = placeId;
    while (cursor && byId.has(cursor) && !chain.includes(cursor)) {
      chain.push(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    return chain;
  }

  const depth = (placeId: string) => ancestorIds(placeId).length;

  function deepestNamed(rootIds: string[], name: string, labels?: string[]): CatalogPlace | null {
    const key = placeNameKey(name);
    if (!key) return null;
    let best: CatalogPlace | null = null;
    const seen = new Set<string>();
    const queue = rootIds.flatMap((id) => children.get(id) ?? []);
    while (queue.length > 0) {
      const place = queue.shift()!;
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      if (
        (!labels || labels.includes(place.label ?? "")) &&
        keys.get(place.id)?.has(key) &&
        (!best || depth(place.id) > depth(best.id))
      )
        best = place;
      queue.push(...(children.get(place.id) ?? []));
    }
    return best;
  }

  function byCoordinate(coordinate: EventLocation["coordinate"]): CatalogPlace | null {
    if (!coordinate) return null;
    const { longitude: lng, latitude: lat } = coordinate;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    let best: CatalogPlace | null = null;
    for (const { place, boundary, bbox } of bounded) {
      if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
      if (!pointInBoundary(lng, lat, boundary)) continue;
      if (!best || depth(place.id) > depth(best.id)) best = place;
    }
    return best;
  }

  function refineByAddress(base: CatalogPlace | null, location: EventLocation) {
    const countryKey = location.country ? placeNameKey(location.country) : "";
    const country = base
      ? (ancestorIds(base.id)
          .map((id) => byId.get(id)!)
          .find((place) => place.label === "country") ?? null)
      : (catalog.find(
          (place) => place.label === "country" && keys.get(place.id)?.has(countryKey),
        ) ?? null);
    const scope = base ?? country;
    if (!scope) return null;
    const region = location.region
      ? deepestNamed([scope.id], location.region, ["subdivision"])
      : null;
    const city = location.city
      ? (deepestNamed([region?.id ?? scope.id], location.city, ["city"]) ??
        (region ? deepestNamed([scope.id], location.city, ["city"]) : null))
      : null;
    return city ?? region ?? scope;
  }

  return {
    ancestorIds,
    match(location) {
      const base = byCoordinate(location.coordinate);
      const refined = refineByAddress(base, location);
      if (base) {
        const deeper = refined && ancestorIds(refined.id).includes(base.id) ? refined : base;
        return { placeId: deeper.id, by: "coordinate" };
      }
      return refined ? { placeId: refined.id, by: "address" } : null;
    },
  };
}
