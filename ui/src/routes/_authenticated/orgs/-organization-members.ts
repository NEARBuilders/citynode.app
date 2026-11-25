import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type ApiClient, type AuthClient, useApiClient } from "@/app";
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

const MEMBER_PAGE_SIZE = 100;

async function fetchOrgMembers(apiClient: ApiClient, orgId: string): Promise<OrgMember[]> {
  const members: OrgMember[] = [];
  for (;;) {
    const page = await apiClient.auth.listMembers({
      organizationId: orgId,
      limit: MEMBER_PAGE_SIZE,
      offset: members.length,
    });
    const batch = page.members ?? [];
    members.push(...batch);
    if (batch.length < MEMBER_PAGE_SIZE || members.length >= page.total) return members;
  }
}

export function orgMembersQueryOptions(apiClient: ApiClient, orgId: string) {
  return queryOptions({
    queryKey: orgMembersQueryKey(orgId),
    queryFn: () => fetchOrgMembers(apiClient, orgId),
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

export function useOrgMemberRole(
  orgId: string | null | undefined,
  userId: string | null | undefined,
): OrgMember["role"] | undefined {
  const apiClient = useApiClient();
  const { data: role } = useQuery({
    ...orgActiveRoleQueryOptions(apiClient, orgId ?? ""),
    enabled: !!orgId && !!userId,
  });
  return role ?? undefined;
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
