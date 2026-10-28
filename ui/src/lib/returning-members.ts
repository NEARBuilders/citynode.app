export const ONBOARDING_CODE_LIST_LIMIT = 20;

export type EventCodeListing = {
  eventId: string;
  codes: ReadonlyArray<{ id: string; eventId: string | null }>;
};

export type CodeCheckIns = {
  eventId: string | null;
  joined: ReadonlyArray<{ userId: string }>;
};

export type ReturningMembers =
  | { kind: "no-codes" }
  | { kind: "no-check-ins"; mayBeIncomplete: boolean; readAt: string }
  | {
      kind: "ready";
      returning: number;
      total: number;
      mayBeIncomplete: boolean;
      readAt: string;
    };

export function eligibleCodes(
  eventIds: ReadonlySet<string>,
  listings: ReadonlyArray<EventCodeListing>,
) {
  const seen = new Set<string>();
  return listings.flatMap((listing) =>
    listing.codes.filter((code) => {
      if (!code.eventId || !eventIds.has(code.eventId) || seen.has(code.id)) return false;
      seen.add(code.id);
      return true;
    }),
  );
}

export function summarizeReturningMembers({
  eventIds,
  listings,
  checkIns,
  readAt,
}: {
  eventIds: ReadonlySet<string>;
  listings: ReadonlyArray<EventCodeListing>;
  checkIns: ReadonlyArray<CodeCheckIns>;
  readAt: string;
}): ReturningMembers {
  if (eligibleCodes(eventIds, listings).length === 0) return { kind: "no-codes" };
  const mayBeIncomplete = listings.some(
    (listing) => listing.codes.length >= ONBOARDING_CODE_LIST_LIMIT,
  );
  const eventsByUser = new Map<string, Set<string>>();
  for (const code of checkIns) {
    if (!code.eventId || !eventIds.has(code.eventId)) continue;
    for (const { userId } of code.joined) {
      const events = eventsByUser.get(userId) ?? new Set<string>();
      events.add(code.eventId);
      eventsByUser.set(userId, events);
    }
  }
  const total = eventsByUser.size;
  if (total === 0) return { kind: "no-check-ins", mayBeIncomplete, readAt };
  const returning = [...eventsByUser.values()].filter((events) => events.size >= 2).length;
  return { kind: "ready", returning, total, mayBeIncomplete, readAt };
}
