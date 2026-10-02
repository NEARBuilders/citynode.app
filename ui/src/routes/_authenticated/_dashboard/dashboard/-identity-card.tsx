import { CheckCircleIcon, GearSixIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { pluginPath, type SessionData } from "@/app";
import { Avatar, AvatarFallback, AvatarImage, Badge, Button, Card } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { isSyntheticEmail } from "@/lib/synthetic-email";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0]}${parts[1]?.[0]}` : name.slice(0, 2)).toUpperCase();
}

function MethodRow({
  label,
  value,
  action,
}: {
  label: string;
  value: string | null;
  action?: ReactNode;
}) {
  const translate = useAppTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value ? (
        <span className="flex min-w-0 items-center gap-1.5 text-sm">
          <CheckCircleIcon className="size-4 shrink-0 text-success" />
          <span className="truncate">{value}</span>
        </span>
      ) : action ? (
        action
      ) : (
        <span className="text-sm text-muted-foreground">{translate("dashboard.notAdded")}</span>
      )}
    </div>
  );
}

export function IdentityCard({
  user,
  nearAccountId,
  passkeyCount,
  onAddEmail,
}: {
  user: SessionData["user"];
  nearAccountId: string | null;
  passkeyCount: number;
  onAddEmail?: () => void;
}) {
  const translate = useAppTranslation();
  const name = user.name || nearAccountId || translate("lifecycle.you");
  const realEmail = isSyntheticEmail(user.email) ? null : (user.email ?? null);
  return (
    <Card className="gap-4 px-6" data-testid="home-identity">
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-medium">{name}</span>
          {user.isAnonymous ? (
            <Badge variant="warning">{translate("dashboard.guest")}</Badge>
          ) : (
            <span className="truncate text-sm text-muted-foreground">
              {nearAccountId ?? realEmail ?? translate("dashboard.signedIn")}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border">
        <MethodRow
          label={translate("dashboard.passkey")}
          value={
            passkeyCount > 0
              ? translate("dashboard.passkeysAdded", { count: passkeyCount ?? "" })
              : null
          }
        />
        <MethodRow label={translate("dashboard.nearWallet")} value={nearAccountId} />
        <MethodRow
          label={translate("common.email")}
          value={realEmail}
          action={
            !user.isAnonymous && onAddEmail ? (
              <Button
                variant="link"
                size="xs"
                onClick={onAddEmail}
                data-testid="home-identity-add-email"
              >
                {translate("common.add")}
              </Button>
            ) : undefined
          }
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        nativeButton={false}
        render={<Link to={pluginPath("/settings")} preload="intent" />}
        data-testid="home-settings-link"
      >
        <GearSixIcon />
        {translate("common.settings")}
      </Button>
    </Card>
  );
}
