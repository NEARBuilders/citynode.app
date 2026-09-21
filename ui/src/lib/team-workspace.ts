import { queryOptions } from "@tanstack/react-query";
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
}

const ROUTE_AREAS: Array<{ prefix: string; area: FeatureArea }> = [
  { prefix: "/dashboard/node", area: "node-operations" },
  { prefix: "/tenant", area: "node-operations" },
  { prefix: "/nodes", area: "node-operations" },
  { prefix: "/things", area: "things" },
  { prefix: "/stake", area: "stake" },
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
  };
}

export function areaForPath(pathname: string): FeatureArea | null {
  const match = ROUTE_AREAS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.area ?? null;
}

export function isPathAllowed(workspace: TeamWorkspace, pathname: string): boolean {
  const area = areaForPath(pathname);
  if (!area || !workspace.allowedAreas) return true;
  return workspace.allowedAreas.includes(area);
}

export function teamWorkspaceQueryOptions(apiClient: ApiClient) {
  return queryOptions({
    queryKey: teamWorkspaceQueryKey,
    queryFn: async () => resolveTeamWorkspace(await apiClient.auth.getContext()),
    staleTime: 30 * 1000,
  });
}
