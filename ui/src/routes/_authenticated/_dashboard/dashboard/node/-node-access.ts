import type { AuthRequestContext } from "@/lib/auth";
import type { FeatureArea } from "@/lib/feature-areas";
import { areasAllowPath, isAreaInView, isCommunitySettingsRole } from "@/lib/team-workspace";

export function hasNodeProposalReviewPermission(role: string | null | undefined): boolean {
  return role === "admin";
}

export function resolveCommunityTools(
  context: AuthRequestContext | null | undefined,
  allowedAreas: readonly FeatureArea[] | null,
  nodeId: string,
): { inFinanceTeam: boolean; canOrganize: boolean } {
  const teams = context?.organization?.teams ?? [];
  const inFinanceTeam =
    teams.some((team) => team.areas.includes("finance")) && isAreaInView(allowedAreas, "finance");
  const isOrganizer =
    isCommunitySettingsRole(context?.organization?.member?.role) ||
    teams.some((team) => team.areas.includes("events"));
  const canOrganize = isOrganizer && areasAllowPath(allowedAreas, `/nodes/${nodeId}/content`);
  return { inFinanceTeam, canOrganize };
}
