import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { useAppTranslation } from "@/i18n/runtime";
import manifestJson from "@/manifest.gen.json" with { type: "json" };
import {
  appendPluginSidebarItems,
  buildNavItems,
  filterSidebarByRole,
  filterSidebarByRoutes,
  getUserRole,
  type ManifestRoute,
  pluginNavToSidebar,
  routePathsFromManifest,
} from "./nav-items";
import { useIdentity } from "./use-identity";

const shippedRoutePaths = routePathsFromManifest(
  (manifestJson as { routes: ManifestRoute[] }).routes,
);

export function useCanCurate(enabled: boolean) {
  const api = useApiClient();
  const studio = useQuery({
    queryKey: ["discover"],
    queryFn: () => api.getDiscoveryStudio(),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  return studio.isSuccess;
}

export function useShellNav(
  isAdmin: boolean,
  pluginNav?: { items: Parameters<typeof pluginNavToSidebar>[0] },
) {
  const translate = useAppTranslation();
  const { user, organizations, membership, isOrganizationsLoading } = useIdentity();
  const signedIn = Boolean(user);
  const canCurate = useCanCurate(signedIn && !isAdmin);
  const role = getUserRole(signedIn, isAdmin);

  const builtin = buildNavItems(
    {
      hasOrganization: isAdmin
        ? isOrganizationsLoading || organizations.length > 0
        : membership.status !== "none",
      canCurate,
      isAdmin,
    },
    translate,
  );
  const withRoutes = filterSidebarByRoutes(builtin, shippedRoutePaths);
  const withPlugins = pluginNav?.items?.length
    ? appendPluginSidebarItems(withRoutes, pluginNavToSidebar(pluginNav.items))
    : withRoutes;
  return filterSidebarByRole(withPlugins, role);
}
