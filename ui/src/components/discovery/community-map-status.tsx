import { EyeSlashIcon, type Icon, MapPinIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApiClient } from "@/app";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";
import { communityMapStatus, type MapStatus, type TenantStatus } from "@/lib/community-map-status";
import { discoveryNodeQueryOptions } from "./event-visibility";

type Notice = { icon: Icon; title: AppMessageId; hint: AppMessageId; action?: AppMessageId };

const inactiveHints: Record<Exclude<TenantStatus, "active">, AppMessageId> = {
  suspended: "community.suspendedHint",
  pending: "community.pendingHint",
  pending_deletion: "community.pendingDeletionHint",
};

function notice(status: MapStatus, hiddenHint: AppMessageId): Notice | null {
  if (status.state === "inactive")
    return {
      icon: WarningCircleIcon,
      title: "community.notOnExplore",
      hint: inactiveHints[status.status],
      action: status.status === "suspended" ? "nav.communitySettings" : undefined,
    };
  if (status.state === "hidden")
    return {
      icon: EyeSlashIcon,
      title: "community.hidden",
      hint: hiddenHint,
      action: "community.publishProfile",
    };
  if (status.state === "noPin")
    return {
      icon: MapPinIcon,
      title: "community.notOnMap",
      hint: "community.notOnMapHint",
      action: "community.addLocation",
    };
  return null;
}

export function CommunityMapStatus({
  nodeId,
  tenantStatus,
  published,
  settingsLink,
  hiddenHint = "community.hiddenMapHint",
  testId,
}: {
  nodeId: string;
  tenantStatus: TenantStatus | null | undefined;
  published?: boolean;
  settingsLink?: ReactElement;
  hiddenHint?: AppMessageId;
  testId: string;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const listing = useQuery(discoveryNodeQueryOptions(api, nodeId));
  const status = communityMapStatus({
    tenantStatus,
    listing: listing.isSuccess ? listing.data : undefined,
    published,
  });
  const content = status && notice(status, hiddenHint);
  if (!status || !content) return null;
  const { icon: StatusIcon, title, hint, action } = content;
  return (
    <Item
      variant="outline"
      data-testid={testId}
      data-state={status.state}
      data-status={status.state === "inactive" ? status.status : undefined}
    >
      <ItemMedia variant="icon">
        <StatusIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <p className="text-sm leading-snug font-medium">{translate(title)}</p>
        <p className="text-sm text-muted-foreground">{translate(hint)}</p>
      </ItemContent>
      {action && settingsLink && (
        <ItemActions className="basis-full sm:basis-auto">
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={settingsLink}
            data-testid={`${testId}-action`}
          >
            {translate(action)}
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}
