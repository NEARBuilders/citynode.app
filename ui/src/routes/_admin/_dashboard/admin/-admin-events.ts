import { eventEndsAt } from "@/lib/event-reports";

export type EventsWhen = "past" | "upcoming";

export const EVENTS_WHEN: readonly EventsWhen[] = ["past", "upcoming"];

type DatedEvent = { startsAt: string | null; endsAt: string | null; nodeId: string };

export type EventsReportFilter = "missing" | "review";

export function parseEventsWhen(value: unknown): EventsWhen | undefined {
  return EVENTS_WHEN.find((when) => when === value);
}

export function parseEventsReportFilter(value: unknown): EventsReportFilter | undefined {
  return value === "missing" || value === "review" ? value : undefined;
}

export function selectAdminEvents<E extends DatedEvent>(
  events: readonly E[],
  { when, nodeId, month, now }: { when: EventsWhen; nodeId?: string; month?: string; now: number },
): E[] {
  const ended = (event: E) => eventEndsAt(event) < now;
  const selected = events.filter(
    (event) =>
      (when === "past" ? ended(event) : !ended(event)) &&
      (!nodeId || event.nodeId === nodeId) &&
      (!month || event.startsAt?.slice(0, 7) === month),
  );
  return when === "upcoming" ? [...selected].reverse() : selected;
}
