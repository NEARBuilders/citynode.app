import { type FeatureArea, isFeatureArea } from "@/lib/feature-areas";
import { isCommunitySettingsRole } from "@/lib/team-workspace";

export interface CommunityPageViewer {
  signedIn: boolean;
  platformAdmin: boolean;
  inCommunity: boolean;
  orgRole: string | null | undefined;
  teamAreas: readonly FeatureArea[];
  rolePending: boolean;
}

export interface CommunityPageActions {
  joinHint: boolean;
  openCommunity: boolean;
  openEvents: boolean;
  openSetup: boolean;
  openAdmin: boolean;
}

const NONE: CommunityPageActions = {
  joinHint: false,
  openCommunity: false,
  openEvents: false,
  openSetup: false,
  openAdmin: false,
};

export function activeTeamBlocksEvents(areas: readonly string[] | null | undefined): boolean {
  if (!areas) return false;
  const known = areas.filter(isFeatureArea);
  return !known.includes("events") && !known.includes("node-operations");
}

export function communityPageActions(viewer: CommunityPageViewer): CommunityPageActions {
  if (viewer.rolePending) return NONE;
  const leader = viewer.inCommunity && isCommunitySettingsRole(viewer.orgRole);
  const organizer = viewer.inCommunity && !leader && viewer.teamAreas.includes("events");
  const member = viewer.inCommunity && !leader && !organizer;
  const visitor = !viewer.signedIn || (!viewer.inCommunity && !viewer.platformAdmin);
  return {
    joinHint: visitor,
    openCommunity: member,
    openEvents: organizer,
    openSetup: leader,
    openAdmin: viewer.platformAdmin,
  };
}
