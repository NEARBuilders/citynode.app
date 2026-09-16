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
  });
  const refresh = useMutation({
    mutationFn: (calendarId: string) => api.importDiscoveryLuma({ nodeId, calendarId }),
    onSuccess: () =>
      client.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("discovery"),
      }),
  });
  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="font-semibold">Import from Luma</h3>
      <p className="text-sm text-muted-foreground">
        Import public calendar events as drafts. Refresh to pull the latest details from Luma;
        publish reviewed events below. Manual events remain separate.
      </p>
      {calendars.isPending && <p>Loading connected calendars…</p>}
      {calendars.isError && <p role="alert">Unable to load Luma calendars.</p>}
      {calendars.data?.unavailableCount ? (
        <p role="alert">
          Some Luma calendars are unavailable. Try again later or ask your administrator to check
          the connection.
        </p>
      ) : null}
      {calendars.data?.calendars.length === 0 && (
        <p>No connected Luma calendars. Ask your administrator to connect a calendar.</p>
      )}
      {calendars.data && calendars.data.calendars.length > 0 && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            refresh.mutate(String(new FormData(event.currentTarget).get("calendarId")));
          }}
        >
          <label className="block" htmlFor={`luma-calendar-${nodeId}`}>
            Luma calendar
            <select
              id={`luma-calendar-${nodeId}`}
              name="calendarId"
              className="ml-3 rounded border border-border bg-background p-2"
              required
            >
              {calendars.data.calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </select>
          </label>
          <Button data-testid="discovery-luma-import" disabled={refresh.isPending}>
            {refresh.isPending ? "Importing…" : "Import / refresh calendar"}
          </Button>
        </form>
      )}
      {refresh.isError && <p role="alert">{refresh.error.message}</p>}
      {refresh.data && (
        <p role="status">
          {refresh.data.imported} imported · {refresh.data.updated} refreshed ·{" "}
          {refresh.data.withdrawn} withdrawn · {refresh.data.skipped} existing URLs skipped
        </p>
      )}
    </section>
  );
}
