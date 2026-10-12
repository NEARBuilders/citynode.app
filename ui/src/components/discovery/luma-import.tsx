import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useApiClient } from "@/app";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";

export function LumaImport({ nodeId }: { nodeId: string }) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const api = useApiClient();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const calendars = useQuery({
    queryKey: ["discovery-luma-calendars", nodeId],
    queryFn: () => api.listDiscoveryLumaCalendars({ nodeId }),
    retry: false,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const refresh = useMutation({
    mutationFn: (calendarId: string) => api.importDiscoveryLuma({ nodeId, calendarId }),
    onSuccess: () =>
      client.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("discovery"),
      }),
  });
  const disconnect = useMutation({
    mutationFn: () => api.disconnectDiscoveryLuma({ nodeId }),
    onSuccess: () => {
      refresh.reset();
      return client.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("discovery"),
      });
    },
  });
  const connection = calendars.data?.connection;
  const importLines = refresh.data
    ? describeImport(refresh.data, translate, locale.startsWith("zh") ? "" : " ")
    : [];
  const calendarItems = [
    ...(connection &&
    !calendars.data?.calendars.some((calendar) => calendar.id === connection.calendarId)
      ? [
          {
            label: translate("events.calendarUnavailable", { name: connection.calendarName ?? "" }),
            value: connection.calendarId,
          },
        ]
      : []),
    ...(calendars.data?.calendars ?? []).map((calendar) => ({
      label: calendar.name,
      value: calendar.id,
    })),
  ];
  return (
    <div className="flex flex-col gap-4">
      {calendars.isPending && <Skeleton className="h-11 w-full" />}
      {calendars.isError && (
        <p role="alert" className="text-sm text-destructive">
          {translate("calendar.loadError")}
        </p>
      )}
      {calendars.data?.unavailableCount ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {translate("calendar.partialError")}
        </p>
      ) : null}
      {calendars.data?.calendars.length === 0 && !connection && (
        <p className="text-sm text-muted-foreground">{translate("calendar.empty")}</p>
      )}
      {calendars.data && (calendars.data.calendars.length > 0 || connection) && (
        <Field>
          <FieldLabel htmlFor={`luma-calendar-${nodeId}`}>{translate("calendar.title")}</FieldLabel>
          <Select
            items={calendarItems}
            value={connection?.calendarId ?? null}
            disabled={refresh.isPending || disconnect.isPending}
            onValueChange={(value) => {
              if (value) refresh.mutate(value);
            }}
          >
            <SelectTrigger
              id={`luma-calendar-${nodeId}`}
              data-testid="discovery-luma-calendar"
              className="w-full"
            >
              <SelectValue placeholder={translate("calendar.choose")} />
            </SelectTrigger>
            <SelectContent>
              {calendarItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {connection && (
            <FieldDescription role="status">
              {refresh.isPending ? (
                translate("calendar.loadingEvents")
              ) : (
                <>
                  {translate("common.updated")}
                  <LocalDate value={connection.syncedAt} format="relative" />
                  {connection.error ? translate("calendar.lastUpdateFailed") : ""}
                </>
              )}
            </FieldDescription>
          )}
        </Field>
      )}
      {refresh.isSuccess && (
        <div
          role="status"
          className="flex flex-col gap-1 text-sm text-muted-foreground"
          data-testid="luma-import.result"
        >
          {importLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
      {!connection && refresh.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          {translate("calendar.connecting")}
        </p>
      )}
      {refresh.isError && (
        <p role="alert" className="text-sm text-destructive">
          {translate("calendar.connectError")}
        </p>
      )}
      {disconnect.isError && (
        <p role="alert" className="text-sm text-destructive">
          {translate("calendar.disconnectError")}
        </p>
      )}
      {connection && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          data-testid="discovery-luma-disconnect"
          disabled={disconnect.isPending}
          onClick={() => setConfirming(true)}
        >
          {translate("calendar.disconnect")}
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={translate("calendar.disconnectTitle")}
        description={translate("calendar.disconnectDescription")}
        confirmLabel={translate("common.disconnect")}
        cancelLabel={translate("common.cancel")}
        variant="destructive"
        isPending={disconnect.isPending}
        onConfirm={() => disconnect.mutate(undefined, { onSettled: () => setConfirming(false) })}
      />
    </div>
  );
}

function describeImport(
  result: { imported: number; updated: number; withdrawn: number; skipped: number },
  translate: ReturnType<typeof useAppTranslation>,
  separator: string,
) {
  const existing = [
    ...(result.updated ? [translate("calendar.updatedEvents", { count: result.updated })] : []),
    ...(result.skipped ? [translate("calendar.skippedEvents", { count: result.skipped })] : []),
  ];
  const lines = result.imported
    ? [
        `${translate("calendar.imported", { count: result.imported })}${separator}${translate("events.importsWaitingHint")}`,
        ...existing,
      ]
    : existing.map((line, index) =>
        index === 0 ? `${translate("calendar.noNewEvents")}${separator}${line}` : line,
      );
  if (result.withdrawn)
    lines.push(translate("calendar.withdrawnEvents", { count: result.withdrawn }));
  return lines.length ? lines : [translate("calendar.nothingChanged")];
}
