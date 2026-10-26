import {
  type JoinCounts,
  type JoinsTenant,
  type OrganizationJoins,
  olderTenant,
} from "./-community-joins";

export type StakingState = "own" | "below" | "inherited" | "none";

export interface ProgressNode {
  id: string;
  name: string;
  parentId: string | null;
  tenantId: string | null;
}

export interface ProgressNodeSummary {
  node: ProgressNode;
  validatorCount: number;
}

export interface EventStat {
  nodeId: string;
  upcoming: number;
  past: number;
  lastActivityAt: string | null;
}

export interface CommunityProgressRow<T extends JoinsTenant, N extends ProgressNode> {
  node: N;
  tenant: T;
  joins: JoinCounts;
  events: { upcoming: number; past: number };
  lastActivityAt: string | null;
  staking: StakingState;
}

export function stakingStates(summaries: readonly ProgressNodeSummary[]) {
  const byId = new Map(summaries.map((summary) => [summary.node.id, summary]));
  const hasOwn = (id: string) => (byId.get(id)?.validatorCount ?? 0) > 0;
  const below = new Set<string>();
  for (const summary of summaries) {
    if (!hasOwn(summary.node.id)) continue;
    const seen = new Set<string>();
    let parentId = summary.node.parentId;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      below.add(parentId);
      parentId = byId.get(parentId)?.node.parentId ?? null;
    }
  }
  const states = new Map<string, StakingState>();
  for (const { node } of summaries) {
    if (hasOwn(node.id)) {
      states.set(node.id, "own");
      continue;
    }
    if (below.has(node.id)) {
      states.set(node.id, "below");
      continue;
    }
    const seen = new Set<string>();
    let parentId = node.parentId;
    let inherited = false;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      if (hasOwn(parentId)) {
        inherited = true;
        break;
      }
      parentId = byId.get(parentId)?.node.parentId ?? null;
    }
    states.set(node.id, inherited ? "inherited" : "none");
  }
  return states;
}

const NO_JOINS: JoinCounts = { redeemed: 0, newMembers: 0 };

export function buildCommunityProgressRows<T extends JoinsTenant, N extends ProgressNode>(
  tenants: readonly T[],
  summaries: readonly (ProgressNodeSummary & { node: N })[],
  joins: OrganizationJoins | undefined,
  eventStats: readonly EventStat[],
): CommunityProgressRow<T, N>[] {
  const groupOf = (tenant: T) => tenant.orgId ?? `tenant:${tenant.id}`;
  const liveTenants = new Map(
    tenants
      .filter((tenant) => tenant.status !== "pending_deletion")
      .map((tenant) => [tenant.id, tenant]),
  );
  const representative = new Map<string, T>();
  for (const tenant of liveTenants.values()) {
    const existing = representative.get(groupOf(tenant));
    representative.set(groupOf(tenant), existing ? olderTenant(existing, tenant) : tenant);
  }
  const joinsByOrg = new Map(
    joins?.organizations.map(({ organizationId, redeemed, newMembers }) => [
      organizationId,
      { redeemed, newMembers },
    ]),
  );
  const eventsByNode = new Map(eventStats.map((stat) => [stat.nodeId, stat]));
  const tenantOfNode = new Map(summaries.map(({ node }) => [node.id, node.tenantId]));
  const isTop = (node: N) => !node.parentId || tenantOfNode.get(node.parentId) !== node.tenantId;
  const groups = new Map<string, { nodes: N[]; primary?: N }>();
  for (const { node } of summaries) {
    const tenant = node.tenantId ? liveTenants.get(node.tenantId) : undefined;
    if (!tenant) continue;
    const key = groupOf(tenant);
    const group = groups.get(key) ?? { nodes: [] };
    group.nodes.push(node);
    const owned = node.tenantId === representative.get(key)?.id;
    const current = group.primary;
    const currentOwned = current?.tenantId === representative.get(key)?.id;
    const rank = (candidate: N, ownedByRep: boolean) =>
      (ownedByRep ? 2 : 0) + (isTop(candidate) ? 1 : 0);
    if (
      !current ||
      rank(node, owned) > rank(current, currentOwned) ||
      (rank(node, owned) === rank(current, currentOwned) &&
        node.name.localeCompare(current.name) < 0)
    ) {
      group.primary = node;
    }
    groups.set(key, group);
  }
  const states = stakingStates(summaries);
  const rows: CommunityProgressRow<T, N>[] = [];
  for (const [key, { nodes, primary }] of groups) {
    const tenant = representative.get(key);
    if (!tenant || !primary) continue;
    const events = { upcoming: 0, past: 0 };
    let lastActivityAt: string | null = null;
    for (const node of nodes) {
      const stat = eventsByNode.get(node.id);
      if (!stat) continue;
      events.upcoming += stat.upcoming;
      events.past += stat.past;
      if (stat.lastActivityAt && (!lastActivityAt || stat.lastActivityAt > lastActivityAt)) {
        lastActivityAt = stat.lastActivityAt;
      }
    }
    rows.push({
      node: primary,
      tenant,
      joins: (tenant.orgId && joinsByOrg.get(tenant.orgId)) || NO_JOINS,
      events,
      lastActivityAt,
      staking: states.get(primary.id) ?? "none",
    });
  }
  return rows.sort(
    (a, b) =>
      b.joins.redeemed - a.joins.redeemed ||
      b.events.upcoming - a.events.upcoming ||
      a.node.name.localeCompare(b.node.name),
  );
}

export interface NeedsActionProposal {
  id: string;
  pluginId: string;
  entityId: string;
  reviewStatus: string;
  title: string;
  createdAt: string;
  setupNeedsAttention: boolean;
}

export type NeedsActionItem =
  | { kind: "application"; proposal: NeedsActionProposal }
  | { kind: "moreApplications"; count: number }
  | { kind: "setup"; proposal: NeedsActionProposal }
  | { kind: "relayer" }
  | { kind: "organizations"; count: number }
  | { kind: "staking"; nodeId: string; name: string }
  | { kind: "stakingMany"; count: number };

export const STAKING_ITEMS_LIMIT = 3;
export const APPLICATION_ITEMS_LIMIT = 5;

export function deriveNeedsAction({
  pendingReviewCount,
  proposals,
  relayerNeedsFunding,
  organizationRequestCount,
  communities,
}: {
  pendingReviewCount: number;
  proposals: readonly NeedsActionProposal[];
  relayerNeedsFunding: boolean;
  organizationRequestCount: number;
  communities: readonly { node: { id: string; name: string }; staking: StakingState }[];
}): NeedsActionItem[] {
  const items: NeedsActionItem[] = [];
  for (const proposal of proposals) {
    if (proposal.reviewStatus !== "pending" && proposal.setupNeedsAttention) {
      items.push({ kind: "setup", proposal });
    }
  }
  const applications = proposals
    .filter((proposal) => proposal.reviewStatus === "pending")
    .slice(0, APPLICATION_ITEMS_LIMIT);
  for (const proposal of applications) items.push({ kind: "application", proposal });
  if (pendingReviewCount > applications.length) {
    items.push({ kind: "moreApplications", count: pendingReviewCount - applications.length });
  }
  if (relayerNeedsFunding) items.push({ kind: "relayer" });
  if (organizationRequestCount > 0) {
    items.push({ kind: "organizations", count: organizationRequestCount });
  }
  const unstaked = communities.filter(({ staking }) => staking === "none");
  if (unstaked.length > STAKING_ITEMS_LIMIT) {
    items.push({ kind: "stakingMany", count: unstaked.length });
  } else {
    for (const { node } of unstaked) {
      items.push({ kind: "staking", nodeId: node.id, name: node.name });
    }
  }
  return items;
}
