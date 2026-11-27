import { ArrowRightIcon, CompassIcon, MapPinIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useApiClient } from "@/app";
import { Button, EmptyState } from "@/components";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PlaceOutlineMap } from "@/components/discovery/place-outline-map";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { nodeKindLabel } from "@/lib/node-kind";
import { pageTitle } from "@/lib/page-title";
import { placeBoundaryQueryOptions, placeResolutionQueryOptions } from "@/lib/queries/places";
import { socialMeta } from "@/lib/social-meta";

export const Route = createFileRoute("/_public/places/$slug")({
  loader: async ({ params, context }) => {
    const { queryClient, apiClient, runtimeConfig } = context;
    const resolved = await queryClient.ensureQueryData(
      placeResolutionQueryOptions(apiClient, params.slug),
    );
    if (resolved?.place.id) {
      await queryClient.prefetchQuery(placeBoundaryQueryOptions(apiClient, resolved.place.id));
    }
    return { slug: params.slug, runtimeConfig, placeName: resolved?.place.name ?? null };
  },
  head: ({ loaderData, match, params }) => {
    const locale = resolveAppLocale(undefined, match.context.locale);
    const title = pageTitle(
      loaderData?.placeName ?? translateAppMessage("place.title", undefined, locale),
      loaderData?.runtimeConfig,
    );
    const description = loaderData?.placeName
      ? translateAppMessage("place.noCommunityNamed", { name: loaderData.placeName }, locale)
      : translateAppMessage("place.notFoundDescription", undefined, locale);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...socialMeta({
          title,
          description,
          path: `/places/${params.slug}`,
          runtimeConfig: loaderData?.runtimeConfig,
        }),
      ],
    };
  },
  component: PlacePage,
});

function PlacePage() {
  const translate = useAppTranslation();
  const { slug } = Route.useLoaderData();
  const api = useApiClient();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const resolved = useQuery(placeResolutionQueryOptions(api, slug));
  const boundary = useQuery({
    ...placeBoundaryQueryOptions(api, resolved.data?.place.id ?? ""),
    enabled: Boolean(resolved.data?.place.id),
  });

  if (resolved.isPending) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-6" role="status" aria-label={translate("place.loading")}>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </PageContainer>
    );
  }

  if (!resolved.data) {
    return (
      <PageContainer>
        <EmptyState
          icon={CompassIcon}
          title={translate("place.notFound")}
          description={translate("place.missingNamed", { slug })}
          action={
            <Button
              nativeButton={false}
              render={<Link to="/explore" data-testid="place-page.back-to-explore" />}
            >
              {translate("community.backExplore")}
            </Button>
          }
        />
      </PageContainer>
    );
  }

  if (resolved.data.community) {
    return <Navigate to="/n/$slug" params={{ slug: resolved.data.community.slug }} />;
  }

  const place = resolved.data.place;

  return (
    <PageContainer>
      <header className="flex flex-col gap-6" data-testid="place-page.header">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {place.label ? <span>{nodeKindLabel(place.label, undefined, translate)}</span> : null}
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPinIcon className="size-4 shrink-0" />
            {place.name}
          </span>
        </div>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <h1 className="text-3xl font-semibold wrap-anywhere text-foreground sm:text-4xl">
              {place.name}
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
              {translate("place.noCommunity")}
            </p>
          </div>
          <Button onClick={() => setConfirmOpen(true)} data-testid="place-page.start-community">
            {translate("place.startCommunity")}
            <ArrowRightIcon />
          </Button>
        </div>
      </header>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={translate("place.startConfirmTitle", { name: place.name })}
        description={translate("place.startConfirmDescription")}
        confirmLabel={translate("place.startConfirm")}
        cancelLabel={translate("common.cancel")}
        onConfirm={() => navigate({ to: "/join", search: { place: place.slug } })}
      />
      <PlaceOutlineMap
        name={place.name}
        latitude={place.latitude}
        longitude={place.longitude}
        boundary={boundary.data ?? null}
      />
    </PageContainer>
  );
}
