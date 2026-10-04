import {
  ArrowsClockwiseIcon,
  EnvelopeSimpleIcon,
  WalletIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Trans } from "everything-dev/ui/i18n";
import { LocalDate } from "@/components";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { roleLabel } from "./-org-avatar";
import { RowMenu } from "./-row-menu";

export interface InvitationRowInvitation {
  id: string;
  email: string | null;
  nearAccountId?: string | null;
  nearNetwork?: "mainnet" | "testnet" | null;
  role: string | null;
  status: string;
  expiresAt: string | Date;
  teamId?: string | null;
}

export function InvitationRow({
  invitation,
  isCancelling,
  isResending,
  onCancel,
  onResend,
  teamName,
}: {
  invitation: InvitationRowInvitation;
  teamName?: string;
  onResend?: () => void;
  onCancel?: () => void;
  isResending?: boolean;
  isCancelling?: boolean;
}) {
  const translate = useAppTranslation();
  const needsReissue = !!invitation.nearAccountId && !invitation.nearNetwork;
  const identifier =
    invitation.nearAccountId ?? invitation.email ?? translate("invitation.emailFallback");
  const canResend = !!onResend && !needsReissue;

  return (
    <Item size="sm" data-testid={`invitation-${invitation.id}`}>
      <ItemMedia variant="icon">
        {invitation.nearAccountId ? <WalletIcon /> : <EnvelopeSimpleIcon />}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="break-all">{identifier}</ItemTitle>
        <ItemDescription>
          {roleLabel(invitation.role, translate)}
          {teamName && (
            <span data-testid={`invitation-team-${invitation.id}`}>
              {" "}
              · {teamName}
              {translate("org.teamFallback")}
            </span>
          )}
          {invitation.nearAccountId && !needsReissue && (
            <span data-testid={`invitation-network-${invitation.id}`}>
              {" "}
              · {invitation.nearNetwork}
            </span>
          )}{" "}
          ·{" "}
          <Trans
            id="date.expires"
            components={{ date: <LocalDate value={invitation.expiresAt} format="relative" /> }}
          />
        </ItemDescription>
        {needsReissue && (
          <p
            className="text-sm text-warning-muted-foreground"
            data-testid={`invitation-network-${invitation.id}`}
          >
            {translate("org.unknownNetwork")}
          </p>
        )}
      </ItemContent>
      {(canResend || onCancel) && (
        <ItemActions>
          <RowMenu
            label={translate("common.actionsNamed", { name: identifier ?? "" })}
            testId={`invitation-menu-${invitation.id}`}
          >
            {canResend && (
              <DropdownMenuItem onClick={onResend} disabled={isResending}>
                <ArrowsClockwiseIcon />
                {translate("org.resend")}
              </DropdownMenuItem>
            )}
            {onCancel && (
              <DropdownMenuItem variant="destructive" onClick={onCancel} disabled={isCancelling}>
                <XCircleIcon />
                {translate("org.cancelInvite")}
              </DropdownMenuItem>
            )}
          </RowMenu>
        </ItemActions>
      )}
    </Item>
  );
}
