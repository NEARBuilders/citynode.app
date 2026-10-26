import type { ApiClient } from "@/app";
import type { AdminNodeListRow } from "@/lib/queries/nodes";
import type { Proposal } from "@/lib/queries/proposals";
import {
  buildCommunityJoinRows,
  type JoinCounts,
  type JoinsTenant,
  type OrganizationJoins,
} from "./-community-joins";

export type StakingState = "own" | "below" | "inherited" | "none";

type NodeRecord = Awaited<ReturnType<ApiClient["listNodes"]>>[number];

type ProgressNode = Pick<NodeRecord, "id" | "name" | "parentId" | "tenantId">;

type ProgressNodeSummary = { node: ProgressNode } & Pick<AdminNodeListRow, "validatorCount">;

type EventStat = Awaited<ReturnType<ApiClient["getDiscoveryEventStats"]>>[number];

interface CommunityProgressRow<T extends JoinsTenant, N extends ProgressNode> {
  node: N;
  tenant: T;
  joins: JoinCounts | null;
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

export function buildCommunityProgressRows<T extends JoinsTenant, N extends ProgressNode>(
  tenants: readonly T[],
  summaries: readonly (ProgressNodeSummary & { node: N })[],
  joins: OrganizationJoins | undefined,
  eventStats: readonly EventStat[],
): CommunityProgressRow<T, N>[] {
  const liveTenants = new Map(
    tenants
      .filter((tenant) => tenant.status !== "pending_deletion")
      .map((tenant) => [tenant.id, tenant]),
  );
  const joinsByTenant = new Map(
    buildCommunityJoinRows(tenants, joins, undefined).map((row) => [row.tenant.id, row.thisMonth]),
  );
  const tenantOfNode = new Map(summaries.map(({ node }) => [node.id, node.tenantId]));
  const isTop = (node: N) => !node.parentId || tenantOfNode.get(node.parentId) !== node.tenantId;
  const primary = new Map<string, N>();
  for (const { node } of summaries) {
    if (!node.tenantId || !liveTenants.has(node.tenantId)) continue;
    const current = primary.get(node.tenantId);
    if (
      !current ||
      (isTop(node) && !isTop(current)) ||
      (isTop(node) === isTop(current) && node.name.localeCompare(current.name) < 0)
    ) {
      primary.set(node.tenantId, node);
    }
  }
  const states = stakingStates(summaries);
  const eventsByNode = new Map(eventStats.map((stat) => [stat.nodeId, stat]));
  return [...primary.entries()]
    .flatMap(([tenantId, node]) => {
      const tenant = liveTenants.get(tenantId);
      if (!tenant) return [];
      const stat = eventsByNode.get(node.id);
      return [
        {
          node,
          tenant,
          joins: joinsByTenant.get(tenantId) ?? null,
          events: { upcoming: stat?.upcoming ?? 0, past: stat?.past ?? 0 },
          lastActivityAt: stat?.lastActivityAt ?? null,
          staking: states.get(node.id) ?? ("none" as const),
        },
      ];
    })
    .sort(
      (a, b) =>
        (b.joins?.redeemed ?? 0) - (a.joins?.redeemed ?? 0) ||
        b.events.upcoming - a.events.upcoming ||
        a.node.name.localeCompare(b.node.name),
    );
}

export type NeedsActionProposal = Pick<
  Proposal,
  "id" | "pluginId" | "entityId" | "reviewStatus" | "createdAt"
> & { title: string; setupNeedsAttention: boolean };

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
