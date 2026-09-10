export const orgMembersQueryKey = (orgId: string) => ["org-members", orgId] as const;
export const orgInvitationsQueryKey = (orgId: string) => ["org-invitations", orgId] as const;
export const orgApiKeysQueryKey = (orgId: string) => ["org-api-keys", orgId] as const;
