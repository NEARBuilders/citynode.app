import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";

type NodeDashboardEmptyReason = "no-org" | "no-tenant" | "no-node";

export function getNodeEmptyStateContent(
  reason: NodeDashboardEmptyReason,
  canCreateNode: boolean,
  t: AppTranslator = translateEnglishAppMessage,
) {
  const hasOrganization = reason !== "no-org";
  return {
    title: hasOrganization ? t("dashboard.noCommunity") : t("tenant.noCommunity"),
    description: canCreateNode ? t("dashboard.createNodeHint") : t("dashboard.startCommunityHint"),
    actionLabel: canCreateNode ? t("common.createCommunity") : t("dashboard.startCommunity"),
    actionTo: "/apply" as const,
  };
}
