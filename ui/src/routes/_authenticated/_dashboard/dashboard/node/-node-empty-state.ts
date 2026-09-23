type NodeDashboardEmptyReason = "no-org" | "no-tenant" | "no-node";

export function getNodeEmptyStateContent(reason: NodeDashboardEmptyReason, canCreateNode: boolean) {
  if (reason === "no-org") {
    return {
      description: "Create an organization to start managing a City Node.",
      actionLabel: "create an organization",
      actionTo: "/orgs/new" as const,
    };
  }

  return {
    description:
      reason === "no-tenant"
        ? "Your active organization does not have a tenant deployment yet."
        : "Your active organization's tenant does not manage a City Node yet.",
    actionLabel: canCreateNode ? "create node" : "propose a node",
    actionTo: canCreateNode ? ("/admin/tenants/new" as const) : ("/apply" as const),
  };
}
