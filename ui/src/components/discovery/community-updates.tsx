import { ArrowUpRightIcon } from "@phosphor-icons/react";
import type { ApiClient } from "@/app";
import { SectionHeader } from "@/components/layout/section-header";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n/runtime";
import { EventList, type PublicActivity } from "./event-list";

type DiscoveryListing = NonNullable<Awaited<ReturnType<ApiClient["getDiscoveryNode"]>>>;
export type CommunityChannel = DiscoveryListing["channels"][number];
type Layout = "panel" | "page";

export function ChannelLinks({
  channels,
  variant = "outline",
  onOpen,
}: {
  channels: CommunityChannel[];
  variant?: "outline" | "ghost";
  onOpen?: (channel: CommunityChannel) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {channels.map((channel) => (
        <Button
          key={channel.url}
          variant={variant}
          size="sm"
          className="max-w-full"
          nativeButton={false}
          render={
            <a
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onOpen?.(channel)}
            >
              <span className="truncate">{channel.label}</span>
              <ArrowUpRightIcon />
            </a>
          }
        />
      ))}
    </div>
  );
}

export function CommunityChannels({
  channels,
  layout = "panel",
  onOpen,
  testId,
}: {
  channels: CommunityChannel[];
  layout?: Layout;
  onOpen?: (channel: CommunityChannel) => void;
  testId?: string;
}) {
  const t = useAppTranslation();
  if (channels.length === 0) return null;
  return (
    <section
      className={layout === "page" ? "flex flex-col gap-6" : "flex flex-col gap-3"}
      data-testid={testId}
    >
      {layout === "page" ? (
        <SectionHeader title={t("explore.detail.channels")} />
      ) : (
        <h3 className="text-sm font-medium text-muted-foreground">
          {t("explore.detail.channels")}
        </h3>
      )}
      <ChannelLinks channels={channels} onOpen={onOpen} />
    </section>
  );
}

export function CommunityUpdates({
  updates,
  nodeId,
  campaign,
  layout = "panel",
  onOpen,
  id,
  testId,
}: {
  updates: PublicActivity[];
  nodeId: string;
  campaign?: string;
  layout?: Layout;
  onOpen?: (activity: PublicActivity) => void;
  id?: string;
  testId?: string;
}) {
  const t = useAppTranslation();
  if (updates.length === 0) return null;
  return (
    <section
      id={id}
      className={
        layout === "page" ? "flex scroll-mt-20 flex-col gap-6" : "flex scroll-mt-20 flex-col gap-4"
      }
      data-testid={testId}
    >
      {layout === "page" ? (
        <SectionHeader title={t("explore.detail.updates")} />
      ) : (
        <h3 className="text-lg font-medium">{t("explore.detail.updates")}</h3>
      )}
      <EventList events={updates} nodeId={nodeId} campaign={campaign} onOutbound={onOpen} />
    </section>
  );
}
