export type TimelineEvent = {
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
};

export type ViewerClock = {
  now: Date;
  timeZone: string;
  locale?: string;
};

export type EventDateGroup<T> = {
  key: string;
  day: string;
  weekday: string;
  year: string | null;
  events: T[];
};

export type EventTimeline<T> = {
  upcoming: EventDateGroup<T>[];
  past: EventDateGroup<T>[];
  upcomingCount: number;
  pastCount: number;
};

function clean(text: string) {
  return text.replace(/[  ]/g, " ");
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((p) => p.type === type)?.value ?? "";
}

function dayParts(instant: Date, timeZone: string, locale?: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "long",
  }).formatToParts(instant);
  const numeric = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return {
    key: numeric,
    day: new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric" }).format(
      instant,
    ),
    weekday: part(parts, "weekday"),
    year: part(parts, "year"),
  };
}

function group<T extends TimelineEvent>(events: T[], clock: ViewerClock, t: AppTranslator) {
  const currentYear = dayParts(clock.now, clock.timeZone, clock.locale).year;
  const groups: EventDateGroup<T>[] = [];
  for (const event of events) {
    const current = event.startsAt
      ? dayParts(new Date(event.startsAt), clock.timeZone, clock.locale)
      : null;
    const key = current?.key ?? "undated";
    const last = groups.at(-1);
    if (last?.key === key) {
      last.events.push(event);
      continue;
    }
    groups.push({
      key,
      day: current?.day ?? t("events.dateTba"),
      weekday: current?.weekday ?? "",
      year: current && current.year !== currentYear ? current.year : null,
      events: [event],
    });
  }
  return groups;
}

function startOf(event: TimelineEvent) {
  return event.startsAt ? Date.parse(event.startsAt) : Number.POSITIVE_INFINITY;
}

export function buildEventTimeline<T extends TimelineEvent>(
  events: readonly T[],
  clock: ViewerClock,
  t: AppTranslator = translateEnglishAppMessage,
): EventTimeline<T> {
  const now = clock.now.getTime();
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const event of events) {
    const boundary = event.endsAt ?? event.startsAt;
    if (boundary && Date.parse(boundary) < now) past.push(event);
    else upcoming.push(event);
  }
  upcoming.sort((a, b) => startOf(a) - startOf(b));
  past.sort((a, b) => startOf(b) - startOf(a));
  return {
    upcoming: group(upcoming, clock, t),
    past: group(past, clock, t),
    upcomingCount: upcoming.length,
    pastCount: past.length,
  };
}

function offset(instant: Date, timeZone: string) {
  return part(
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(
      instant,
    ),
    "timeZoneName",
  );
}

export function eventStartTime(
  event: TimelineEvent,
  viewer: { timeZone: string; locale?: string },
) {
  if (!event.startsAt) return null;
  const instant = new Date(event.startsAt);
  const time = clean(
    new Intl.DateTimeFormat(viewer.locale, {
      timeZone: viewer.timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(instant),
  );
  const eventLocal =
    offset(instant, event.timezone) === offset(instant, viewer.timeZone)
      ? null
      : clean(
          new Intl.DateTimeFormat(viewer.locale, {
            timeZone: event.timezone,
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "shortOffset",
          }).format(instant),
        );
  return { time, eventLocal };
}

import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
