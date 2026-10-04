import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AuthClient } from "@/app";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import type { MemberCardMember } from "./-member-card";
import { orgMembersQueryKey } from "./-organization-query-keys";

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
