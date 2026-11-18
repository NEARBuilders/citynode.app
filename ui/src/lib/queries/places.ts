import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export const placeQueryKeys = {
  all: ["places"] as const,
  roots: () => [...placeQueryKeys.all, "roots"] as const,
  children: (placeId: string) => [...placeQueryKeys.all, "children", placeId] as const,
  resolution: (place: string) => [...placeQueryKeys.all, "resolve", place] as const,
};

export function rootPlacesQueryOptions(apiClient: ApiClient) {
  return queryOptions({
    queryKey: placeQueryKeys.roots(),
    queryFn: () => apiClient.listRootPlaces({}),
    staleTime: 5 * 60_000,
  });
}

export function placeChildrenQueryOptions(apiClient: ApiClient, placeId: string) {
  return queryOptions({
    queryKey: placeQueryKeys.children(placeId),
    queryFn: () => apiClient.listPlaceChildren({ placeId }),
    enabled: !!placeId,
    staleTime: 5 * 60_000,
  });
}

export function placeResolutionQueryOptions(apiClient: ApiClient, place: string) {
  return queryOptions({
    queryKey: placeQueryKeys.resolution(place),
    queryFn: () => apiClient.resolvePlace({ place }),
    enabled: !!place,
    staleTime: 30_000,
  });
}

export function placeMapPinsQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: [...placeQueryKeys.all, "map-pins"] as const,
    queryFn: () => api.listPlaceMapPins({}),
    staleTime: 60_000,
  });
}

export function placeBoundaryQueryOptions(api: ApiClient, placeId: string) {
  return queryOptions({
    queryKey: [...placeQueryKeys.all, "boundary", placeId] as const,
    queryFn: () => api.getPlaceBoundary({ placeId }),
    enabled: placeId.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
