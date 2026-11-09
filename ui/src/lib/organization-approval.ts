import type { AppMessageId } from "@/i18n/catalogs";

export type OrganizationApproval = "active" | "pending" | "rejected";

export function organizationApproval(organization: {
  status?: string | null;
}): OrganizationApproval {
  if (!organization.status || organization.status === "active") return "active";
  return organization.status === "pending" ? "pending" : "rejected";
}

export const ORGANIZATION_APPROVAL_LABEL: Record<
  Exclude<OrganizationApproval, "active">,
  AppMessageId
> = {
  pending: "orgApproval.pending",
  rejected: "orgApproval.rejected",
};
