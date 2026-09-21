import { queryOptions } from "@tanstack/react-query";
import { type FeatureArea, isFeatureArea } from "api/feature-areas";
import type { ApiClient } from "@/app";

export interface WorkspaceTeam {
  id: string;
  name: string;
  areas: string[];
}

export interface TeamWorkspace {
  teams: WorkspaceTeam[];
  activeTeam: WorkspaceTeam | null;
  allowedAreas: FeatureArea[] | null;
}

interface TeamContextSource {
  user?: { role?: string | null } | null;
  organization?: {
    member?: { role?: string | null } | null;
    teams?: WorkspaceTeam[];
    activeTeamId?: string | null;
  } | null;
}

const BYPASS_ORG_ROLES = ["owner", "admin"];

const ROUTE_AREAS: Array<{ prefix: string; area: FeatureArea }> = [
  { prefix: "/dashboard/node", area: "node-operations" },
  { prefix: "/tenant", area: "node-operations" },
  { prefix: "/nodes", area: "node-operations" },
  { prefix: "/things", area: "things" },
  { prefix: "/stake", area: "stake" },
];

export const teamWorkspaceQueryKey = ["team-workspace"] as const;

export function resolveTeamWorkspace(context: TeamContextSource | null | undefined): TeamWorkspace {
  const teams = context?.organization?.teams ?? [];
  const activeTeamId = context?.organization?.activeTeamId ?? null;
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? null;
  const orgRole = context?.organization?.member?.role ?? null;
  const bypass =
    context?.user?.role === "admin" || (!!orgRole && BYPASS_ORG_ROLES.includes(orgRole));
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
