import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/app";
import { Badge } from "@/components";

export const Route = createFileRoute("/_layout/things/live")({
  head: () => ({
    meta: [
      { title: "Live Stream | Things | everything.dev" },
      { name: "description", content: "Real-time SSE event stream for the thing registry." },
    ],
  }),
  component: LiveStreamPage,
});

type ThingEvent = {
  thingId: string;
  pluginId: string;
  type: string;
  action: string;
  timestamp: string;
  userId?: string;
  totalCount?: number;
};

function LiveStreamPage() {
  const apiClient = useApiClient();
  const router = useRouter();
  const canGoBack = router.history.canGoBack?.() ?? false;
  const [events, setEvents] = useState<ThingEvent[]>([]);
  const [filterPluginId, setFilterPluginId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConnected(true);

    const abort = new AbortController();

    (async () => {
      try {
        const stream = apiClient.subscribeThings({
          pluginId: filterPluginId || undefined,
          type: filterType || undefined,
          action: filterAction || undefined,
        }) as unknown as AsyncIterable<ThingEvent>;

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
  }, [apiClient, filterPluginId, filterType, filterAction]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 sm:px-6 sm:py-3">
        <div className="flex items-center gap-2 min-w-0">
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
          <h1 className="text-sm font-semibold text-foreground truncate">Live stream</h1>
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${
              connected ? "bg-green-500" : "bg-destructive"
            }`}
            title={connected ? "Connected" : "Disconnected"}
          />
        </div>

        <button
          type="button"
          onClick={clearEvents}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear ({events.length})
        </button>
      </div>

      <div className="shrink-0 flex flex-wrap gap-2 border-b border-border bg-muted/20 px-4 py-2">
        <FilterInput
          placeholder="pluginId"
          value={filterPluginId}
          onChange={setFilterPluginId}
        />
        <FilterInput placeholder="type" value={filterType} onChange={setFilterType} />
        <FilterInput placeholder="action" value={filterAction} onChange={setFilterAction} />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {events.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-12">
            {connected ? "Waiting for events..." : "Disconnected"}
          </p>
        )}
        {events.map((event, i) => (
          <div
            key={`${event.thingId}-${event.timestamp}-${i}`}
            className="flex items-start gap-2 rounded-[6px] border border-border bg-card px-3 py-2"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {event.pluginId}
                </Badge>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {event.type}
                </Badge>
                <span className="text-[10px] font-mono text-foreground font-semibold">
                  {event.action}
                </span>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground truncate">
                {event.thingId}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {new Date(event.timestamp).toLocaleTimeString()}
                {event.userId && <> &middot; {event.userId.slice(0, 8)}</>}
                {event.totalCount !== undefined && <> &middot; {event.totalCount} votes</>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-[6px] border border-border bg-background px-2 py-1 text-xs font-mono text-foreground outline-none placeholder:text-muted-foreground w-28"
    />
  );
}
