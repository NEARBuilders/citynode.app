import { eventEndsAt } from "@/lib/event-reports";

export type EventsWhen = "past" | "upcoming";

export const EVENTS_WHEN: readonly EventsWhen[] = ["past", "upcoming"];

type DatedEvent = { startsAt: string | null; endsAt: string | null; nodeId: string };

export function parseEventsWhen(value: unknown): EventsWhen | undefined {
  return EVENTS_WHEN.find((when) => when === value);
}

export function selectAdminEvents<E extends DatedEvent>(
  events: readonly E[],
  { when, nodeId, now }: { when: EventsWhen; nodeId?: string; now: number },
): E[] {
  const ended = (event: E) => eventEndsAt(event) < now;
  const selected = events.filter(
    (event) =>
      (when === "past" ? ended(event) : !ended(event)) && (!nodeId || event.nodeId === nodeId),
  );
  return when === "upcoming" ? [...selected].reverse() : selected;
}
