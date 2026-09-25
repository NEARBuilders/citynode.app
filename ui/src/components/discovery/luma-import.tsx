import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { Button } from "@/components";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LumaImport({ nodeId }: { nodeId: string }) {
  const api = useApiClient();
  const client = useQueryClient();
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
    onSuccess: () =>
      client.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("discovery"),
      }),
  });
  const connection = calendars.data?.connection;
  const calendarItems = [
    ...(connection &&
    !calendars.data?.calendars.some((calendar) => calendar.id === connection.calendarId)
      ? [
          {
            label: `${connection.calendarName} · unavailable`,
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
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h3 className="font-semibold">Luma calendar</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Bring in public events from Luma. Change times and details there — they stay in sync here.
        </p>
      </div>
      {calendars.isPending && (
        <p className="text-sm text-muted-foreground">Looking for calendars…</p>
      )}
      {calendars.isError && <p role="alert">Couldn’t load calendars. Try again in a moment.</p>}
      {calendars.data?.unavailableCount ? (
        <p role="alert">Some calendars couldn’t be loaded. Try again later.</p>
      ) : null}
      {calendars.data?.calendars.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No calendars are available yet. You can still add an event above. Ask whoever looks after
          this site if you want events from Luma.
        </p>
      )}
      {calendars.data && calendars.data.calendars.length > 0 && (
        <Field>
          <FieldLabel htmlFor={`luma-calendar-${nodeId}`}>Choose a calendar</FieldLabel>
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
              <SelectValue placeholder="Select a calendar" />
            </SelectTrigger>
            <SelectContent>
              {calendarItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {refresh.isPending && <p role="status">Connecting calendar and loading events…</p>}
      {connection && (
        <div className="flex flex-col gap-3 rounded-xl bg-muted/50 px-4 py-3 text-sm">
          <p role="status">
            Connected to {connection.calendarName}. Public events appear automatically.
          </p>
          <p className="text-muted-foreground">
            Last updated {new Date(connection.syncedAt).toLocaleString()}.
          </p>
          {connection.error && (
            <p role="alert">Couldn’t update events from Luma. Try again later.</p>
          )}
          <Button
            variant="outline"
            size="sm"
            data-testid="discovery-luma-disconnect"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            Disconnect calendar
          </Button>
          <p className="text-xs text-muted-foreground">
            Disconnecting takes these Luma events off Explore. Events you added yourself stay.
          </p>
        </div>
      )}
      {disconnect.isError && <p role="alert">Couldn’t disconnect the calendar. Try again.</p>}
      {refresh.isError && <p role="alert">Couldn’t connect that calendar. Try again.</p>}
    </section>
  );
}
