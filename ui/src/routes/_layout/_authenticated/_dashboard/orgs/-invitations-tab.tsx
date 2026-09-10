import { Button, Card, Input, TabsContent } from "@/components";
import { OrganizationEmptyState } from "./-empty-state";
import { InvitationCard, type InvitationCardInvitation } from "./-invitation-card";

export function InvitationsTab({
  canManageMembers,
  inviteEmail,
  invitePending,
  inviteRole,
  invitations,
  isPersonal,
  onCancel,
  onEmailChange,
  onInvite,
  onResend,
  onRoleChange,
  isCancelling,
  isResending,
}: {
  canManageMembers: boolean;
  inviteEmail: string;
  invitePending: boolean;
  inviteRole: "admin" | "member";
  invitations: InvitationCardInvitation[];
  isPersonal: boolean;
  onCancel: (id: string) => void;
  onEmailChange: (value: string) => void;
  onInvite: () => void;
  onResend: (invitation: InvitationCardInvitation) => void;
  onRoleChange: (role: "admin" | "member") => void;
  isCancelling: boolean;
  isResending: boolean;
}) {
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  return (
    <TabsContent value="invitations" className="space-y-6 pt-4">
      {canManageMembers && !isPersonal && (
        <Card className="p-6 space-y-4 hover:shadow-md">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Invite member
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="email@example.com"
            />
            <select
              aria-label="Role"
              value={inviteRole}
              onChange={(event) => onRoleChange(event.target.value as "admin" | "member")}
              className="w-full px-3 py-2 text-sm bg-card text-foreground border-2 border-inset border-border-strong rounded-[8px] outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button onClick={onInvite} disabled={invitePending || !inviteEmail} variant="outline">
            {invitePending ? "sending..." : "send invitation"}
          </Button>
        </Card>
      )}

      {pendingInvitations.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {pendingInvitations.map((invitation) => (
            <InvitationCard
              key={invitation.id}
              invitation={invitation}
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
