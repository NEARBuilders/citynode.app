import type { DecoratedMiddleware } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import type { FeatureArea } from "./feature-areas";
import type {
  AuthPluginContext as AuthContext,
  AuthOrganizationContext,
} from "./lib/auth-types.gen";

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
}

export type TeamAccessContext = {
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
  return { teams, activeTeam, bypass };
}

export function canUseTeamArea(
  context: TeamAccessContext | undefined,
  area: FeatureArea,
  access: TeamAccess = resolveTeamAccess(context),
): boolean {
  if (access.bypass) return true;
  if (!context?.organization?.member?.role) return false;
  return access.teams.some((team) => team.areas.includes(area));
}

export function teamAreaForbidden(areas: readonly FeatureArea[]): ORPCError<"FORBIDDEN", unknown> {
  return new ORPCError("FORBIDDEN", {
    message: `Ask an organization owner or admin to add you to a team with ${areas.join(" or ")}.`,
    data: { requiredPermissions: [...areas] },
  });
}

/**
 * Gates a route on the caller being granted one of the given areas (see
 * `canUseTeamArea`). Assumes `requireAuth` already ran on the route — it only
 * adds the team-specific check on top, rather than re-deriving auth from scratch.
 */
export function createRequireTeamArea(builder: any) {
  type TeamAreaMiddleware = DecoratedMiddleware<
    AuthContext,
    { activeTeam: WorkspaceTeam | null },
    any,
    any,
    any
  >;

  return <TAreas extends readonly FeatureArea[]>(...areas: TAreas) =>
    builder.middleware(async ({ context, next }: { context: AuthContext; next: any }) => {
      const access = resolveTeamAccess(context);
      if (!areas.some((area) => canUseTeamArea(context, area, access))) {
        throw teamAreaForbidden(areas);
      }
      return next({ context: { activeTeam: access.activeTeam } });
    }) as TeamAreaMiddleware;
}
