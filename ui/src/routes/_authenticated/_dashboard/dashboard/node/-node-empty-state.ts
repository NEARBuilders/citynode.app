import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";

type NodeDashboardEmptyReason = "no-org" | "no-tenant" | "no-node";

export function getNodeEmptyStateContent(
  reason: NodeDashboardEmptyReason,
  canCreateNode: boolean,
  t: AppTranslator = translateEnglishAppMessage,
) {
  if (reason === "no-org") {
    return {
      title: t("dashboard.createOrgFirst"),
      description: t("dashboard.createOrgFirstHint"),
      actionLabel: t("org.create"),
      actionTo: "/orgs/new" as const,
    };
  }

  return {
    title: t("dashboard.noCommunity"),
    description: canCreateNode ? t("dashboard.createNodeHint") : t("dashboard.proposeNodeHint"),
    actionLabel: canCreateNode ? t("common.createCommunity") : t("dashboard.startCommunity"),
    actionTo: canCreateNode ? ("/admin/tenants/new" as const) : ("/apply" as const),
  };
}
