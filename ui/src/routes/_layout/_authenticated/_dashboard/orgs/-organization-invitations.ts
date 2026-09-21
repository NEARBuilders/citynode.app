import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ApiClient } from "@/app";
import type { InvitationCardInvitation } from "./-invitation-card";
import type { InviteMemberValues } from "./-invite-member-form";
import { orgInvitationsQueryKey } from "./-organization-query-keys";

export function useOrganizationInvitationActions(apiClient: ApiClient, orgId: string) {
  const queryClient = useQueryClient();
  const invalidateInvitations = () =>
    queryClient.invalidateQueries({ queryKey: orgInvitationsQueryKey(orgId) });
  const inviteMutation = useMutation({
    mutationFn: async (values: InviteMemberValues) => {
      return apiClient.auth.inviteMember({
        organizationId: orgId,
        role: values.role,
        ...(values.email ? { email: values.email } : {}),
        ...(values.nearAccountId ? { nearAccountId: values.nearAccountId } : {}),
        ...(values.teamId ? { teamId: values.teamId } : {}),
      });
    },
    onSuccess: async (_, values) => {
      toast.success(`Invitation created for ${values.email ?? values.nearAccountId}`);
      await invalidateInvitations();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to send invitation"),
  });
  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      await apiClient.auth.cancelInvitation({ invitationId });
    },
    onSuccess: async () => {
      toast.success("Invitation cancelled");
      await invalidateInvitations();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to cancel invitation"),
  });
  const resendInvitationMutation = useMutation({
    mutationFn: async (invitation: InvitationCardInvitation) => {
      return apiClient.auth.inviteMember({
        organizationId: orgId,
        role: (invitation.role ?? "member") as "admin" | "member" | "owner",
        ...(invitation.nearAccountId
          ? { nearAccountId: invitation.nearAccountId }
          : { email: invitation.email }),
        ...(invitation.teamId ? { teamId: invitation.teamId } : {}),
        resend: true,
      });
    },
    onSuccess: async () => {
      toast.success("Invitation resent");
      await invalidateInvitations();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to resend invitation"),
  });

  return { cancelInvitationMutation, inviteMutation, resendInvitationMutation };
}
