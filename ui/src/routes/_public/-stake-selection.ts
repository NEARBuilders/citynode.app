interface StakeCommunity {
  node: { id: string } | null;
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
  communities,
  hasRequestedNode,
}: {
  activeOrganizationId: string | null;
  communities: StakeCommunity[];
  hasRequestedNode: boolean;
}) {
  if (!activeOrganizationId || hasRequestedNode) return null;
  return communities.find((community) => community.node)?.node?.id ?? null;
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
