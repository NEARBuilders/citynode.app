import { isCommunitySettingsRole } from "@/lib/team-workspace";

export interface CommunityPageViewer {
  signedIn: boolean;
  platformAdmin: boolean;
  inCommunity: boolean;
  orgRole: string | null | undefined;
  teamAreas: readonly string[];
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
