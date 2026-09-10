import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AuthClient } from "@/app";
import type { InvitationCardInvitation } from "./-invitation-card";
import { orgInvitationsQueryKey } from "./-organization-query-keys";

export function useOrganizationInvitationActions(
  auth: AuthClient,
  orgId: string,
  inviteEmail: string,
  inviteRole: "admin" | "member",
  onInvited: () => void,
) {
  const queryClient = useQueryClient();
  const invalidateInvitations = () =>
    queryClient.invalidateQueries({ queryKey: orgInvitationsQueryKey(orgId) });
  const inviteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.organization.inviteMember({
        organizationId: orgId,
        email: inviteEmail,
        role: inviteRole,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success(`Invitation sent to ${inviteEmail}`);
      onInvited();
      await invalidateInvitations();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to send invitation"),
  });
  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await auth.organization.cancelInvitation({ invitationId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Invitation cancelled");
      await invalidateInvitations();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to cancel invitation"),
  });
  const resendInvitationMutation = useMutation({
    mutationFn: async (invitation: InvitationCardInvitation) => {
      const { error } = await auth.organization.inviteMember({
        organizationId: orgId,
        email: invitation.email,
        role: invitation.role as "admin" | "member" | "owner",
        resend: true,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Invitation resent");
      await invalidateInvitations();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to resend invitation"),
  });

  return { cancelInvitationMutation, inviteMutation, resendInvitationMutation };
}
