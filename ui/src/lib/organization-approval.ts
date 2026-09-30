export function organizationApproval(organization: object | undefined) {
  const status = organization && "status" in organization ? organization.status : "active";
  const reason =
    organization && "rejectionReason" in organization ? organization.rejectionReason : null;
  return {
    status: status === "pending" || status === "rejected" ? status : "active",
    reason: typeof reason === "string" ? reason : null,
  };
}
