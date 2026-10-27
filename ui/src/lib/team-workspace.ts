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
  staleActiveTeamId: string | null;
  allowedAreas: FeatureArea[] | null;
  canManageOrganization?: boolean;
}

const ROUTE_AREAS: Array<{ path: string; areas: FeatureArea[] }> = [
  { path: "/tenant", areas: ["node-operations"] },
  { path: "/nodes", areas: ["node-operations", "events"] },
];

export const teamWorkspaceQueryKey = ["team-workspace"] as const;

export function resolveTeamWorkspace(
  context: AuthRequestContext | null | undefined,
): TeamWorkspace {
  const teams: WorkspaceTeam[] = (context?.organization?.teams ?? []).filter(hasFeatureArea);
  const activeTeamId = context?.organization?.activeTeamId ?? null;
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? null;
  const bypass = canManageCommunity(context);
  return {
    teams,
    activeTeam,
    staleActiveTeamId: activeTeamId && !activeTeam ? activeTeamId : null,
    allowedAreas: activeTeam && !bypass ? activeTeam.areas.filter(isFeatureArea) : null,
    canManageOrganization: bypass,
  };
}

export function hasFeatureArea(team: { areas: readonly string[] }): boolean {
  return team.areas.some(isFeatureArea);
}

/** Organization roles that manage the community's settings (mirrors the API's rule). */
export function isCommunitySettingsRole(
  role: string | null | undefined,
): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}

export function canManageCommunity(context: AuthRequestContext | null | undefined): boolean {
  return (
    context?.user?.role === "admin" || isCommunitySettingsRole(context?.organization?.member?.role)
  );
}

export function areasForPath(pathname: string): FeatureArea[] | null {
  const match = ROUTE_AREAS.find(
    ({ path }) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return match?.areas ?? null;
}

export function areasAllowPath(
  allowedAreas: readonly FeatureArea[] | null,
  pathname: string,
): boolean {
  const areas = areasForPath(pathname);
  if (!areas) return true;
  return areas.some((area) => isAreaInView(allowedAreas, area));
}

export function isAreaInView(allowedAreas: readonly FeatureArea[] | null, area: FeatureArea) {
  return !allowedAreas || allowedAreas.includes(area);
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

export function canOrganizeEvents(
  context: AuthRequestContext | null | undefined,
  { includePlatformAdmin = true }: { includePlatformAdmin?: boolean } = {},
): boolean {
  if (
    includePlatformAdmin
      ? canManageCommunity(context)
      : isCommunitySettingsRole(context?.organization?.member?.role)
  ) {
    return true;
  }
  if (!context?.organization?.member?.role) return false;
  return (context.organization.teams ?? []).some((team) => team.areas.includes("events"));
}
