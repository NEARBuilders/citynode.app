import type { ApiClient } from "@/app";
import type { Organization } from "@/lib/queries/organizations";

export type TenantKeyKind = "uuid" | "accountId" | "slug";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function classifyTenantKey(key: string): TenantKeyKind {
  if (UUID_REGEX.test(key)) return "uuid";
  if (key.includes(".")) return "accountId";
  return "slug";
}

type TenantBinding = Awaited<ReturnType<ApiClient["listTenantBindingsForTenant"]>>[number];
export type Tenant = Awaited<ReturnType<ApiClient["listTenants"]>>[number];
export type TenantStatusFilter = Tenant["status"] | "all";

export function resolvePrimaryHostname(
  bindings: readonly Pick<TenantBinding, "hostname" | "isPrimary">[] | null | undefined,
): string | null {
  if (!Array.isArray(bindings) || bindings.length === 0) return null;
  const primary = bindings.find((binding) => binding.isPrimary && !!binding.hostname);
  if (primary) return primary.hostname;
  const first = bindings.find((binding) => !!binding.hostname);
  return first?.hostname ?? null;
}

export function resolveOrgSlug(
  organizations: readonly Pick<Organization, "id" | "slug">[] | null | undefined,
  orgId: string | null | undefined,
): string | null {
  if (!orgId || !Array.isArray(organizations)) return null;
  const org = organizations.find((candidate) => candidate.id === orgId);
  return typeof org?.slug === "string" && org.slug ? org.slug : null;
}

export function filterTenants<T extends Pick<Tenant, "id" | "name" | "accountId" | "status">>(
  tenants: readonly T[],
  {
    status,
    query,
    slugByTenantId,
  }: {
    status: TenantStatusFilter;
    query: string;
    slugByTenantId?: ReadonlyMap<string, string>;
  },
): T[] {
  const needle = query.trim().toLowerCase();
  return tenants.filter((tenant) => {
    if (status !== "all") {
      const matchesStatus =
        status === "pending"
          ? tenant.status === "pending" || tenant.status === "pending_deletion"
          : tenant.status === status;
      if (!matchesStatus) return false;
    }
    if (!needle) return true;
    const slug = slugByTenantId?.get(tenant.id) ?? "";
    return [tenant.name, tenant.accountId, slug].some((value) =>
      value.toLowerCase().includes(needle),
    );
  });
}
