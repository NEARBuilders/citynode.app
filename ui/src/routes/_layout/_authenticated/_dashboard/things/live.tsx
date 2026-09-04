import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useApiClient } from "@/app";
import { Badge, Button, PageContainer, PageHeader } from "@/components";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/things/live")({
  head: () => ({
    meta: [
      { title: "Live Stream | Things | app" },
      { name: "description", content: "Real-time Thing creation and deletion events." },
    ],
  }),
  component: ThingsLiveStreamPage,
});

type ApiClient = ReturnType<typeof useApiClient>;
type ThingEvent =
  Awaited<ReturnType<ApiClient["template"]["subscribeThings"]>> extends AsyncIterable<infer Event>
    ? Event
    : never;

function ThingsLiveStreamPage() {
  const apiClient = useApiClient();
  const router = useRouter();
  const canGoBack = router.history.canGoBack?.() ?? false;
  const [events, setEvents] = useState<ThingEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    setConnectionError(null);

    (async () => {
      try {
        const stream = await apiClient.template.subscribeThings({}, { signal: abort.signal });
        setConnected(true);
        for await (const event of stream) {
          if (abort.signal.aborted) break;
          setEvents((previous) => [event, ...previous].slice(0, 200));
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          setConnectionError(error instanceof Error ? error.message : "The event stream ended.");
        }
      } finally {
        if (!abort.signal.aborted) setConnected(false);
      }
    })();

    return () => abort.abort();
  }, [apiClient]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return (
    <PageContainer variant="default">
      <div className="space-y-4">
        <PageHeader
          title="Live stream"
          actions={
            <div className="flex items-center gap-2">
              {canGoBack ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => router.history.back()}
                >
                  <ArrowLeft />
                </Button>
              ) : (
                <Button asChild variant="outline" size="icon-sm">
                  <Link to="/things">
                    <ArrowLeft />
                  </Link>
                </Button>
              )}
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  connected ? "bg-status-success-border" : "bg-destructive"
                }`}
                title={connected ? "Connected" : "Disconnected"}
              />
              <button
                type="button"
                onClick={clearEvents}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear ({events.length})
              </button>
            </div>
          }
        />

        <div className="space-y-1.5">
          {events.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-12">
              {connectionError ?? (connected ? "Waiting for Thing events..." : "Connecting...")}
            </p>
          )}
          {events.map((event, index) => (
            <div
              key={`${event.thingId}-${event.timestamp}-${index}`}
              className="flex items-start gap-2 rounded-[6px] border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {event.action}
                  </Badge>
                  <span className="text-[10px] font-mono text-foreground font-semibold">
                    {event.thingId}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-mono">{event.type}</span>
                  <span aria-hidden="true">·</span>
                  <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
