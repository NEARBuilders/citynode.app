import { ArrowUpRightIcon, CalendarDotsIcon } from "@phosphor-icons/react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { type ApiClient, useApiClient } from "@/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useNow } from "@/hooks";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";
import {
  type EventVisibility,
  eventVisibility,
  type VisibilityActivity,
  type VisibilityContext,
} from "@/lib/event-visibility";

const badges: Record<
  EventVisibility,
  { label: AppMessageId; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  live: { label: "events.live", variant: "success" },
  scheduled: { label: "events.scheduled", variant: "secondary" },
  published: { label: "events.published", variant: "secondary" },
  draft: { label: "events.draft", variant: "secondary" },
  hiddenImport: { label: "events.hiddenImport", variant: "warning" },
  removed: { label: "events.removedLuma", variant: "destructive" },
  cancelled: { label: "events.cancelled", variant: "destructive" },
  ended: { label: "events.ended", variant: "secondary" },
};

export function discoveryNodeQueryOptions(api: ApiClient, nodeId: string) {
  return queryOptions({
    queryKey: ["discovery-node", nodeId],
    queryFn: () => api.getDiscoveryNode({ nodeId }),
    enabled: !!nodeId,
    retry: false,
    staleTime: 30_000,
  });
}

export function useVisibilityContext(nodeId: string): VisibilityContext {
  const api = useApiClient();
  const node = useQuery(discoveryNodeQueryOptions(api, nodeId));
  const now = useNow(30_000);
  return { communityPublic: node.isSuccess ? node.data !== null : null, now };
}

export function EventVisibilityBadge({
  activity,
  context,
}: {
  activity: VisibilityActivity & { id: string; title: string };
  context: VisibilityContext;
}) {
  const translate = useAppTranslation();
  const state = eventVisibility(activity, context);
  if (!state) return null;
  const { label, variant } = badges[state];
  const testId = `event-visibility-${activity.id}`;
  if (state === "live")
    return (
      <Badge
        variant={variant}
        data-testid={testId}
        data-state={state}
        aria-label={translate("events.liveNamed", { name: activity.title })}
        render={<Link to="/activity/$activityId" params={{ activityId: activity.id }} />}
      >
        {translate(label)}
        <ArrowUpRightIcon data-icon="inline-end" />
      </Badge>
    );
  return (
    <Badge variant={variant} data-testid={testId} data-state={state}>
      {translate(label)}
    </Badge>
  );
}

export function ImportsWaiting({
  count,
  link,
  testId,
}: {
  count: number;
  link?: ReactElement;
  testId: string;
}) {
  const translate = useAppTranslation();
  if (count === 0) return null;
  return (
    <Item variant="outline" data-testid={testId}>
      <ItemMedia variant="icon">
        <CalendarDotsIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{translate("events.importsWaiting", { count })}</ItemTitle>
        <ItemDescription>{translate("events.importsWaitingHint")}</ItemDescription>
      </ItemContent>
      {link && (
        <ItemActions>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={link}
            data-testid={`${testId}-review`}
          >
            {translate("common.review")}
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}
