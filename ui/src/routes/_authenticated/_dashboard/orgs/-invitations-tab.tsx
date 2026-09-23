import { TabsContent } from "@/components";
import { OrganizationEmptyState } from "./-empty-state";
import { InvitationCard, type InvitationCardInvitation } from "./-invitation-card";
import { InviteMemberForm, type InviteMemberValues } from "./-invite-member-form";

export function InvitationsTab({
  canManageMembers,
  invitePending,
  invitations,
  isPersonal,
  onCancel,
  onInvite,
  onResend,
  isCancelling,
  isResending,
  teams,
}: {
  canManageMembers: boolean;
  invitePending: boolean;
  invitations: InvitationCardInvitation[];
  isPersonal: boolean;
  onCancel: (id: string) => void;
  onInvite: (values: InviteMemberValues) => Promise<unknown>;
  onResend: (invitation: InvitationCardInvitation) => void;
  isCancelling: boolean;
  isResending: boolean;
  teams: Array<{ id: string; name: string }>;
}) {
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  return (
    <TabsContent value="invitations" className="space-y-6 pt-4">
      {canManageMembers && !isPersonal && (
        <InviteMemberForm teams={teams} isPending={invitePending} onInvite={onInvite} />
      )}

      {pendingInvitations.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {pendingInvitations.map((invitation) => (
            <InvitationCard
              key={invitation.id}
              invitation={invitation}
              teamName={invitation.teamId ? teamNames.get(invitation.teamId) : undefined}
              onCancel={canManageMembers ? () => onCancel(invitation.id) : undefined}
              onResend={canManageMembers ? () => onResend(invitation) : undefined}
              isCancelling={isCancelling}
              isResending={isResending}
            />
          ))}
        </div>
      ) : (
        <OrganizationEmptyState label="No pending invitations" />
      )}
    </TabsContent>
  );
}
