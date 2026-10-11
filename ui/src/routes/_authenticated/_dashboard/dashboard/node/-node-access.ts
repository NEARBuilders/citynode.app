export function hasNodeProposalReviewPermission(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canManageCommunity(
  userRole: string | null | undefined,
  orgRole: string | null | undefined,
): boolean {
  return userRole === "admin" || orgRole === "owner" || orgRole === "admin";
}
