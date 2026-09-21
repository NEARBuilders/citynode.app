import type { DecoratedMiddleware } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import type { FeatureArea } from "../feature-areas";
import { resolveTeamAccess, type WorkspaceTeam } from "../team-access-policy";
import type { AuthContext } from "./auth";

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
    { activeTeam: WorkspaceTeam | null },
    any,
    any,
    any
  >;

  const requireTeam = builder.middleware(
    async ({ context, next }: { context: AuthContext; next: any }) => {
      requireOrganizationMember(context);
      const { activeTeam, bypass } = resolveTeamAccess(context);
      if (!activeTeam && !bypass) {
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
      const { activeTeam, allowedAreas } = resolveTeamAccess(context);
      if (
        activeTeam &&
        allowedAreas !== null &&
        !areas.some((area) => allowedAreas.includes(area))
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
