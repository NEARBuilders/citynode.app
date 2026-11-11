import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";

type NodeDashboardEmptyReason = "no-org" | "no-tenant" | "no-node" | "choose";

export interface NodeEmptyStateAction {
  label: string;
  to: "/apply" | "/orgs" | "/explore";
  primary: boolean;
}

export function getNodeEmptyStateContent(
  reason: NodeDashboardEmptyReason,
  canCreateNode: boolean,
  t: AppTranslator = translateEnglishAppMessage,
  communityCount = 0,
): {
  title: string;
  description: string;
  actions: NodeEmptyStateAction[];
} {
  if (reason === "choose") {
    return {
      title: t("dashboard.chooseCommunity"),
      description: t("dashboard.communityCount", { count: communityCount }),
      actions: [{ label: t("common.choose"), to: "/orgs", primary: true }],
    };
  }
  const title = reason === "no-org" ? t("tenant.noCommunity") : t("dashboard.noCommunity");
  if (canCreateNode) {
    return {
      title,
      description: t("dashboard.createNodeHint"),
      actions: [{ label: t("common.createCommunity"), to: "/apply", primary: true }],
    };
  }
  return {
    title,
    description: t("dashboard.findCommunityHint"),
    actions: [
      { label: t("common.exploreCommunities"), to: "/explore", primary: true },
      { label: t("dashboard.startCommunity"), to: "/apply", primary: false },
    ],
  };
}
