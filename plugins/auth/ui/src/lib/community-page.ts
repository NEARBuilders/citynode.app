import type { ApiClient } from "@/context";

type TenantResult = { id?: unknown } | null;
type NodeResult = { id?: unknown; slug?: unknown; name?: unknown; parentId?: unknown };
type CommunityNode = { id: string; slug: string; name: string; parentId?: unknown };
type DiscoveryNodeResult = object | null;

export type CommunityPage = { slug: string; parentId?: string };

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCommunityNode(node: NodeResult): node is CommunityNode {
  return isText(node.id) && isText(node.slug) && typeof node.name === "string";
}

export async function findCommunityPage(
  apiClient: ApiClient,
  organizationId: string,
): Promise<CommunityPage | null> {
  try {
    const tenant: TenantResult = await apiClient.resolveTenantByOrgId({ orgId: organizationId });
    if (!isText(tenant?.id)) return null;

    const nodes: unknown = await apiClient.listNodes({ tenantId: tenant.id });
    if (!Array.isArray(nodes)) return null;
    const [node] = nodes.filter(isCommunityNode).sort((a, b) => a.name.localeCompare(b.name));
    if (!node) return null;

    const discovery: DiscoveryNodeResult = await apiClient.getDiscoveryNode({ nodeId: node.id });
    if (!discovery) return null;

    return isText(node.parentId)
      ? { slug: node.slug, parentId: node.parentId }
      : { slug: node.slug };
  } catch {
    return null;
  }
}
