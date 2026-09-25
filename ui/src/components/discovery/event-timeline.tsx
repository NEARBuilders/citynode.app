import { MapPinIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type EventDateGroup, eventStartTime, type TimelineEvent } from "@/lib/event-timeline";
import { cn } from "@/lib/utils";

type TimelineItem = TimelineEvent & {
  id: string;
  title: string;
  source: string;
  venue: string;
  status: string;
};

function scrollParent(node: HTMLElement) {
  let current = node.parentElement;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

function useStuck() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const top = entry.rootBounds?.top ?? 0;
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top < top);
      },
      { root: scrollParent(node), threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { sentinel, stuck };
}

function DateHeader<T>({ group }: { group: EventDateGroup<T> }) {
  const { sentinel, stuck } = useStuck();
  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px" />
      <h3
        data-testid="activity-editor.date-group"
        data-stuck={stuck || undefined}
        className={cn(
          "sticky top-0 z-10 flex items-baseline gap-2 border-b border-transparent bg-background py-2",
          stuck && "border-border",
        )}
      >
        <span className="font-semibold text-foreground">{group.day}</span>
        {group.weekday && <span className="text-muted-foreground">{group.weekday}</span>}
        {group.year && <span className="text-muted-foreground">{group.year}</span>}
      </h3>
    </>
  );
}

export function EventTimeline<T extends TimelineItem>({
  groups,
  timeZone,
  badges,
  actions,
}: {
  groups: EventDateGroup<T>[];
  timeZone: string;
  badges: (event: T) => ReactNode;
  actions: (event: T) => ReactNode;
}) {
  return (
    <ol className="flex flex-col">
      {groups.map((group) => (
        <li key={group.key} className="relative flex flex-col gap-3 pb-8 pl-6 last:pb-0">
          <span
            aria-hidden
            className="absolute top-6 bottom-0 left-1 w-px -translate-x-1/2 bg-border"
          />
          <span
            aria-hidden
            className="absolute top-4 left-0 size-2 rounded-full bg-muted-foreground/60"
          />
          <DateHeader group={group} />
          {group.events.map((event) => {
            const start = eventStartTime(event, { timeZone });
            const cancelled = event.status === "cancelled";
            return (
              <article
                key={event.id}
                data-testid={`activity-editor.event-${event.id}`}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className={cn("flex min-w-0 flex-col gap-1", cancelled && "opacity-60")}>
                  {start && (
                    <p className="text-sm text-muted-foreground">
                      {start.time}
                      {start.eventLocal && (
                        <span className="text-muted-foreground/70"> · {start.eventLocal}</span>
                      )}
                    </p>
                  )}
                  <h4
                    className={cn(
                      "text-base font-semibold leading-snug break-words",
                      cancelled && "line-through",
                    )}
                  >
                    {event.title}
                  </h4>
                  {event.source && (
                    <p className="text-sm text-muted-foreground">By {event.source}</p>
                  )}
                  {event.venue && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPinIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{event.venue}</span>
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1.5">{badges(event)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">{actions(event)}</div>
              </article>
            );
          })}
        </li>
      ))}
    </ol>
  );
}
