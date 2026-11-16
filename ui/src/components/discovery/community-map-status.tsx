import { MapPinIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { nodeByIdQueryOptions } from "@/lib/queries/nodes";
import { resolvePlaceQueryOptions } from "@/lib/queries/places";

export function CommunityMapStatus({ nodeId, testId }: { nodeId: string; testId: string }) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const node = useQuery(nodeByIdQueryOptions(api, nodeId));
  const placeId = node.data?.placeId ?? "";
  const place = useQuery({
    ...resolvePlaceQueryOptions(api, placeId),
    enabled: Boolean(placeId),
  });
  if (!node.isSuccess || !placeId) return null;
  if (!place.isSuccess || !place.data || place.data.community) return null;
  const slug = place.data.place.slug;
  return (
    <Item variant="outline" data-testid={testId} data-state="unactivated">
      <ItemMedia variant="icon">
        <MapPinIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <p className="text-sm leading-snug font-medium">{translate("community.notOnExplore")}</p>
        <p className="text-sm text-muted-foreground">{translate("community.unactivatedHint")}</p>
      </ItemContent>
      <ItemActions className="basis-full sm:basis-auto">
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link to="/places/$slug" params={{ slug }} data-testid={`${testId}-action`} />}
        >
          {translate("place.startCommunity")}
        </Button>
      </ItemActions>
    </Item>
  );
}
