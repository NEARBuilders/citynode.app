export const COMMUNITY_TENANT_ACCOUNT_SUFFIX = "v1.citynode.near";

export function isCommunityPlaceholderTenant(tenant: {
  ownerKind: string;
  accountId: string;
}): boolean {
  return (
    tenant.ownerKind === "platform" &&
    tenant.accountId.endsWith(`.${COMMUNITY_TENANT_ACCOUNT_SUFFIX}`)
  );
}
