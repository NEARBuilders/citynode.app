import { type FeatureArea, isFeatureArea } from "./feature-areas";
import type { AuthOrganizationContext } from "./lib/auth";

type IsAny<T> = 0 extends 1 & T ? true : false;

type OrganizationContext = NonNullable<AuthOrganizationContext>;

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

export interface TeamAccess {
  teams: WorkspaceTeam[];
  activeTeam: WorkspaceTeam | null;
  bypass: boolean;
  allowedAreas: FeatureArea[] | null;
}

type TeamAccessContext = {
  user?: { role?: string | null } | null;
  organization?: {
    member?: { role?: string | null } | null;
    teams?: readonly WorkspaceTeam[];
    activeTeamId?: string | null;
  } | null;
} | null;

export function resolveTeamAccess(context: TeamAccessContext | undefined): TeamAccess {
  const teams = [...(context?.organization?.teams ?? [])];
  const activeTeam = teams.find((team) => team.id === context?.organization?.activeTeamId) ?? null;
  const orgRole = context?.organization?.member?.role;
  const bypass = context?.user?.role === "admin" || orgRole === "owner" || orgRole === "admin";
  return {
    teams,
    activeTeam,
    bypass,
    allowedAreas: activeTeam && !bypass ? activeTeam.areas.filter(isFeatureArea) : null,
  };
}
