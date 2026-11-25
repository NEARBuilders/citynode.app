import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import { Button, Input, LocalDate, SectionHeader } from "@/components";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { SettingsRow } from "./-settings-row";

const DROP_ID = /^[A-Za-z0-9._:-]{1,128}$/;

type ShardDogDrops = Awaited<ReturnType<ApiClient["getShardDogDrops"]>>;

export const shardDogDropsQueryOptions = (api: ApiClient, organizationId: string) => ({
  queryKey: ["sharddog-drops", organizationId] as const,
  queryFn: () => api.getShardDogDrops({ organizationId }),
  staleTime: 30_000,
});

function DropForm({
  organizationId,
  eventId,
  current,
  label,
  testId,
}: {
  organizationId: string;
  eventId?: string;
  current: string | null;
  label: string;
  testId: string;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(current ?? "");
  const trimmed = value.trim();
  const invalid = trimmed.length > 0 && !DROP_ID.test(trimmed);
  const save = useMutation({
    mutationFn: (dropId: string | null) =>
      api.setShardDogDrop({ organizationId, ...(eventId ? { eventId } : {}), dropId }),
    onSuccess: (drops: ShardDogDrops, dropId) => {
      queryClient.setQueryData(shardDogDropsQueryOptions(api, organizationId).queryKey, drops);
      if (dropId === null) setValue("");
      toast.success(dropId === null ? translate("sharddog.cleared") : translate("sharddog.saved"));
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  return (
    <form
      className="flex max-w-md flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed && !invalid) save.mutate(trimmed);
      }}
      data-testid={testId}
    >
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={label}
          aria-invalid={invalid || undefined}
          placeholder={translate("sharddog.dropId")}
          value={value}
          maxLength={128}
          onChange={(event) => setValue(event.target.value)}
          className="min-w-0 flex-1"
          data-testid={`${testId}-input`}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={save.isPending || !trimmed || invalid || trimmed === current}
          data-testid={`${testId}-save`}
        >
          {save.isPending ? translate("common.saving") : translate("common.save")}
        </Button>
        {current && (
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => save.mutate(null)}
            data-testid={`${testId}-clear`}
          >
            {translate("common.remove")}
          </Button>
        )}
      </div>
      {invalid && <p className="text-sm text-destructive">{translate("sharddog.invalid")}</p>}
    </form>
  );
}

export function TenantShardDogDrops({ organizationId }: { organizationId: string }) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const drops = useQuery(shardDogDropsQueryOptions(api, organizationId));
  if (!drops.data?.enabled || !drops.data.canEdit) return null;
  const { membershipDropId, events } = drops.data;
  return (
    <section id="sharddog" className="flex scroll-mt-20 flex-col gap-2">
      <SectionHeader
        title={translate("sharddog.title")}
        description={translate("sharddog.description")}
        sectionTestId="tenant.section.sharddog"
      />
      <div className="flex flex-col">
        <SettingsRow
          label={translate("sharddog.membership")}
          description={translate("sharddog.membershipHint")}
          testId="tenant.sharddog.membership"
        >
          <DropForm
            organizationId={organizationId}
            current={membershipDropId}
            label={translate("sharddog.membership")}
            testId="tenant.sharddog.membership-form"
          />
        </SettingsRow>
        <SettingsRow label={translate("sharddog.events")} testId="tenant.sharddog.events">
          {events.length === 0 ? (
            <p className="text-muted-foreground">{translate("sharddog.noEvents")}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {events.map((event) => (
                <li key={event.eventId} className="flex flex-col gap-2">
                  <div className="flex flex-col">
                    <span className="font-medium">{event.title}</span>
                    {event.startsAt && (
                      <span className="text-muted-foreground">
                        <LocalDate value={event.startsAt} format="datetime" />
                      </span>
                    )}
                  </div>
                  <DropForm
                    key={`${event.eventId}:${event.dropId ?? ""}`}
                    organizationId={organizationId}
                    eventId={event.eventId}
                    current={event.dropId}
                    label={translate("sharddog.dropIdFor", { name: event.title })}
                    testId={`tenant.sharddog.event-${event.eventId}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </SettingsRow>
      </div>
    </section>
  );
}
