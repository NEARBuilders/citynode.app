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

const LEGACY_TABS: Record<string, NodeDetailTab> = { sequence: "management" };

export function parseNodeDetailTab(value: unknown): NodeDetailTab | undefined {
  if (typeof value !== "string") return undefined;
  return NODE_DETAIL_TABS.find((tab) => tab === value) ?? LEGACY_TABS[value];
}

export function parseNodeDetailSearch(search: Record<string, unknown>): {
  tab?: NodeDetailTab;
  edit?: true;
} {
  const edit = search.edit === true || search.edit === "true" || search.tab === "profile";
  return { tab: parseNodeDetailTab(search.tab), ...(edit && { edit: true as const }) };
}

export interface CommunityDraft<P> {
  name: string;
  description: string;
  metadata: string;
  profile: P | null;
}

export class CommunitySaveError extends Error {
  constructor(
    readonly stage: "details" | "profile",
    readonly reason: unknown,
  ) {
    super(stage === "details" ? "Community details were not saved" : "Profile was not saved");
  }
}

export async function saveCommunity<N, P>(
  api: {
    updateNode: (input: {
      nodeId: string;
      name: string;
      metadata: Record<string, unknown>;
    }) => Promise<N>;
    saveDiscoveryProfile: (profile: P) => Promise<P>;
  },
  nodeId: string,
  draft: CommunityDraft<P>,
) {
  const metadata = parseNodeMetadata(draft.metadata, draft.description);
  const node = await api
    .updateNode({ nodeId, name: draft.name.trim(), metadata })
    .catch((reason: unknown) => {
      throw new CommunitySaveError("details", reason);
    });
  const profile = draft.profile
    ? await api.saveDiscoveryProfile(draft.profile).catch((reason: unknown) => {
        throw new CommunitySaveError("profile", reason);
      })
    : null;
  return { node, profile };
}
