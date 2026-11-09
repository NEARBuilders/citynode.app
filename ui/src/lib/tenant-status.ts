import type { ApiClient } from "@/app";

export type TenantStatus = Awaited<ReturnType<ApiClient["updateTenant"]>>["status"];
export type InactiveTenantStatus = Exclude<TenantStatus, "active">;
export type TenantConfigStatus = Exclude<TenantStatus, "pending">;
export type NodeSiteStatus = TenantStatus | "standalone" | "unknown";
export type TenantStatusTone = "success" | "warning" | "destructive" | "outline";

const TENANT_STATUS_TONE: Record<NodeSiteStatus, TenantStatusTone> = {
  active: "success",
  pending: "warning",
  suspended: "warning",
  pending_deletion: "destructive",
  standalone: "outline",
  unknown: "outline",
};

export function tenantStatusTone(status: NodeSiteStatus): TenantStatusTone {
  return TENANT_STATUS_TONE[status];
}

export function tenantConfigStatus(status: TenantStatus): TenantConfigStatus | undefined {
  return status === "pending" ? undefined : status;
}
