import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
export type NextStepId =
  | "save-account"
  | "choose-org"
  | "start-community"
  | "open-community"
  | "payouts"
  | "team-requests"
  | "stake"
  | "explore";

export const MAX_NEXT_STEPS = 5;

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
  membership: "unknown" | "none" | "choose" | "active";
  communityCount: number;
  community: { name: string; tenantId: string } | null;
  canManageCommunity: boolean;
  canOrganizeEvents: boolean;
  inFinanceTeam: boolean;
  isAdmin: boolean;
  teamRequestsWaiting?: number;
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

  const explore: NextStep = {
    id: "explore",
    title: t("dashboard.explore"),
    description: t("dashboard.exploreHint"),
    actionLabel: t("common.explore"),
  };
  const offersStartCommunity =
    !state.community &&
    (state.membership === "none" ? !state.isAdmin : state.membership === "active");

  if (offersStartCommunity) {
    steps.push(explore, startCommunityStep(t));
  } else if (state.membership === "choose") {
    steps.push({
      id: "choose-org",
      title: t("dashboard.chooseCommunity"),
      description: t("dashboard.communityCount", { count: state.communityCount }),
      actionLabel: t("common.choose"),
    });
  } else if (state.community && state.membership !== "unknown") {
    steps.push(...communitySteps(state.community, state, t));
  }

  steps.push({
    id: "stake",
    title: t("dashboard.stake"),
    description: t("dashboard.stakeHint"),
    actionLabel: t("common.stake"),
  });

  if (!state.community && !offersStartCommunity) {
    steps.push(explore);
  }

  return steps.slice(0, MAX_NEXT_STEPS);
}

function startCommunityStep(t: AppTranslator): NextStep {
  return {
    id: "start-community",
    title: t("dashboard.startCommunity"),
    description: t("dashboard.startCommunityHint"),
    actionLabel: t("dashboard.startCommunity"),
  };
}

function communitySteps(
  community: NonNullable<NextStepsState["community"]>,
  state: NextStepsState,
  t: AppTranslator,
): NextStep[] {
  const payouts: NextStep[] =
    state.canManageCommunity || state.inFinanceTeam
      ? [
          {
            id: "payouts",
            title: t("ownerActions.payouts"),
            description: t("ownerActions.payoutsHint"),
            actionLabel: t("common.open"),
          },
        ]
      : [];
  const teamRequests: NextStep[] = state.teamRequestsWaiting
    ? [
        {
          id: "team-requests",
          title: t("teamRequests.homeTitle", { count: state.teamRequestsWaiting }),
          description: t("teamRequests.homeHint", { name: state.community.name }),
          actionLabel: t("common.open"),
        },
      ]
    : [];
  if (state.canManageCommunity || state.canOrganizeEvents || state.isAdmin) {
    return [
      ...teamRequests,
      {
        id: "open-community",
        title: t("dashboard.openCommunity"),
        description: t("dashboard.communityTasks", { name: community.name }),
        actionLabel: t("common.open"),
      },
      ...payouts,
    ];
  }
  return [
    ...teamRequests,
    {
      id: "open-community",
      title: t("dashboard.openCommunityNamed", { name: community.name }),
      description: t("dashboard.memberCommunityHint"),
      actionLabel: t("common.open"),
    },
    ...payouts,
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
