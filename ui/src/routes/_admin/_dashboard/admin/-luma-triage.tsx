import { ArrowUpRightIcon, MapPinIcon } from "@phosphor-icons/react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import { EmptyState, LocalDate } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { engagementQueryKeys } from "@/lib/queries/engagement";
import { rootPlacesQueryOptions } from "@/lib/queries/places";
import { ChildLevel, PlaceLevel } from "@/routes/_authenticated/_dashboard/-apply-place-fields";
import type { ApplicationPlace } from "@/routes/_authenticated/_dashboard/-node-application";
import { ListSkeleton, LoadError } from "./-admin-ui";

type TriageEvent = Awaited<ReturnType<ApiClient["listDiscoveryLumaTriage"]>>["events"][number];

export function lumaTriageQueryOptions(apiClient: ApiClient) {
  return queryOptions({
    queryKey: ["discovery-luma-triage"],
    queryFn: () => apiClient.listDiscoveryLumaTriage(),
  });
}

export function LumaTriage() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const triage = useQuery(lumaTriageQueryOptions(apiClient));
  const [associating, setAssociating] = useState<TriageEvent | null>(null);

  if (triage.isError)
    return (
      <LoadError
        message={translate("admin.triage.failed")}
        onRetry={() => void triage.refetch()}
        testId="admin-triage-error"
      />
    );
  if (triage.isPending) return <ListSkeleton rows={3} />;
  const events = triage.data.events;
  return (
    <div className="flex flex-col gap-4" data-testid="admin-triage">
      <p className="text-sm text-muted-foreground">{translate("admin.triage.description")}</p>
      {events.length === 0 ? (
        <EmptyState icon={MapPinIcon} title={translate("admin.triage.empty")} className="py-10" />
      ) : (
        <ItemGroup>
          {events.map((event) => (
            <Item key={event.id} variant="outline" data-testid={`admin-triage-${event.id}`}>
              <ItemContent className="min-w-0">
                <ItemTitle className="flex-wrap">
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {event.title}
                    <ArrowUpRightIcon />
                  </a>
                </ItemTitle>
                <ItemDescription>
                  {event.startsAt && <LocalDate value={event.startsAt} format="datetime" />}
                  {event.venue ? ` · ${event.venue}` : ""}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid={`admin-triage-associate-${event.id}`}
                  onClick={() => setAssociating(event)}
                >
                  {translate("admin.triage.associate")}
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
      <AssociateDialog event={associating} onClose={() => setAssociating(null)} />
    </div>
  );
}

function AssociateDialog({ event, onClose }: { event: TriageEvent | null; onClose: () => void }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const client = useQueryClient();
  const [path, setPath] = useState<ApplicationPlace[]>([]);
  const { data: roots = [] } = useQuery(rootPlacesQueryOptions(apiClient));
  const selected = path.at(-1);
  const associate = useMutation({
    mutationFn: (input: { activityId: string; placeId: string }) =>
      apiClient.associateDiscoveryLumaEvent(input),
    onSuccess: async () => {
      toast.success(translate("admin.triage.associated", { place: selected?.name ?? "" }));
      setPath([]);
      onClose();
      await Promise.all([
        client.invalidateQueries({ queryKey: lumaTriageQueryOptions(apiClient).queryKey }),
        client.invalidateQueries({ queryKey: engagementQueryKeys.events() }),
      ]);
    },
    onError: (error) => toast.error(appErrorMessage(error, translate)),
  });
  const choose = (level: number) => (place: ApplicationPlace) =>
    setPath([...path.slice(0, level), place]);
  return (
    <Dialog
      open={event !== null}
      onOpenChange={(open) => {
        if (open) return;
        setPath([]);
        onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate("admin.triage.associateTitle")}</DialogTitle>
          <DialogDescription>
            {translate("admin.triage.associateDescription", { title: event?.title ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <PlaceLevel
            level={0}
            options={roots}
            value={path[0]?.id ?? null}
            onChange={choose(0)}
            idPrefix="triage-place"
            testIdPrefix="admin-triage.place"
          />
          {path.map((place, index) => (
            <ChildLevel
              key={place.id}
              level={index + 1}
              parentId={place.id}
              value={path[index + 1]?.id ?? null}
              onChange={choose(index + 1)}
              idPrefix="triage-place"
              testIdPrefix="admin-triage.place"
            />
          ))}
        </div>
        <DialogFooter>
          <Button
            data-testid="admin-triage.save"
            disabled={!event || !selected || associate.isPending}
            onClick={() => {
              if (event && selected)
                associate.mutate({ activityId: event.id, placeId: selected.id });
            }}
          >
            {selected
              ? translate("admin.triage.saveTo", { place: selected.name })
              : translate("admin.triage.choosePlace")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
