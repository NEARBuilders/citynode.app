import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AuthClient } from "@/app";
import type { InvitationCardInvitation } from "./-invitation-card";
import type { InviteMemberValues } from "./-invite-member-form";
import { orgInvitationsQueryKey } from "./-organization-query-keys";

export function useOrganizationInvitationActions(auth: AuthClient, orgId: string) {
  const queryClient = useQueryClient();
  const invalidateInvitations = () =>
    queryClient.invalidateQueries({ queryKey: orgInvitationsQueryKey(orgId) });
  const inviteMutation = useMutation({
    mutationFn: async (values: InviteMemberValues) => {
      const { error } = await auth.organization.inviteMember({
        organizationId: orgId,
        email: values.email,
        role: values.role,
        ...(values.teamId ? { teamId: values.teamId } : {}),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_, values) => {
      toast.success(`Invitation sent to ${values.email}`);
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
        ...(invitation.teamId ? { teamId: invitation.teamId } : {}),
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
