import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
export type NextStepId =
  | "save-account"
  | "choose-org"
  | "start-community"
  | "open-community"
  | "payouts"
  | "launch-node"
  | "admin"
  | "stake"
  | "explore";

export interface NextStep {
  id: NextStepId;
  title: string;
  description: string;
  actionLabel: string;
}

export interface NextStepsState {
  isAnonymous: boolean;
  hasPasskey: boolean;
  hasNear: boolean;
  organizationCount: number;
  activeOrganizationName: string | null;
  community: { name: string; tenantId: string } | null;
  canManageCommunity: boolean;
  canOrganizeEvents: boolean;
  isAdmin: boolean;
}

export function getNextSteps(
  state: NextStepsState,
  t: AppTranslator = translateEnglishAppMessage,
): NextStep[] {
  const steps: NextStep[] = [];

  if (state.isAnonymous && !state.hasPasskey && !state.hasNear) {
    steps.push({
      id: "save-account",
      title: t("dashboard.saveAccount"),
      description: t("dashboard.passkeyHint"),
      actionLabel: t("common.addPasskey"),
    });
  }

  if (state.isAdmin) {
    steps.push({
      id: "launch-node",
      title: t("dashboard.launchNode"),
      description: t("dashboard.launchNodeHint"),
      actionLabel: t("dashboard.launchNode"),
    });
    steps.push({
      id: "admin",
      title: t("dashboard.adminQueue"),
      description: t("dashboard.adminQueueHint"),
      actionLabel: t("common.openAdmin"),
    });
  }

  if (state.organizationCount === 0) {
    if (!state.isAdmin) {
      steps.push({
        id: "start-community",
        title: t("dashboard.startCommunity"),
        description: t("dashboard.startCommunityHint"),
        actionLabel: t("dashboard.startCommunity"),
      });
    }
  } else if (!state.activeOrganizationName) {
    steps.push({
      id: "choose-org",
      title: t("dashboard.chooseOrg"),
      description: t("dashboard.orgCount", { count: state.organizationCount }),
      actionLabel: t("common.choose"),
    });
  } else if (!state.community) {
    steps.push({
      id: "start-community",
      title: t("dashboard.startCommunity"),
      description: t("dashboard.startCommunityHint"),
      actionLabel: t("dashboard.startCommunity"),
    });
  } else if (state.canManageCommunity || state.canOrganizeEvents || state.isAdmin) {
    steps.push({
      id: "open-community",
      title: t("dashboard.openCommunity"),
      description: t("dashboard.communityTasks", { name: state.community.name }),
      actionLabel: t("common.open"),
    });
    if (state.canManageCommunity) {
      steps.push({
        id: "payouts",
        title: t("ownerActions.payouts"),
        description: t("ownerActions.payoutsHint"),
        actionLabel: t("common.open"),
      });
    }
  } else {
    steps.push({
      id: "open-community",
      title: t("dashboard.openCommunityNamed", { name: state.community.name }),
      description: t("dashboard.memberCommunityHint"),
      actionLabel: t("common.open"),
    });
  }

  steps.push({
    id: "stake",
    title: t("dashboard.stake"),
    description: t("dashboard.stakeHint"),
    actionLabel: t("common.stake"),
  });

  if (!state.community) {
    steps.push({
      id: "explore",
      title: t("dashboard.explore"),
      description: t("dashboard.exploreHint"),
      actionLabel: t("common.explore"),
    });
  }

  return steps;
}

export type NodeSetupStepId = "map" | "profile" | "event" | "qr";

export interface NodeSetupStep {
  id: NodeSetupStepId;
  done: boolean;
}

export interface NodeSetupState {
  profile: {
    published: boolean;
    latitude: number | null;
    summary: string;
    channels: readonly unknown[];
  } | null;
  eventCount: number;
  onboardingCodeCount: number;
}

export function getNodeSetupSteps(state: NodeSetupState): NodeSetupStep[] {
  const profile = state.profile;
  return [
    { id: "map", done: !!profile?.published && profile.latitude !== null },
    { id: "profile", done: !!profile && profile.channels.length > 0 && !!profile.summary.trim() },
    { id: "event", done: state.eventCount > 0 },
    { id: "qr", done: state.onboardingCodeCount > 0 },
  ];
}
