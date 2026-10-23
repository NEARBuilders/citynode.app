type TenantResult = { id?: unknown } | null;
type NodeResult = { id?: unknown; slug?: unknown; name?: unknown; parentId?: unknown };
type CommunityNode = { id: string; slug: string; name: string; parentId?: unknown };
type DiscoveryNodeResult = object | null;

export type CommunityPage = { slug: string; parentId?: string };

// The composed runtime client's surface this page needs — the plugin ui
// typechecks against the structural shape (the composed client merges these
// procedures from the api attachment at compose time).
type CommunityPageClient = {
  resolveTenantByOrgId: (input: { orgId: string }) => Promise<TenantResult>;
  listNodes: (input: { tenantId: string }) => Promise<unknown>;
  getDiscoveryNode: (input: { nodeId: string }) => Promise<DiscoveryNodeResult>;
};

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nameOf(node: NodeResult): string {
  return typeof node.name === "string" ? node.name : "";
}

function isCommunityNode(node: NodeResult): node is CommunityNode {
  return isText(node.id) && isText(node.slug) && typeof node.name === "string";
}

export async function findCommunityPage(
  apiClient: CommunityPageClient,
  organizationId: string,
): Promise<CommunityPage | null> {
  try {
    const tenant: TenantResult = await apiClient.resolveTenantByOrgId({ orgId: organizationId });
    if (!isText(tenant?.id)) return null;

    const nodes: unknown = await apiClient.listNodes({ tenantId: tenant.id });
    if (!Array.isArray(nodes)) return null;
    const [node] = [...nodes].sort((a: NodeResult, b: NodeResult) =>
      nameOf(a).localeCompare(nameOf(b)),
    );
    if (!node || !isCommunityNode(node)) return null;

    const discovery: DiscoveryNodeResult = await apiClient.getDiscoveryNode({ nodeId: node.id });
    if (!discovery) return null;

    return isText(node.parentId)
      ? { slug: node.slug, parentId: node.parentId }
      : { slug: node.slug };
  } catch {
    return null;
  }
}
