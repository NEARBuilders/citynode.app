import { type FeatureArea, isFeatureArea } from "./feature-areas";
import type { TeamJoinClosedReason } from "./services/team-join-requests";

export interface UpstreamTeam {
  id: string;
  name: string;
  areas: string[];
}

export function recognizedAreas(areas: readonly string[]): FeatureArea[] {
  return areas.filter(isFeatureArea);
}

export function isJoinableTeam(team: UpstreamTeam | undefined): team is UpstreamTeam {
  return !!team && recognizedAreas(team.areas).length > 0;
}

export function closureReason(
  request: { teamId: string; requesterUserId: string },
  community: { memberIds: ReadonlySet<string>; teams: ReadonlyMap<string, UpstreamTeam> },
): TeamJoinClosedReason | null {
  if (!community.memberIds.has(request.requesterUserId)) return "requester_left";
  const team = community.teams.get(request.teamId);
  if (!team) return "team_deleted";
  if (!isJoinableTeam(team)) return "team_not_joinable";
  return null;
}

export function memberDisplayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.includes("@")) return null;
  return trimmed;
}
