import {
  ArrowsClockwiseIcon,
  EnvelopeIcon,
  TrashIcon,
  UsersThreeIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Button, Card, CardContent } from "@/components";

export interface InvitationCardInvitation {
  id: string;
  email: string;
  nearAccountId?: string | null;
  nearNetwork?: "mainnet" | "testnet" | null;
  role: string | null;
  status: string;
  expiresAt: string | Date;
  teamId?: string | null;
}

export function InvitationCard({
  invitation,
  isCancelling,
  isResending,
  onCancel,
  onResend,
  teamName,
}: {
  invitation: InvitationCardInvitation;
  teamName?: string;
  onResend?: () => void;
  onCancel?: () => void;
  isResending?: boolean;
  isCancelling?: boolean;
}) {
  const needsReissue = !!invitation.nearAccountId && !invitation.nearNetwork;
  return (
    <Card className="hover:shadow-md">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              {invitation.nearAccountId ? (
                <WalletIcon className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <EnvelopeIcon className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="font-medium text-sm break-all">
                {invitation.nearAccountId ?? invitation.email}
              </div>
            </div>
            <div className="text-xs text-muted-foreground font-mono">{invitation.role}</div>
            {invitation.nearAccountId && (
              <div
                className="text-xs text-muted-foreground"
                data-testid={`invitation-network-${invitation.id}`}
              >
                {needsReissue
                  ? "Network unknown. Cancel and reissue this invitation with an explicit network."
                  : invitation.nearNetwork}
              </div>
            )}
            {teamName && (
              <div
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                data-testid={`invitation-team-${invitation.id}`}
              >
                <UsersThreeIcon className="h-3 w-3" />
                team {teamName}
              </div>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {onResend && !needsReissue && (
              <Button onClick={onResend} disabled={isResending} variant="outline">
                <ArrowsClockwiseIcon className="h-3 w-3 mr-1" />
                resend
              </Button>
            )}
            {onCancel && (
              <Button
                onClick={onCancel}
                disabled={isCancelling}
                variant="outline"
                className="text-destructive hover:text-destructive"
              >
                <TrashIcon className="h-3 w-3 mr-1" />
                cancel
              </Button>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          expires {new Date(invitation.expiresAt).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}
