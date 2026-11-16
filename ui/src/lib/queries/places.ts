import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export function resolvePlaceQueryOptions(api: ApiClient, place: string) {
  return queryOptions({
    queryKey: ["place", place],
    queryFn: () => api.resolvePlace({ place }),
    enabled: place.length > 0,
    staleTime: 30_000,
  });
}

export function placeMapPinsQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: ["place-map-pins"],
    queryFn: () => api.listPlaceMapPins({}),
    staleTime: 60_000,
  });
}

export function placeBoundaryQueryOptions(api: ApiClient, placeId: string) {
  return queryOptions({
    queryKey: ["place-boundary", placeId],
    queryFn: () => api.getPlaceBoundary({ placeId }),
    enabled: placeId.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
