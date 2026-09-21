import type { DecoratedMiddleware } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import type { FeatureArea } from "../feature-areas";
import type { AuthContext } from "./auth";

const BYPASS_ORG_ROLES = ["owner", "admin"];

export interface TeamWorkspace {
  id: string;
  name: string;
  areas: string[];
}

export function bypassesTeamRestrictions(context: AuthContext): boolean {
  if (context.user?.role === "admin") return true;
  const orgRole = context.organization?.member?.role;
  return !!orgRole && BYPASS_ORG_ROLES.includes(orgRole);
}

export function resolveActiveTeam(context: AuthContext): TeamWorkspace | null {
  const organization = context.organization;
  const activeTeamId = organization?.activeTeamId;
  if (!activeTeamId) return null;
  return organization?.teams?.find((team) => team.id === activeTeamId) ?? null;
}

function requireAuthenticated(context: AuthContext) {
  if (!context.user || !context.userId) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Authentication required",
      data: { authType: "session", hint: "Sign in to continue" },
    });
  }
}

function requireOrganizationMember(context: AuthContext) {
  requireAuthenticated(context);
  if (!context.organization?.activeOrganizationId) {
    throw new ORPCError("FORBIDDEN", {
      message: "Active organization required",
      data: { hint: "Select or create an organization" },
    });
  }
}

export function createTeamMiddleware(builder: any) {
  type TeamMiddleware = DecoratedMiddleware<
    AuthContext,
    { activeTeam: TeamWorkspace | null },
    any,
    any,
    any
  >;

  const requireTeam = builder.middleware(
    async ({ context, next }: { context: AuthContext; next: any }) => {
      requireOrganizationMember(context);
      const activeTeam = resolveActiveTeam(context);
      if (!activeTeam && !bypassesTeamRestrictions(context)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Active team required. Switch to one of your teams in this organization.",
          data: { action: "switch-team" },
        });
      }
      return next({ context: { activeTeam } });
    },
  ) as TeamMiddleware;

  const requireTeamArea = <TAreas extends readonly FeatureArea[]>(...areas: TAreas) =>
    builder.middleware(async ({ context, next }: { context: AuthContext; next: any }) => {
      requireAuthenticated(context);
      const activeTeam = resolveActiveTeam(context);
      if (
        activeTeam &&
        !bypassesTeamRestrictions(context) &&
        !areas.some((area) => activeTeam.areas.includes(area))
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: `Your active team "${activeTeam.name}" is not granted ${areas.join(" or ")}. Switch teams or ask an organization owner to grant it.`,
          data: { requiredPermissions: [...areas], action: "switch-team" },
        });
      }
      return next({ context: { activeTeam } });
    }) as TeamMiddleware;

  return { requireTeam, requireTeamArea };
}
