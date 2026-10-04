import {
  ArrowUpIcon,
  BroadcastIcon,
  CaretRightIcon,
  CubeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { useMemo, useState } from "react";
import { useApiClient } from "@/app";
import { Badge, Button, EmptyState, LocalDate, PageContainer, PageHeader } from "@/components";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { thingQueryKeys } from "./-thing-cache";
import { filterThings } from "./-thing-list";

type ApiClient = ReturnType<typeof useApiClient>;
type Thing = Awaited<ReturnType<ApiClient["template"]["listThings"]>>["data"][number];

const EMPTY_THINGS: Thing[] = [];

export const Route = createFileRoute("/_authenticated/_dashboard/things/")({
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "nav.things",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
      {
        name: "description",
        content: translateAppMessage(
          "meta.thingsDescription",
          undefined,
          resolveAppLocale(undefined, match.context.locale),
        ),
      },
    ],
  }),
  component: ThingsIndexPage,
});

function ThingsIndexPage() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const [query, setQuery] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: thingQueryKeys.list,
    queryFn: () => apiClient.template.listThings({ limit: 50 }),
    staleTime: 30 * 1000,
  });

  const things = data?.data ?? EMPTY_THINGS;
  const thingIds = useMemo(() => things.map((thing) => thing.thingId), [things]);
  const visibleThings = useMemo(() => filterThings(things, query), [things, query]);

  const upvoteCountsQuery = useQuery({
    queryKey: [...thingQueryKeys.upvoteCounts, thingIds],
    queryFn: () => apiClient.votes.getUpvoteCounts({ entityIds: thingIds }),
    enabled: thingIds.length > 0,
    staleTime: 30 * 1000,
  });

  const newThingButton = (
    <Button nativeButton={false} render={<Link to="/things/new" />} data-testid="things-new">
      <PlusIcon />
      {translate("things.new")}
    </Button>
  );

  return (
    <PageContainer variant="default">
      <PageHeader
        title={translate("common.things")}
        description={translate("things.listDescription")}
        headerTestId="things.heading"
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/things/live" />}
              data-testid="things-live"
            >
              <BroadcastIcon />
              {translate("things.live")}
            </Button>
            {newThingButton}
          </>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11 w-full max-w-sm" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <EmptyState
          icon={CubeIcon}
          title={translate("things.loadFailed")}
          description={appErrorMessage(error, translate)}
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              {translate("common.retry")}
            </Button>
          }
        />
      ) : things.length === 0 ? (
        <EmptyState
          icon={CubeIcon}
          title={translate("things.empty")}
          description={translate("things.emptyDescription")}
          action={newThingButton}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <InputGroup className="w-full sm:max-w-sm">
              <InputGroupAddon>
                <MagnifyingGlassIcon />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={translate("things.search")}
                placeholder={translate("things.searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                data-testid="things-search"
              />
            </InputGroup>
            <span className="text-sm text-muted-foreground tabular-nums">
              {visibleThings.length === things.length
                ? translate("things.totalCount", { count: things.length })
                : translate("things.filteredCount", {
                    shown: visibleThings.length,
                    total: things.length,
                  })}
            </span>
          </div>

          {visibleThings.length === 0 ? (
            <EmptyState
              icon={MagnifyingGlassIcon}
              title={translate("things.noMatches")}
              description={translate("things.noMatchesNamed", { query: query.trim() ?? "" })}
              action={
                <Button variant="outline" onClick={() => setQuery("")}>
                  {translate("things.clearSearch")}
                </Button>
              }
            />
          ) : (
            <ItemGroup data-testid="things-list">
              {visibleThings.map((thing) => (
                <Item
                  key={thing.thingId}
                  variant="outline"
                  size="sm"
                  role="listitem"
                  render={<Link to="/things/$thingId" params={{ thingId: thing.thingId }} />}
                  data-testid={`things-row-${thing.thingId}`}
                >
                  <ItemMedia variant="icon">
                    <CubeIcon />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="max-w-full">
                      <span className="truncate font-mono">{thing.thingId}</span>
                    </ItemTitle>
                    <ItemDescription>
                      <Trans
                        id="date.updated"
                        components={{
                          date: <LocalDate value={thing.updatedAt} format="relative" />,
                        }}
                      />
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant="outline" className="hidden font-mono sm:inline-flex">
                      {thing.type}
                    </Badge>
                    <span className="inline-flex min-w-10 items-center justify-end gap-1 text-sm text-muted-foreground tabular-nums">
                      <ArrowUpIcon />
                      {upvoteCountsQuery.isLoading
                        ? "—"
                        : (upvoteCountsQuery.data?.[thing.thingId]?.totalCount ?? 0)}
                      <span className="sr-only">{translate("things.upvotes")}</span>
                    </span>
                    <CaretRightIcon className="text-muted-foreground" />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </div>
      )}
    </PageContainer>
  );
}
