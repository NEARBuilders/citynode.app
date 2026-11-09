export interface InvitationLifecycle<Status extends string = string> {
  status: Status;
  expiresAt: string | Date;
}

export function invitationStatus<Status extends string>(
  invitation: InvitationLifecycle<Status>,
  now = Date.now(),
): Status | "expired" {
  return invitation.status === "pending" && new Date(invitation.expiresAt).getTime() <= now
    ? "expired"
    : invitation.status;
}

export function isOpenInvitation(invitation: InvitationLifecycle, now = Date.now()): boolean {
  return invitationStatus(invitation, now) === "pending";
}
