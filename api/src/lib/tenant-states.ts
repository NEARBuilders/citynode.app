export const TENANT_STATUSES = ["active", "pending", "suspended", "pending_deletion"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_OWNER_KINDS = ["platform", "dao", "user"] as const;
export type TenantOwnerKind = (typeof TENANT_OWNER_KINDS)[number];
