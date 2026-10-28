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
  membership: "unknown" | "none" | "open" | "choose" | "active";
  communityCount: number;
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

  if (state.membership === "none") {
    if (!state.isAdmin) {
      steps.push({
        id: "start-community",
        title: t("dashboard.startCommunity"),
        description: t("dashboard.startCommunityHint"),
        actionLabel: t("dashboard.startCommunity"),
      });
    }
  } else if (state.membership === "choose") {
    steps.push({
      id: "choose-org",
      title: t("dashboard.chooseCommunity"),
      description: t("dashboard.communityCount", { count: state.communityCount }),
      actionLabel: t("common.choose"),
    });
  } else if (state.membership !== "unknown") {
    steps.push(...communitySteps(state, t));
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

function communitySteps(state: NextStepsState, t: AppTranslator): NextStep[] {
  if (!state.community) {
    return [
      {
        id: "start-community",
        title: t("dashboard.startCommunity"),
        description: t("dashboard.startCommunityHint"),
        actionLabel: t("dashboard.startCommunity"),
      },
    ];
  }
  if (state.canManageCommunity || state.canOrganizeEvents || state.isAdmin) {
    return [
      {
        id: "open-community",
        title: t("dashboard.openCommunity"),
        description: t("dashboard.communityTasks", { name: state.community.name }),
        actionLabel: t("common.open"),
      },
      ...(state.canManageCommunity
        ? [
            {
              id: "payouts" as const,
              title: t("ownerActions.payouts"),
              description: t("ownerActions.payoutsHint"),
              actionLabel: t("common.open"),
            },
          ]
        : []),
    ];
  }
  return [
    {
      id: "open-community",
      title: t("dashboard.openCommunityNamed", { name: state.community.name }),
      description: t("dashboard.memberCommunityHint"),
      actionLabel: t("common.open"),
    },
  ];
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
