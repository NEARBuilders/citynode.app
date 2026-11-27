import { CalendarCheckIcon, MedalIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { Button, SectionHeader } from "@/components";
import { LocalDate } from "@/components/local-date";
import { collectibleKey, ShardDogViewLink } from "@/components/sharddog-collectible";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { accountCollectiblesQueryOptions } from "@/lib/queries/attendance";

export function AccountCollectibles({
  accountId,
  testId = "account.collectibles",
}: {
  accountId: string;
  testId?: string;
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const collectibles = useQuery(accountCollectiblesQueryOptions(apiClient, accountId));

  if (!collectibles.data?.enabled) return null;

  return (
    <section className="flex min-w-0 flex-col gap-6" data-testid={testId}>
      <SectionHeader
        title={translate("collectibles.profileTitle")}
        description={translate("collectibles.profileDescription")}
      />
      {collectibles.isError ? (
        <div
          className="flex flex-wrap items-center gap-2 text-sm text-destructive"
          role="alert"
          data-testid={`${testId}-error`}
        >
          <span>{translate("collectibles.profileLoadFailed")}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void collectibles.refetch()}
            data-testid={`${testId}-retry`}
          >
            {translate("common.retry")}
          </Button>
        </div>
      ) : collectibles.data.collectibles.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
          {translate("collectibles.profileEmpty")}
        </p>
      ) : (
        <ItemGroup data-testid={`${testId}-list`}>
          {collectibles.data.collectibles.map((collectible) => (
            <Item
              key={collectibleKey(collectible.organizationId, collectible.eventId)}
              variant="outline"
              data-testid={`${testId}-${collectible.kind}`}
            >
              <ItemMedia variant="icon">
                {collectible.kind === "membership" ? <MedalIcon /> : <CalendarCheckIcon />}
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="break-words">
                  {collectible.eventTitle ?? translate("collectibles.membershipShardDog")}
                </ItemTitle>
                <ItemDescription className="flex flex-col gap-0.5">
                  <span className="break-words">{collectible.communityName}</span>
                  <span>
                    {translate("collectibles.collectedOn")}{" "}
                    <LocalDate value={collectible.awardedAt} format="date" />
                  </span>
                </ItemDescription>
              </ItemContent>
              <ItemActions className="basis-full sm:basis-auto">
                <ShardDogViewLink href={collectible.viewUrl} testId={`${testId}-view`} />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </section>
  );
}
