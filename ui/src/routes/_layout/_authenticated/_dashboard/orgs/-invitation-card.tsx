import { Mail, RefreshCw, Trash2, UsersRound } from "lucide-react";
import { Button, Card, CardContent } from "@/components";

export interface InvitationCardInvitation {
  id: string;
  email: string;
  role: string;
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
  return (
    <Card className="hover:shadow-md">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="font-medium text-sm break-all">{invitation.email}</div>
            </div>
            <div className="text-xs text-muted-foreground font-mono">{invitation.role}</div>
            {teamName && (
              <div
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                data-testid={`invitation-team-${invitation.id}`}
              >
                <UsersRound className="h-3 w-3" />
                team {teamName}
              </div>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {onResend && (
              <Button onClick={onResend} disabled={isResending} variant="outline">
                <RefreshCw className="h-3 w-3 mr-1" />
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
                <Trash2 className="h-3 w-3 mr-1" />
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
