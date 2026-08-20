import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useApiClient } from "@/app";
import { Badge, PageContainer, PageHeader } from "@/components";

export const Route = createFileRoute("/_layout/_public/things/live")({
  head: () => ({
    meta: [
      { title: "Live Stream | Things | everything.dev" },
      { name: "description", content: "Real-time event stream from the template plugin." },
    ],
  }),
  component: LiveStreamPage,
});

type ThingEvent = {
  id: string;
  index: number;
  timestamp: number;
};

function LiveStreamPage() {
  const apiClient = useApiClient();
  const router = useRouter();
  const canGoBack = router.history.canGoBack?.() ?? false;
  const [events, setEvents] = useState<ThingEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setConnected(true);

    const templateClient = apiClient.template;

    if (!templateClient) {
      setConnected(false);
      return;
    }

    const abort = new AbortController();

    (async () => {
      try {
        const stream = await templateClient.listenBackground({});
        for await (const event of stream) {
          if (abort.signal.aborted) break;
          setEvents((prev) => [event as ThingEvent, ...prev].slice(0, 200));
        }
      } catch {
        // stream ended
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
                <button
                  type="button"
                  onClick={() => router.history.back()}
                  className="flex items-center justify-center w-8 h-8 border-2 border-outset border-border-strong bg-card shadow-sm rounded-[10px] hover:bg-muted"
                >
                  <ArrowLeft size={14} />
                </button>
              ) : (
                <a
                  href="/things"
                  className="flex items-center justify-center w-8 h-8 border-2 border-outset border-border-strong bg-card shadow-sm rounded-[10px] hover:bg-muted"
                >
                  <ArrowLeft size={14} />
                </a>
              )}
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  connected ? "bg-green-500" : "bg-destructive"
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
              {connected ? "Waiting for events..." : "Disconnected"}
            </p>
          )}
          {events.map((event, i) => (
            <div
              key={`${event.id}-${event.index}-${i}`}
              className="flex items-start gap-2 rounded-[6px] border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    #{event.index}
                  </Badge>
                  <span className="text-[10px] font-mono text-foreground font-semibold">
                    {event.id}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
