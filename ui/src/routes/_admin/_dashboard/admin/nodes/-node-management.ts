export function parseNodeMetadata(raw: string, description: string): Record<string, unknown> {
  let metadata: unknown;
  try {
    metadata = JSON.parse(raw);
  } catch {
    throw new Error("Metadata must be valid JSON.");
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Metadata must be a JSON object.");
  }
  const result: Record<string, unknown> = { ...metadata };
  if (description.trim()) result.description = description.trim();
  else delete result.description;
  return result;
}

interface SearchableNodeRow {
  node: { name: string; slug: string };
  parent?: { name: string } | undefined;
}

export function filterNodeRows<T extends SearchableNodeRow>(
  rows: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter(
    ({ node, parent }) =>
      node.name.toLowerCase().includes(needle) ||
      node.slug.toLowerCase().includes(needle) ||
      !!parent?.name.toLowerCase().includes(needle),
  );
}

export const NODE_DETAIL_TABS = ["overview", "validators", "management", "domains"] as const;

export type NodeDetailTab = (typeof NODE_DETAIL_TABS)[number];

const NODE_DETAIL_TAB_ALIASES: Record<string, NodeDetailTab> = {
  sequence: "management",
};

export function parseNodeDetailTab(value: unknown): NodeDetailTab | undefined {
  const tab = typeof value === "string" ? (NODE_DETAIL_TAB_ALIASES[value] ?? value) : value;
  return NODE_DETAIL_TABS.find((candidate) => candidate === tab);
}

export function parseNodeEditSearch(search: Record<string, unknown>): true | undefined {
  return search.edit === true || search.edit === "true" || search.tab === "profile"
    ? true
    : undefined;
}
