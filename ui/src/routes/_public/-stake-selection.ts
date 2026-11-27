interface StakeCommunity {
  node: { id: string } | null;
  viewerMembership: "active" | "member" | null;
}

export function getStakeScopeKey(
  user: { id: string; isAnonymous?: boolean | null } | null | undefined,
  activeOrganizationId: string | null,
) {
  if (!user || user.isAnonymous === true) return "anonymous";
  return activeOrganizationId ? `organization:${activeOrganizationId}` : `user:${user.id}`;
}

export function getActiveOrganizationNodeId({
  activeOrganizationId,
  browseAll = false,
  communities,
  hasRequestedNode,
}: {
  activeOrganizationId: string | null;
  browseAll?: boolean;
  communities: StakeCommunity[];
  hasRequestedNode: boolean;
}) {
  if (!activeOrganizationId || hasRequestedNode || browseAll) return null;
  return (
    communities.find((community) => community.node && community.viewerMembership === "active")?.node
      ?.id ?? null
  );
}

export function chooseDefaultValidator<T extends { id: string; isDefault: boolean }>(
  validators: readonly T[],
  unapprovedIds: ReadonlySet<string>,
): T | undefined {
  const usable = validators.filter((validator) => !unapprovedIds.has(validator.id));
  return (
    usable.find((validator) => validator.isDefault) ??
    usable[0] ??
    validators.find((validator) => validator.isDefault) ??
    validators[0]
  );
}

const membershipRank = (membership: StakeCommunity["viewerMembership"]) =>
  membership === "active" ? 0 : membership === "member" ? 1 : 2;

export function getDirectoryNodes<
  T extends StakeCommunity & {
    name: string;
    hostname: string | null;
    stakeable: boolean;
    node: { id: string; slug: string; kind: string | null } | null;
  },
>(communities: readonly T[]) {
  return [...communities]
    .sort(
      (a, b) =>
        membershipRank(a.viewerMembership) - membershipRank(b.viewerMembership) ||
        Number(b.stakeable) - Number(a.stakeable),
    )
    .flatMap((community) => {
      const node = community.node;
      return node
        ? [
            {
              id: node.id,
              name: community.name,
              slug: node.slug,
              kind: node.kind,
              hostname: community.hostname,
              stakeable: community.stakeable,
            },
          ]
        : [];
    });
}
