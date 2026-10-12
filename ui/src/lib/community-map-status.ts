import type { ApiClient } from "@/app";

export type TenantStatus = Awaited<ReturnType<ApiClient["resolveTenantByOrgId"]>>["status"];

export type InactiveTenantStatus = Exclude<TenantStatus, "active">;

export type MapStatus =
  | { state: "inactive"; tenantStatus: InactiveTenantStatus }
  | { state: "hidden" }
  | { state: "noPin" }
  | { state: "onMap" };

type MapListing = { latitude: number | null; longitude: number | null } | null;

export function communityMapStatus({
  tenantStatus,
  listing,
}: {
  tenantStatus: TenantStatus | undefined;
  listing: MapListing | undefined;
}): MapStatus | null {
  if (tenantStatus === undefined) return null;
  if (tenantStatus !== "active") return { state: "inactive", tenantStatus };
  if (listing === undefined) return null;
  if (!listing) return { state: "hidden" };
  return listing.latitude === null || listing.longitude === null
    ? { state: "noPin" }
    : { state: "onMap" };
}
