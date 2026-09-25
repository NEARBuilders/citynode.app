import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/app";
import { Badge, Button, PageContainer, PageHeader } from "@/components";

type ApiClient = ReturnType<typeof useApiClient>;
type ThingEvent =
  Awaited<ReturnType<ApiClient["template"]["subscribeThings"]>> extends AsyncIterable<infer Event>
    ? Event
    : never;
type LiveThingEvent = { receiptId: number; event: ThingEvent };

export function ThingsLiveStreamPage() {
  const apiClient = useApiClient();
  const router = useRouter();
  const canGoBack = router.history.canGoBack?.() ?? false;
  const nextReceiptId = useRef(0);
  const [events, setEvents] = useState<LiveThingEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    setConnectionError(null);

    (async () => {
      try {
        const stream = await apiClient.template.subscribeThings({}, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setConnected(true);
        for await (const event of stream) {
          if (abort.signal.aborted) break;
          const receiptId = nextReceiptId.current++;
          setEvents((previous) => [{ receiptId, event }, ...previous].slice(0, 200));
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
                  <ArrowLeftIcon />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="icon-sm"
                  nativeButton={false}
                  render={<Link to="/things" />}
                >
                  <ArrowLeftIcon />
                </Button>
              )}
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  connected ? "bg-success" : "bg-destructive"
                }`}
                title={connected ? "Connected" : "Disconnected"}
              />
              <Button type="button" variant="ghost" size="xs" onClick={clearEvents}>
                Clear ({events.length})
              </Button>
            </div>
          }
        />

        <div className="space-y-1.5">
          {events.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-12">
              {connectionError ?? (connected ? "Waiting for Thing events..." : "Connecting...")}
            </p>
          )}
          {events.map(({ receiptId, event }) => (
            <div
              key={receiptId}
              className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="font-mono">
                    {event.action}
                  </Badge>
                  <span className="text-xs font-mono text-foreground font-semibold">
                    {event.thingId}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
