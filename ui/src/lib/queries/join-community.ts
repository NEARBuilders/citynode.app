import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { ApiClient, AuthClient } from "@/app";
import { nodeQueryKeys } from "@/lib/queries/nodes";
import { organizationQueryKeys } from "@/lib/queries/organizations";
import { placeQueryKeys } from "@/lib/queries/places";
import { tenantQueryKeys } from "@/lib/queries/tenants";
import {
  createWorkspaceSynchronization,
  type WorkspaceSynchronizationDependencies,
} from "@/lib/workspace-synchronization";

export interface JoinCommunityDependencies {
  api: ApiClient;
  auth: AuthClient;
  queryClient: QueryClient;
  router: WorkspaceSynchronizationDependencies["router"];
}

export function joinCommunityQueryOptions(
  { api, auth, queryClient, router }: JoinCommunityDependencies,
  place: string,
  userId: string | undefined,
) {
  return queryOptions({
    queryKey: ["join-community", place, userId ?? null],
    queryFn: async () => {
      const activation = await api.activateCommunity({ place });
      if (!activation.alreadyActivated) {
        void queryClient.invalidateQueries({ queryKey: placeQueryKeys.resolution(place) });
      }
      await api.joinCommunity({ placeId: activation.placeId });
      queryClient.removeQueries({ queryKey: nodeQueryKeys.joinStates() });
      await createWorkspaceSynchronization({ auth, queryClient, router })
        .synchronize({ queryKeys: [organizationQueryKeys.all, tenantQueryKeys.all] })
        .catch(() => undefined);
      return activation.slug;
    },
    enabled: !!place && !!userId,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
