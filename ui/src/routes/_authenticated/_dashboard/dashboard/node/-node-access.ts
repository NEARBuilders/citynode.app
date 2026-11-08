import type { AuthRequestContext } from "@/lib/auth";
import type { FeatureArea } from "@/lib/feature-areas";
import { areasAllowPath, canOrganizeEvents, isInFinanceTeam } from "@/lib/team-workspace";

export function hasNodeProposalReviewPermission(role: string | null | undefined): boolean {
  return role === "admin";
}

export function resolveCommunityTools(
  context: AuthRequestContext | null | undefined,
  allowedAreas: readonly FeatureArea[] | null,
  nodeId: string,
): { inFinanceTeam: boolean; canOrganize: boolean } {
  const inFinanceTeam = isInFinanceTeam(context, allowedAreas);
  const canOrganize =
    canOrganizeEvents(context, { includePlatformAdmin: false }) &&
    areasAllowPath(allowedAreas, `/nodes/${nodeId}/content`);
  return { inFinanceTeam, canOrganize };
}
