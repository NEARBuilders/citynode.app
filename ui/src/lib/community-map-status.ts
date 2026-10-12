export type TenantStatus = "active" | "pending" | "suspended" | "pending_deletion";

export type MapStatus =
  | { state: "inactive"; status: Exclude<TenantStatus, "active"> }
  | { state: "hidden" }
  | { state: "noPin" }
  | { state: "onMap" };

export type MapListing = { latitude: number | null; longitude: number | null } | null;

export function communityMapStatus({
  tenantStatus,
  listing,
  published,
}: {
  tenantStatus: TenantStatus | null | undefined;
  listing: MapListing | undefined;
  published?: boolean;
}): MapStatus | null {
  if (tenantStatus === undefined) return null;
  if (tenantStatus !== null && tenantStatus !== "active")
    return { state: "inactive", status: tenantStatus };
  if (listing === undefined) return null;
  if (listing)
    return listing.latitude === null || listing.longitude === null
      ? { state: "noPin" }
      : { state: "onMap" };
  if (tenantStatus === "active" || published === false) return { state: "hidden" };
  return null;
}
