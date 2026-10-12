import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import type { ApiClient } from "@/app";
import type { AuthRequestContext } from "@/lib/auth";
import { type FeatureArea, isFeatureArea } from "@/lib/feature-areas";

type IsAny<T> = 0 extends 1 & T ? true : false;

type OrganizationContext = NonNullable<AuthRequestContext["organization"]>;

type GeneratedTeam = OrganizationContext extends { teams: ReadonlyArray<infer Team> }
  ? Team
  : never;

type FallbackTeam = { id: string; name: string; areas: string[] };

export type WorkspaceTeam =
  IsAny<GeneratedTeam> extends true
    ? FallbackTeam
    : GeneratedTeam extends FallbackTeam
      ? GeneratedTeam
      : FallbackTeam;

export interface TeamWorkspace {
  teams: WorkspaceTeam[];
  activeTeam: WorkspaceTeam | null;
  allowedAreas: FeatureArea[] | null;
  canManageOrganization?: boolean;
}

const ROUTE_AREAS: Array<{ path: string; exact?: boolean; areas: FeatureArea[] }> = [
  { path: "/dashboard/node", exact: true, areas: ["node-operations", "finance"] },
  { path: "/dashboard/node", areas: ["node-operations"] },
  { path: "/tenant", areas: ["node-operations"] },
  { path: "/nodes", areas: ["node-operations"] },
  { path: "/stake", areas: ["stake"] },
];

export const teamWorkspaceQueryKey = ["team-workspace"] as const;

export function resolveTeamWorkspace(
  context: AuthRequestContext | null | undefined,
): TeamWorkspace {
  const teams: WorkspaceTeam[] = [...(context?.organization?.teams ?? [])];
  const activeTeam = teams.find((team) => team.id === context?.organization?.activeTeamId) ?? null;
  const orgRole = context?.organization?.member?.role;
  const bypass = context?.user?.role === "admin" || orgRole === "owner" || orgRole === "admin";
  return {
    teams,
    activeTeam,
    allowedAreas: activeTeam && !bypass ? activeTeam.areas.filter(isFeatureArea) : null,
    canManageOrganization: bypass,
  };
}

export function areasForPath(pathname: string): FeatureArea[] | null {
  const match = ROUTE_AREAS.find(({ path, exact }) =>
    exact
      ? pathname === path || pathname === `${path}/`
      : pathname === path || pathname.startsWith(`${path}/`),
  );
  return match?.areas ?? null;
}

export function areasAllowPath(
  allowedAreas: readonly FeatureArea[] | null,
  pathname: string,
): boolean {
  const areas = areasForPath(pathname);
  if (!areas || !allowedAreas) return true;
  return areas.some((area) => allowedAreas.includes(area));
}

export function isPathAllowed(workspace: TeamWorkspace, pathname: string): boolean {
  return areasAllowPath(workspace.allowedAreas, pathname);
}

export function teamWorkspaceQueryOptions(apiClient: ApiClient) {
  return queryOptions({
    queryKey: teamWorkspaceQueryKey,
    queryFn: async () => resolveTeamWorkspace(await apiClient.auth.getContext()),
    staleTime: 30 * 1000,
  });
}

export async function requireTeamArea({
  context,
  location,
}: {
  context: { apiClient: ApiClient; queryClient: QueryClient };
  location: { pathname: string };
}) {
  const areas = areasForPath(location.pathname);
  if (!areas) return;
  const workspace = await context.queryClient
    .ensureQueryData(teamWorkspaceQueryOptions(context.apiClient))
    .catch(() => null);
  if (workspace && !isPathAllowed(workspace, location.pathname)) {
    throw redirect({ to: "/dashboard", search: { restricted: areas[0] } });
  }
}
