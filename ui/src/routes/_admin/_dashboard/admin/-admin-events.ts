import { eventEndsAt } from "@/lib/event-reports";

export type EventsWhen = "past" | "upcoming";

export const EVENTS_WHEN: readonly EventsWhen[] = ["past", "upcoming"];

type CommunityEvent = { nodeId: string; organizationId: string | null };

type DatedEvent = CommunityEvent & { startsAt: string | null; endsAt: string | null };

export type EventsReportFilter = "missing" | "review";

export function eventCommunity(event: CommunityEvent) {
  return event.organizationId ?? event.nodeId;
}

export function resolveEventsCommunity(
  events: readonly CommunityEvent[],
  community: string | undefined,
) {
  if (!community) return undefined;
  const onNode = events.find((event) => event.nodeId === community);
  return onNode ? eventCommunity(onNode) : community;
}

export function eventCommunities(events: readonly (CommunityEvent & { nodeName: string })[]) {
  const nodes = new Map<string, Map<string, string>>();
  for (const event of events) {
    const key = eventCommunity(event);
    const names = nodes.get(key) ?? new Map<string, string>();
    names.set(event.nodeId, event.nodeName);
    nodes.set(key, names);
  }
  return [...nodes.entries()]
    .map(([key, names]): [string, string] => [
      key,
      [...names.values()].sort((a, b) => a.localeCompare(b)).join(", "),
    ])
    .sort((a, b) => a[1].localeCompare(b[1]));
}

export function parseEventsWhen(value: unknown): EventsWhen | undefined {
  return EVENTS_WHEN.find((when) => when === value);
}

export function parseEventsReportFilter(value: unknown): EventsReportFilter | undefined {
  return value === "missing" || value === "review" ? value : undefined;
}

export function selectAdminEvents<E extends DatedEvent>(
  events: readonly E[],
  {
    when,
    community,
    month,
    now,
  }: { when: EventsWhen; community?: string; month?: string; now: number },
): E[] {
  const ended = (event: E) => eventEndsAt(event) < now;
  const selectedCommunity = resolveEventsCommunity(events, community);
  const selected = events.filter(
    (event) =>
      (when === "past" ? ended(event) : !ended(event)) &&
      (!selectedCommunity || eventCommunity(event) === selectedCommunity) &&
      (!month || event.startsAt?.slice(0, 7) === month),
  );
  return when === "upcoming" ? [...selected].reverse() : selected;
}
