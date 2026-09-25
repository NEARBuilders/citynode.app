import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { resolveTeamWorkspace } from "@/lib/team-workspace";
import {
  appendPluginSidebarItems,
  buildNavItems,
  filterSidebarByArea,
  filterSidebarByRole,
  getUserRole,
  type MyCommunityNav,
  pluginNavToSidebar,
} from "./nav-items";
import { useIdentity } from "./use-identity";
import { useTeamWorkspace } from "./use-team-workspace";

export function useMyCommunityNav(activeOrgId: string | null | undefined, enabled: boolean) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["shell-my-community", activeOrgId],
    enabled: enabled && Boolean(activeOrgId),
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async (): Promise<MyCommunityNav> => {
      const tenant = await api.resolveTenantByOrgId({ orgId: activeOrgId ?? "" }).catch(() => null);
      if (!tenant) return { tenantId: null, nodeId: null };
      const nodes = await api.listNodes({ tenantId: tenant.id }).catch(() => []);
      const first = [...nodes].sort((a, b) => a.name.localeCompare(b.name))[0];
      return { tenantId: tenant.id, nodeId: first?.id ?? null };
    },
  });
}

export function useCanCurate(enabled: boolean) {
  const api = useApiClient();
  const studio = useQuery({
    queryKey: ["discover"],
    queryFn: () => api.getDiscoveryStudio(),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return studio.isSuccess;
}

export function useShellNav(
  isAdmin: boolean,
  pluginNav?: { items: Parameters<typeof pluginNavToSidebar>[0] },
) {
  const { user, activeOrg, activeOrgId } = useIdentity();
  const signedIn = Boolean(user);
  const { data: workspace = resolveTeamWorkspace(null) } = useTeamWorkspace(signedIn);
  const nodeAreaAllowed =
    !workspace.allowedAreas || workspace.allowedAreas.includes("node-operations");
  const { data: community } = useMyCommunityNav(activeOrgId, signedIn && nodeAreaAllowed);
  const canCurate = useCanCurate(signedIn && !isAdmin);
  const role = getUserRole(signedIn, isAdmin);

  const builtin = buildNavItems({
    activeOrgSlug: activeOrg?.slug ?? null,
    community: community ?? null,
    canManageOrganization: workspace.canManageOrganization ?? false,
    canCurate,
    isAdmin,
  });
  const withPlugins = pluginNav?.items?.length
    ? appendPluginSidebarItems(builtin, pluginNavToSidebar(pluginNav.items))
    : builtin;
  return filterSidebarByArea(filterSidebarByRole(withPlugins, role), workspace.allowedAreas);
}
