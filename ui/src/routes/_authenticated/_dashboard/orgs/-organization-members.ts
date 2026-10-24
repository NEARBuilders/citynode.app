import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type ApiClient, type AuthClient, useAuthClient } from "@/app";
import { appErrorMessage, isPermissionError } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import type { MemberCardMember } from "./-member-card";
import { orgActiveRoleQueryKey, orgMembersQueryKey } from "./-organization-query-keys";

export type OrgMember = {
  id: string;
  userId: string;
  role: string;
  user?: MemberCardMember["user"];
};

async function fetchOrgMembers(auth: AuthClient, orgId: string): Promise<OrgMember[]> {
  const { data, error } = await auth.organization.listMembers({
    query: { organizationId: orgId },
  });
  if (error) throw new Error(error.message);
  return data?.members ?? [];
}

export function orgMembersQueryOptions(auth: AuthClient, orgId: string) {
  return queryOptions({
    queryKey: orgMembersQueryKey(orgId),
    queryFn: () => fetchOrgMembers(auth, orgId),
  });
}

export function orgActiveRoleQueryOptions(apiClient: ApiClient, orgId: string) {
  return queryOptions({
    queryKey: orgActiveRoleQueryKey(orgId),
    queryFn: async (): Promise<string | null> => {
      try {
        const { role } = await apiClient.auth.getActiveMemberRole({ organizationId: orgId });
        return role;
      } catch (error) {
        if (isPermissionError(error)) return null;
        throw error;
      }
    },
  });
}

/** The given user's role in the organization, once its members have loaded. */
export function useOrgMemberRole(
  orgId: string | null | undefined,
  userId: string | null | undefined,
): OrgMember["role"] | undefined {
  const auth = useAuthClient();
  const { data: members } = useQuery({
    ...orgMembersQueryOptions(auth, orgId ?? ""),
    enabled: !!orgId && !!userId,
  });
  return members?.find((member) => member.userId === userId)?.role;
}

export function useOrganizationMemberActions(auth: AuthClient, orgId: string) {
  const translate = useAppTranslation();
  const queryClient = useQueryClient();
  const removeMemberMutation = useMutation({
    mutationFn: async (member: MemberCardMember) => {
      const memberIdOrEmail = member.user?.email ?? member.userId;
      const { error } = await auth.organization.removeMember({
        memberIdOrEmail,
        organizationId: orgId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success(translate("org.memberRemoved"));
      await queryClient.invalidateQueries({ queryKey: orgMembersQueryKey(orgId) });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  return { removeMemberMutation };
}
