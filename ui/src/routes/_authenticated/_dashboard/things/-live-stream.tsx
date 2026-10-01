import { BroadcastIcon } from "@phosphor-icons/react";
import { Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/app";
import { Badge, Button, EmptyState, LocalDate, PageContainer, PageHeader } from "@/components";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/i18n/runtime";
import { ThingBackLink } from "./-thing-details-view";

type ApiClient = ReturnType<typeof useApiClient>;
type ThingEvent =
  Awaited<ReturnType<ApiClient["template"]["subscribeThings"]>> extends AsyncIterable<infer Event>
    ? Event
    : never;
type LiveThingEvent = { receiptId: number; event: ThingEvent };

function actionVariant(action: string) {
  if (action === "created") return "success" as const;
  if (action === "deleted") return "destructive" as const;
  return "secondary" as const;
}

export function ThingsLiveStreamPage() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const router = useRouter();
  const canGoBack = router.history.canGoBack?.() ?? false;
  const nextReceiptId = useRef(0);
  const [events, setEvents] = useState<LiveThingEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setConnectionError(false);

    void (async () => {
      try {
        const stream = await apiClient.template.subscribeThings({}, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setConnected(true);
        for await (const event of stream) {
          if (abort.signal.aborted) break;
          const receiptId = nextReceiptId.current++;
          setEvents((previous) => [{ receiptId, event }, ...previous].slice(0, 200));
        }
      } catch {
        if (!abort.signal.aborted) {
          setConnectionError(true);
        }
      } finally {
        if (!abort.signal.aborted) setConnected(false);
      }
    })();

    return () => abort.abort();
  }, [apiClient, attempt]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return (
    <PageContainer variant="default">
      <div className="flex flex-col gap-4">
        <ThingBackLink canGoBack={canGoBack} onBack={() => router.history.back()} />
        <PageHeader
          title={translate("things.stream")}
          description={translate("things.streamDescription")}
          headerTestId="things.live.heading"
          actions={
            <>
              <Badge
                variant={connected ? "success" : connectionError ? "destructive" : "secondary"}
                title={connected ? translate("things.connected") : translate("things.disconnected")}
                className="self-center"
                data-testid="things-live-status"
              >
                {connected
                  ? translate("nav.live")
                  : connectionError
                    ? translate("things.disconnected")
                    : translate("things.connecting")}
              </Badge>
              <Button
                type="button"
                variant="outline"
                onClick={clearEvents}
                disabled={events.length === 0}
                data-testid="things-live-clear"
              >
                {translate("things.clearCount", { count: events.length })}
              </Button>
            </>
          }
        />
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={BroadcastIcon}
          title={
            connectionError
              ? translate("things.streamDisconnected")
              : connected
                ? translate("things.waiting")
                : translate("things.connecting")
          }
          description={
            connectionError
              ? translate("things.streamEnded")
              : connected
                ? translate("things.streamHint")
                : ""
          }
          action={
            connectionError ? (
              <Button
                variant="outline"
                onClick={() => setAttempt((value) => value + 1)}
                data-testid="things-live-reconnect"
              >
                {translate("things.reconnect")}
              </Button>
            ) : connected ? undefined : (
              <Spinner />
            )
          }
        />
      ) : (
        <ItemGroup data-testid="things-live-events">
          {events.map(({ receiptId, event }) => (
            <Item key={receiptId} variant="outline" size="sm" role="listitem">
              <ItemContent className="min-w-0">
                <ItemTitle className="max-w-full">
                  <Badge variant={actionVariant(event.action)}>
                    {event.action === "created"
                      ? translate("things.actionCreated")
                      : event.action === "deleted"
                        ? translate("things.actionDeleted")
                        : translate("things.actionUpdated")}
                  </Badge>
                  <Link
                    to="/things/$thingId"
                    params={{ thingId: event.thingId }}
                    className="truncate font-mono text-foreground underline-offset-4 hover:underline"
                  >
                    {event.thingId}
                  </Link>
                </ItemTitle>
                <ItemDescription>
                  <span className="font-mono">{event.type}</span>
                  <span aria-hidden="true"> · </span>
                  <LocalDate value={event.timestamp} format="time" />
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </PageContainer>
  );
}
