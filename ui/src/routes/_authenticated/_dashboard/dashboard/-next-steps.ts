import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
export type NextStepId =
  | "save-account"
  | "add-email"
  | "create-org"
  | "choose-org"
  | "start-community"
  | "open-community"
  | "community-settings"
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
  hasRealEmail: boolean;
  organizationCount: number;
  activeOrganizationName: string | null;
  community: { name: string; tenantId: string } | null;
  canManageCommunity: boolean;
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

  if (!state.isAnonymous && !state.hasRealEmail) {
    steps.push({
      id: "add-email",
      title: t("dashboard.addEmail"),
      description: t("dashboard.emailHint"),
      actionLabel: t("dashboard.addEmailAction"),
    });
  }

  if (state.organizationCount === 0) {
    steps.push({
      id: "create-org",
      title: t("dashboard.createOrg"),
      description: t("dashboard.orgsRunCommunities"),
      actionLabel: t("org.create"),
    });
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
      description: t("dashboard.proposeNamed", { name: state.activeOrganizationName }),
      actionLabel: t("dashboard.startCommunity"),
    });
  } else {
    steps.push({
      id: "open-community",
      title: t("dashboard.openCommunity"),
      description: t("dashboard.communityTasks", { name: state.community.name }),
      actionLabel: t("common.open"),
    });
    if (state.canManageCommunity) {
      steps.push({
        id: "community-settings",
        title: t("dashboard.communitySettings"),
        description: t("dashboard.settingsHint"),
        actionLabel: t("common.openSettings"),
      });
    }
  }

  if (state.isAdmin) {
    steps.push({
      id: "admin",
      title: t("dashboard.adminQueue"),
      description: t("dashboard.adminQueueHint"),
      actionLabel: t("common.openAdmin"),
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
