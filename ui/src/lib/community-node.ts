type NamedNode = { id: string; name: string };

export function compareCommunityNodes(a: NamedNode, b: NamedNode) {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export function sortCommunityNodes<T extends NamedNode>(nodes: readonly T[]): T[] {
  return [...nodes].sort(compareCommunityNodes);
}

export function selectCommunityNode<T extends NamedNode>(
  nodes: readonly T[],
  requestedId?: string | null,
): T | null {
  const requested = requestedId ? nodes.find((node) => node.id === requestedId) : undefined;
  return requested ?? sortCommunityNodes(nodes)[0] ?? null;
}
