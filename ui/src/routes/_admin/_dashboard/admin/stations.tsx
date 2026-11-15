import { CalendarPlusIcon, QrCodeIcon, UserPlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, getAppName, useApiClient, useAuthClient } from "@/app";
import {
  Button,
  EmptyState,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  PageHeader,
  SectionHeader,
} from "@/components";
import { useSwitchOrganization } from "@/components/layout/use-switch-organization";
import { appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { sessionQueryOptions } from "@/lib/auth";
import { pageTitle } from "@/lib/page-title";
import {
  platformStationsQueryKey,
  platformStationsQueryOptions,
} from "@/lib/queries/platform-stations";
import { deriveSlug } from "@/lib/slug";
import { ListSkeleton, LoadError } from "./-admin-ui";

type PlatformStations = Awaited<ReturnType<ApiClient["getPlatformStations"]>>;
type PlatformOrganization = NonNullable<PlatformStations["organization"]>;

export const Route = createFileRoute("/_admin/_dashboard/admin/stations")({
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "meta.stationsAdmin",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: AdminStationsPage,
});

function AdminStationsPage() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const stations = useQuery(platformStationsQueryOptions(apiClient));

  return (
    <>
      <PageHeader
        title={translate("admin.stations.title")}
        description={translate("admin.stations.description")}
        headerTestId="admin-stations.heading"
      />
      {stations.isPending ? (
        <ListSkeleton rows={2} />
      ) : stations.isError ? (
        <LoadError
          message={translate("admin.stations.loadError")}
          onRetry={() => void stations.refetch()}
          testId="admin-stations.error"
        />
      ) : !stations.data.account ? (
        <EmptyState
          icon={QrCodeIcon}
          title={translate("admin.stations.unconfigured")}
          description={translate("admin.stations.unconfiguredHint")}
          data-testid="admin-stations.unconfigured"
        />
      ) : stations.data.organization ? (
        <PlatformStationsReady organization={stations.data.organization} />
      ) : (
        <SetUpPlatformStations />
      )}
    </>
  );
}

function useStoreStations() {
  const queryClient = useQueryClient();
  return (stations: PlatformStations) => {
    queryClient.setQueryData(platformStationsQueryKey, stations);
    return queryClient.invalidateQueries({ queryKey: ["organizations"] });
  };
}

function SetUpPlatformStations() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const store = useStoreStations();
  const { runtimeConfig } = Route.useRouteContext();
  const [name, setName] = useState(() => getAppName(runtimeConfig));
  const [slug, setSlug] = useState(() => deriveSlug(getAppName(runtimeConfig), "", false));
  const [slugEdited, setSlugEdited] = useState(false);
  const setUp = useMutation({
    mutationFn: () => apiClient.setUpPlatformStations({ name: name.trim(), slug }),
    onSuccess: async (stations) => {
      await store(stations);
      toast.success(translate("admin.stations.setUpDone"));
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  return (
    <section className="flex max-w-xl flex-col gap-6" data-testid="admin-stations.setup">
      <SectionHeader
        title={translate("admin.stations.setUpTitle")}
        description={translate("admin.stations.setUpHint")}
      />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setUp.mutate();
        }}
      >
        <Field>
          <FieldLabel htmlFor="platform-stations-name">
            {translate("admin.stations.name")}
          </FieldLabel>
          <Input
            id="platform-stations-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSlug(deriveSlug(event.target.value, slug, slugEdited));
            }}
            data-testid="admin-stations.name"
          />
          <FieldDescription>{translate("admin.stations.nameHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="platform-stations-slug">
            {translate("admin.stations.slug")}
          </FieldLabel>
          <Input
            id="platform-stations-slug"
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
            data-testid="admin-stations.slug"
          />
        </Field>
        <Button
          type="submit"
          className="self-start"
          disabled={!name.trim() || !slug || setUp.isPending}
          data-testid="admin-stations.set-up"
        >
          <QrCodeIcon />
          {translate("admin.stations.setUp")}
        </Button>
      </form>
    </section>
  );
}

function PlatformStationsReady({ organization }: { organization: PlatformOrganization }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const navigate = useNavigate();
  const store = useStoreStations();
  const session = useQuery(sessionQueryOptions(auth));
  const switchOrganization = useSwitchOrganization();
  const join = useMutation({
    mutationFn: () => apiClient.joinPlatformStations(),
    onSuccess: async (stations) => {
      await store(stations);
      toast.success(translate("admin.stations.joined"));
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  const enter = (open: () => Promise<void>) => {
    if (session.data?.session?.activeOrganizationId === organization.id) {
      void open();
      return;
    }
    switchOrganization.mutate(organization.id, { onSuccess: () => void open() });
  };
  const busy = switchOrganization.isPending || join.isPending;
  const values = { name: organization.name };

  return (
    <section className="flex max-w-2xl flex-col gap-6" data-testid="admin-stations.ready">
      <SectionHeader
        title={organization.name}
        description={
          organization.role
            ? translate("admin.stations.readyHint", values)
            : translate("admin.stations.notOrganizer", values)
        }
      />
      {organization.role ? (
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy}
            onClick={() =>
              enter(() =>
                navigate({
                  to: "/orgs/$slug",
                  params: { slug: organization.slug },
                  search: { tab: "onboard" },
                }),
              )
            }
            data-testid="admin-stations.open"
          >
            <QrCodeIcon />
            {translate("admin.stations.open")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              enter(() =>
                navigate({
                  to: "/nodes/$nodeId/content",
                  params: { nodeId: organization.nodeId },
                  search: { tab: "events" },
                }),
              )
            }
            data-testid="admin-stations.add-event"
          >
            <CalendarPlusIcon />
            {translate("station.addEvent")}
          </Button>
        </div>
      ) : (
        <Button
          className="self-start"
          disabled={busy}
          onClick={() => join.mutate()}
          data-testid="admin-stations.join"
        >
          <UserPlusIcon />
          {translate("admin.stations.join", values)}
        </Button>
      )}
    </section>
  );
}
