import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";

type NodeDashboardEmptyReason = "no-org" | "no-tenant" | "no-node" | "choose";

export function getNodeEmptyStateContent(
  reason: NodeDashboardEmptyReason,
  canCreateNode: boolean,
  t: AppTranslator = translateEnglishAppMessage,
  communityCount = 0,
): {
  title: string;
  description: string;
  actionLabel: string;
  actionTo: "/apply" | "/orgs";
} {
  if (reason === "choose") {
    return {
      title: t("dashboard.chooseCommunity"),
      description: t("dashboard.communityCount", { count: communityCount }),
      actionLabel: t("common.choose"),
      actionTo: "/orgs",
    };
  }
  const hasOrganization = reason !== "no-org";
  return {
    title: hasOrganization ? t("dashboard.noCommunity") : t("tenant.noCommunity"),
    description: canCreateNode ? t("dashboard.createNodeHint") : t("dashboard.startCommunityHint"),
    actionLabel: canCreateNode ? t("common.createCommunity") : t("dashboard.startCommunity"),
    actionTo: "/apply",
  };
}
