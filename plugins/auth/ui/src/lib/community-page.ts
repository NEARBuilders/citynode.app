type TenantRecord = {
  id: string;
};

type NodeRecord = {
  id: string;
  slug: string;
  parentId: string | null;
  name: string;
};

type CommunityPageClient = {
  resolveTenantByOrgId: (input: { orgId: string }) => Promise<TenantRecord>;
  listNodes: (input: { tenantId: string }) => Promise<NodeRecord[]>;
  getDiscoveryNode: (input: { nodeId: string }) => Promise<unknown>;
};

export type CommunityPageLink = {
  slug: string;
  parentId: string | null;
};

export function communityPageHref(page: CommunityPageLink): string {
  const path = `/n/${encodeURIComponent(page.slug)}`;
  return page.parentId ? `${path}?parentId=${encodeURIComponent(page.parentId)}` : path;
}

function tenantIdOf(tenant: TenantRecord): string | null {
  return typeof tenant?.id === "string" ? tenant.id : null;
}

function nodeFieldsOf(node: NodeRecord | undefined): (CommunityPageLink & { id: string }) | null {
  if (!node) return null;
  if (typeof node.id !== "string" || typeof node.slug !== "string") return null;
  if (node.parentId !== null && typeof node.parentId !== "string") return null;
  return { id: node.id, slug: node.slug, parentId: node.parentId };
}

export async function communityPageForOrganization(
  apiClient: CommunityPageClient,
  organizationId: string,
): Promise<CommunityPageLink | null> {
  try {
    const tenantId = tenantIdOf(await apiClient.resolveTenantByOrgId({ orgId: organizationId }));
    if (!tenantId) return null;
    const nodes = await apiClient.listNodes({ tenantId });
    if (!Array.isArray(nodes) || nodes.length === 0) return null;
    const first = [...nodes].sort((left, right) => {
      const a = typeof left?.name === "string" ? left.name : "";
      const b = typeof right?.name === "string" ? right.name : "";
      return a.localeCompare(b);
    })[0];
    const node = nodeFieldsOf(first);
    if (!node) return null;
    const listed = await apiClient.getDiscoveryNode({ nodeId: node.id });
    if (listed == null) return null;
    return { slug: node.slug, parentId: node.parentId };
  } catch {
    return null;
  }
}
