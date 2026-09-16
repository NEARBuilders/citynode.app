import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { Button } from "@/components";

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
  return (
    <section className="flex flex-col gap-4 rounded-2xl border-2 border-border-strong bg-card p-5">
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
        <label className="block text-sm font-medium" htmlFor={`luma-calendar-${nodeId}`}>
          Choose a calendar
          <select
            id={`luma-calendar-${nodeId}`}
            data-testid="discovery-luma-calendar"
            value={connection?.calendarId ?? ""}
            disabled={refresh.isPending || disconnect.isPending}
            className="mt-2 block h-10 w-full rounded-[12px] border-2 border-inset border-border-strong bg-card px-3"
            onChange={(event) => {
              if (event.target.value) refresh.mutate(event.target.value);
            }}
          >
            <option value="" disabled>
              Select a calendar
            </option>
            {connection &&
              !calendars.data.calendars.some(
                (calendar) => calendar.id === connection.calendarId,
              ) && (
                <option value={connection.calendarId}>
                  {connection.calendarName} · unavailable
                </option>
              )}
            {calendars.data.calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </select>
        </label>
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
