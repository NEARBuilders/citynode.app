import { EyeSlashIcon, type Icon, MapPinIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApiClient } from "@/app";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";
import {
  communityMapStatus,
  type InactiveTenantStatus,
  type MapStatus,
  type TenantStatus,
} from "@/lib/community-map-status";
import { discoveryNodeQueryOptions } from "./event-visibility";

type NoticeKey = InactiveTenantStatus | "hidden" | "noPin";

type Notice = { icon: Icon; title: AppMessageId; hint: AppMessageId; action?: AppMessageId };

const notices: Record<NoticeKey, Notice> = {
  suspended: {
    icon: WarningCircleIcon,
    title: "community.notOnExplore",
    hint: "community.suspendedHint",
    action: "nav.communitySettings",
  },
  pending: {
    icon: WarningCircleIcon,
    title: "community.notOnExplore",
    hint: "community.pendingHint",
  },
  pending_deletion: {
    icon: WarningCircleIcon,
    title: "community.notOnExplore",
    hint: "community.pendingDeletionHint",
  },
  hidden: {
    icon: EyeSlashIcon,
    title: "community.hidden",
    hint: "community.hiddenMapHint",
    action: "community.publishProfile",
  },
  noPin: {
    icon: MapPinIcon,
    title: "community.notOnMap",
    hint: "community.notOnMapHint",
    action: "community.addLocation",
  },
};

function noticeKey(status: MapStatus): NoticeKey | null {
  if (status.state === "inactive") return status.tenantStatus;
  return status.state === "onMap" ? null : status.state;
}

export function CommunityMapStatus({
  nodeId,
  tenantStatus,
  settingsLink,
  hiddenHint,
  testId,
}: {
  nodeId: string;
  tenantStatus: TenantStatus | undefined;
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
  });
  const key = status && noticeKey(status);
  if (!status || !key) return null;
  const { icon: StatusIcon, title, hint, action } = notices[key];
  return (
    <Item
      variant="outline"
      data-testid={testId}
      data-state={status.state}
      data-tenant-status={status.state === "inactive" ? status.tenantStatus : undefined}
    >
      <ItemMedia variant="icon">
        <StatusIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <p className="text-sm leading-snug font-medium">{translate(title)}</p>
        <p className="text-sm text-muted-foreground">
          {translate(key === "hidden" && hiddenHint ? hiddenHint : hint)}
        </p>
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
