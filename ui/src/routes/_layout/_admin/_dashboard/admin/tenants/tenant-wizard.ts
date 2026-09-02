export type NearNetworkId = "mainnet" | "testnet";

export type TenantKeyKind = "uuid" | "accountId" | "slug";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function classifyTenantKey(key: string): TenantKeyKind {
  if (UUID_REGEX.test(key)) return "uuid";
  if (key.includes(".")) return "accountId";
  return "slug";
}

export interface TenantBindingLike {
  hostname: string;
  isPrimary: boolean;
}

export interface OrganizationLike {
  id: string;
  slug?: string | null;
}

export function resolvePrimaryHostname(
  bindings: readonly TenantBindingLike[] | null | undefined,
): string | null {
  if (!Array.isArray(bindings) || bindings.length === 0) return null;
  const primary = bindings.find((binding) => binding.isPrimary && !!binding.hostname);
  if (primary) return primary.hostname;
  const first = bindings.find((binding) => !!binding.hostname);
  return first?.hostname ?? null;
}

export function resolveOrgSlug(
  organizations: readonly OrganizationLike[] | null | undefined,
  orgId: string | null | undefined,
): string | null {
  if (!orgId || !Array.isArray(organizations)) return null;
  const org = organizations.find((candidate) => candidate.id === orgId);
  return typeof org?.slug === "string" && org.slug ? org.slug : null;
}
